import { ParamId } from "../devices/vfd-v/paramIds.js";
import type { ParameterRegistry } from "../parameters/ParameterRegistry.js";
import {
  VfdVEvent,
  VfdVState
} from "./state/VfdVState.js";
import { VfdStateMachine } from "./state/VfdStateMachine.js";
import {
  createDefaultVfdVInputs,
  createInitialVfdVState,
  type VfdVPhysicalInputs,
  type VfdVRuntimeState
} from "./state/VfdRuntimeState.js";
import type { ConflictRule } from "./command/DigitalCommandEngine.js";
import { CommandSourceManager } from "./command/CommandSourceManager.js";
import { AnalogCommandEngine } from "./command/AnalogCommandEngine.js";
import { CommunicationCommandEngine } from "./command/CommunicationCommandEngine.js";
import { FrequencyCommandEngine } from "./frequency/FrequencyCommandEngine.js";
import { AccelerationController } from "./frequency/AccelerationController.js";
import { DecelerationController } from "./frequency/DecelerationController.js";
import { VFController } from "./voltage/VFController.js";
import { DcBusModel } from "./voltage/DcBusModel.js";
import { MotorModel } from "./motor/MotorModel.js";
import { TorqueModel } from "./motor/TorqueModel.js";
import {
  VFD_V_REFERENCE_MODEL,
  type VfdVMotorModelConfig
} from "./modelConstants.js";
import { DigitalInputProcessor } from "./io/DigitalInputProcessor.js";
import { AnalogInputProcessor } from "./io/AnalogInputProcessor.js";
import { RelayOutputProcessor, type RelayContext } from "./io/RelayOutputProcessor.js";
import { OverCurrentProtection } from "./protection/OverCurrentProtection.js";
import { OverVoltageProtection } from "./protection/OverVoltageProtection.js";
import { UnderVoltageProtection } from "./protection/UnderVoltageProtection.js";
import { PhaseLossProtection } from "./protection/PhaseLossProtection.js";
import { OverTorqueProtection } from "./protection/OverTorqueProtection.js";
import { OverloadProtection } from "./protection/OverloadProtection.js";
import { ThermalProtection } from "./protection/ThermalProtection.js";
import { ExternalFaultProtection } from "./protection/ExternalFaultProtection.js";
import { FaultManager } from "./faults/FaultManager.js";
import { FaultCodes } from "../devices/vfd-v/faultCodes.js";
import { encodeFaultRecord } from "../devices/vfd-v/faultRecordValues.js";
import { VfdRs485Interface } from "./communication/VfdRs485Interface.js";
import { VfdMonitorValues } from "./monitoring/VfdMonitorValues.js";
import {
  VFD_V_CORE_PARAMETERS,
  assertSchemaProvenanceComplete
} from "../devices/vfd-v/schema/index.js";

/**
 * VFD-V runtime simulation engine (core version).
 *
 * Deterministic, headless, time-step independent. The ONLY way to
 * advance the simulation is `update(dt)`; the same initial state,
 * parameters, input sequence and dt sequence always produce the same
 * result (no wall-clock, no randomness — core specification §27/§33).
 *
 * UPDATE ORDER (documented, per core specification §26):
 *
 *   1.  Read parameters (ParameterRegistry — single source of truth)
 *   2.  Read physical inputs (digital/analog processors)
 *   3.  Resolve the operation command (00-21, 02-00, 00-23)
 *   4.  Resolve the frequency command (00-20; AVI through 03-xx)
 *   5.  Apply frequency limits (01-00/01-09/01-10/01-11 -> target)
 *   6.  Process acceleration/deceleration (01-12/01-13; 00-22 stop)
 *   7.  Calculate V/F output voltage (01-00..01-08, 05-03)
 *   8.  Calculate motor torque (slip characteristic, 05-05)
 *   9.  Calculate motor speed (J dω/dt: inertia, load, friction)
 *   10. Calculate current (05-01, 05-02)
 *   11. Calculate DC bus voltage (phase state, regeneration, bleed)
 *   12. Update thermal model (06-13/06-14/06-15, I²t)
 *   13. Evaluate protection (06-00..06-08, external fault)
 *   14. Update fault manager (FAULT/FAULT_RESET events, 06-17..06-20)
 *   15. Update relay outputs (02-11/02-12/02-13)
 *   16. Publish runtime state (monitor values)
 *
 * The state machine owns WHERE transitions go; this engine owns WHICH
 * event to emit (guards based on the resolved commands and physics).
 */

/** Frequency comparison tolerance (Hz). */
const FREQ_EPSILON = 1e-6;
/** Motor standstill tolerance for SPEED_ZERO (RPM). */
const STANDSTILL_RPM = 1;
/** Load range accepted by setLoadPercent (task example includes 150%). */
const LOAD_MIN_PERCENT = 0;
const LOAD_MAX_PERCENT = 200;

/** Parameters the engine reads — all must have non-null schema defaults. */
const ENGINE_BOUND_PARAMETERS: readonly string[] = [
  ParamId.frequencyCommandSource,
  ParamId.operationCommandSource,
  ParamId.stopMethod,
  ParamId.reverseOperation,
  ParamId.maxOperationFrequency,
  ParamId.maxOperationVoltage,
  ParamId.minOutputFrequency,
  ParamId.upperBoundFrequency,
  ParamId.lowerBoundFrequency,
  ParamId.firstAccelerationTime,
  ParamId.firstDecelerationTime,
  ParamId.externalTerminalControlMode,
  ParamId.relayFunctionRA,
  ParamId.relayFunctionRB,
  ParamId.relayFunctionRC,
  ParamId.aviFunction,
  ParamId.aviBias,
  ParamId.aviBiasMode,
  ParamId.aviGain,
  ParamId.motorFullLoadCurrent,
  ParamId.motorNoLoadCurrent,
  ParamId.torqueCompensation,
  ParamId.slipCompensation,
  ParamId.motorPoles,
  ParamId.motorRatedOutput,
  ParamId.underVoltageProtection,
  ParamId.overVoltageProtection,
  ParamId.phaseLossProtection,
  ParamId.accelOverCurrentLevel,
  ParamId.decelOverCurrentLevel,
  ParamId.constSpeedOverCurrentLevel,
  ParamId.overTorqueLevel,
  ParamId.overTorqueTime,
  ParamId.overTorqueResponse,
  ParamId.thermalRelayMotorCurrent,
  ParamId.thermalRelayAmbient,
  ParamId.thermalProtectionBehavior,
  ParamId.communicationAddress,
  ParamId.transmissionSpeed
];

export interface VfdVEngineConfig {
  /** Parameter registry — must be loaded with the VFD-V core schema. */
  readonly parameters: ParameterRegistry;
  /** Model constants (defaults: the 7.5kW/400V reference configuration). */
  readonly model?: Partial<VfdVMotorModelConfig>;
  /** FWD/REV conflict safety rule (default: forward preferred). */
  readonly conflictRule?: ConflictRule;
}

export class VfdVRuntimeEngine {
  private readonly registry: ParameterRegistry;
  private readonly model: VfdVMotorModelConfig;

  private readonly stateMachine = new VfdStateMachine();
  private readonly faultManager = new FaultManager();
  private readonly digitalInputs = new DigitalInputProcessor();
  private readonly analogInputs = new AnalogInputProcessor();
  private readonly analogCommand = new AnalogCommandEngine();
  private readonly frequency = new FrequencyCommandEngine();
  private readonly acceleration = new AccelerationController();
  private readonly deceleration = new DecelerationController();
  private vf: VFController;
  private readonly uv = new UnderVoltageProtection();
  private readonly phaseLoss = new PhaseLossProtection();
  private readonly overTorque = new OverTorqueProtection();
  private readonly externalFault = new ExternalFaultProtection();
  private readonly relays = new RelayOutputProcessor();

  private commandSource: CommandSourceManager;
  private motor: MotorModel;
  private bus: DcBusModel;
  private oc: OverCurrentProtection;
  private ov: OverVoltageProtection;
  private overload: OverloadProtection;
  private thermal: ThermalProtection;
  private monitor: VfdMonitorValues;
  readonly rs485: VfdRs485Interface;

  private inputs: VfdVPhysicalInputs = createDefaultVfdVInputs();
  private state: VfdVRuntimeState = createInitialVfdVState();
  private appliedLoadPercent = 0;
  /**
   * Last driven direction while the output stage was energized. Kept so
   * a ramp deceleration (run command already released) still presents a
   * rotating field of the correct sequence to the motor model.
   */
  private lastDrivenDirection: 1 | -1 | 0 = 0;

  constructor(config: VfdVEngineConfig) {
    this.registry = config.parameters;
    this.model = { ...VFD_V_REFERENCE_MODEL, ...config.model };

    this.validateConfiguration();

    // Model-dependent modules are constructed here (after `model` is set).
    this.vf = new VFController(this.model);
    this.oc = new OverCurrentProtection(this.model);
    this.ov = new OverVoltageProtection(this.model);
    this.overload = new OverloadProtection(this.model);
    this.thermal = new ThermalProtection(this.model);

    const comm = new CommunicationCommandEngine();
    this.commandSource = new CommandSourceManager(comm, config.conflictRule);
    this.motor = new MotorModel(this.registry, this.vf, this.model);
    this.bus = new DcBusModel(this.model);
    this.monitor = new VfdMonitorValues();
    this.rs485 = new VfdRs485Interface(this.registry, comm);
    this.rs485.setMonitorProvider(this.monitor.provider);
  }

  /**
   * Validates the engine configuration against the loaded schema:
   *   - the registry contains the VFD-V core schema (85 parameters)
   *   - every engine-bound parameter exists with a non-null default
   *   - the terminal control mode (02-00) is supported by the core
   *     profile (mode 1 requires a STOP terminal — not present)
   *
   * @throws Error with an actionable message on any violation.
   */
  private validateConfiguration(): void {
    assertSchemaProvenanceComplete();
    for (const def of VFD_V_CORE_PARAMETERS) {
      if (this.registry.getDefinition(def.id) === undefined) {
        throw new Error(
          `VfdVRuntimeEngine: the loaded parameter schema is missing "${def.id}" — load the VFD-V core schema (VFD_V_CORE_PARAMETERS) into the registry first.`
        );
      }
    }
    const missing = ENGINE_BOUND_PARAMETERS.filter(
      (id) => this.registry.getDefinition(id) === undefined
    );
    if (missing.length > 0) {
      throw new Error(`VfdVRuntimeEngine: schema lacks engine parameters: ${missing.join(", ")}`);
    }
    const nullDefaults = ENGINE_BOUND_PARAMETERS.filter(
      (id) => this.registry.getDefinition(id)?.default === null
    );
    if (nullDefaults.length > 0) {
      throw new Error(
        `VfdVRuntimeEngine: engine-bound parameters with unknown (null) defaults — set them explicitly: ${nullDefaults.join(", ")} (see schema provenance)`
      );
    }
    const mode = this.registry.get(ParamId.externalTerminalControlMode);
    if (mode === 1) {
      throw new Error(
        "VfdVRuntimeEngine: 02-00 = 1 (3-wire FWD/STOP/REV) requires a STOP terminal that is not part of the core terminal profile. Use mode 0 (2-wire FWD/REV) or mode 2 (2-wire FWD/STOP + REV/STOP)."
      );
    }
  }

  // ---------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------

  /**
   * Advances the simulation by dt seconds with the given (partial)
   * physical inputs. Returns the published runtime state snapshot.
   *
   * dt must be > 0 and finite. Variable dt is supported; internal
   * substepping keeps the mechanical model stable.
   */
  update(dt: number, inputs?: Partial<VfdVPhysicalInputs>): VfdVRuntimeState {
    if (!Number.isFinite(dt) || dt <= 0) {
      throw new Error(`VfdVRuntimeEngine: invalid dt ${dt} (must be > 0 and finite)`);
    }
    if (inputs !== undefined) {
      this.inputs = { ...this.inputs, ...inputs };
    }

    const prev = this.state;
    const simTime = prev.simulationTime + dt;

    // --- 2. Read physical inputs ------------------------------------------
    const digital = this.digitalInputs.read(this.inputs);
    const powered = digital.powerOn;

    // --- Power transitions (state machine) ---------------------------------
    if (!powered && prev.powerOn) {
      this.stateMachine.advance(VfdVEvent.POWER_OFF);
      this.handlePowerLoss();
    } else if (powered && !prev.powerOn) {
      this.stateMachine.advance(VfdVEvent.POWER_ON);
    }

    // Un-energized: discharge the bus, publish a quiescent state, stop.
    if (!powered || this.stateMachine.state === VfdVState.POWER_OFF) {
      this.bus.step({
        phaseCount: digital.phaseCount,
        developedTorqueNm: 0,
        omegaRadS: 0,
        loadTorqueNm: 0,
        outputEnabled: false,
        dt
      });
      this.state = this.publishQuiescentState(simTime);
      this.monitor.publish(this.state, this.overload.heatPercent);
      return this.state;
    }

    const registry = this.registry;

    // --- 3. Resolve the operation command -----------------------------------
    // AVI scaling is evaluated only when the AVI is the selected
    // frequency source (00-20 = 1); the configured 03-xx scaling is
    // never bypassed when it IS the source.
    const aviIsSource = registry.get(ParamId.frequencyCommandSource) === 1;
    const rawAviHz = aviIsSource
      ? this.analogCommand.frequencyFromAvi(
          registry,
          this.analogInputs.read(this.inputs.aviVoltage)
        )
      : 0;
    const commands = this.commandSource.update(registry, digital, true, rawAviHz);
    const runCommand = commands.runCommand;
    const direction = commands.direction;

    // --- 4/5. Frequency command + limits --------------------------------------
    const stopMethod = registry.get(ParamId.stopMethod);

    // Phase loss (command-level response, §18) may force a stop.
    const phaseLossResult = this.phaseLoss.update(
      registry,
      digital.phaseCount,
      true,
      this.stateMachine.state === VfdVState.ACCELERATING ||
        this.stateMachine.state === VfdVState.RUNNING
    );

    let targetFrequency = 0;
    if (runCommand && !phaseLossResult.stop) {
      targetFrequency = this.frequency.applyLimits(registry, commands.frequencyCommand, true);
    }

    // A run command with a zero target is a stop (same inverter-deadband
    // rule as the RUN gate: the drive runs at >= 01-09 or not at all —
    // a setpoint dropping to 0 while running ramps the output to zero).
    const zeroTargetStop =
      runCommand &&
      targetFrequency <= FREQ_EPSILON &&
      (this.stateMachine.state === VfdVState.ACCELERATING ||
        this.stateMachine.state === VfdVState.RUNNING);
    const stopRequested =
      (!runCommand || phaseLossResult.stop || zeroTargetStop) &&
      (this.stateMachine.state === VfdVState.ACCELERATING ||
        this.stateMachine.state === VfdVState.RUNNING);

    // Stop command -> coast or ramp (00-22); phase-loss stop honors the
    // 06-02 response (ramp vs coast).
    if (stopRequested) {
      const coast = phaseLossResult.stop ? phaseLossResult.coast : stopMethod === 1;
      if (coast) {
        this.stateMachine.advance(VfdVEvent.COAST);
      } else {
        this.stateMachine.advance(VfdVEvent.TARGET_FALL);
      }
    }

    // Run command -> start (from READY or re-energize from COASTING).
    // A run command with a zero target does not start the drive: the
    // inverter output deadband means the drive runs at >= 01-09 or not
    // at all (documented minimum-output-frequency behavior).
    if (runCommand && !phaseLossResult.stop && targetFrequency > FREQ_EPSILON) {
      if (
        this.stateMachine.state === VfdVState.READY ||
        this.stateMachine.state === VfdVState.COASTING
      ) {
        this.stateMachine.advance(VfdVEvent.RUN);
      }
    }

    // --- 6. Acceleration / deceleration ---------------------------------------
    const stateNow = this.stateMachine.state;
    let outputFrequency = prev.outputFrequency;

    if (stateNow === VfdVState.ACCELERATING || stateNow === VfdVState.RUNNING) {
      // Output is enabled; the ramp tracks the target.
      if (stateNow === VfdVState.ACCELERATING) {
        outputFrequency = this.acceleration.step(registry, outputFrequency, targetFrequency, dt);
        if (targetFrequency < outputFrequency - FREQ_EPSILON) {
          // Target was lowered below the output mid-ramp.
          this.stateMachine.advance(VfdVEvent.TARGET_FALL);
          outputFrequency = this.deceleration.step(registry, outputFrequency, targetFrequency, dt, 1);
        } else if (outputFrequency >= targetFrequency - FREQ_EPSILON) {
          this.stateMachine.advance(VfdVEvent.TARGET_REACHED);
        }
      } else if (targetFrequency > outputFrequency + FREQ_EPSILON) {
        // Target raised while running: re-enter acceleration.
        this.stateMachine.advance(VfdVEvent.TARGET_RISE);
      } else if (targetFrequency < outputFrequency - FREQ_EPSILON) {
        // Target lowered while running: decelerate.
        this.stateMachine.advance(VfdVEvent.TARGET_FALL);
      }
    } else if (stateNow === VfdVState.DECELERATING) {
      // OV stall prevention: use the previous tick's bus voltage (the
      // bus is re-evaluated after this step, §26 order 11).
      const basePrev = this.bus.baseVoltage(digital.phaseCount);
      const ovPrev = this.ov.update(registry, prev.dcBusVoltage, basePrev);
      outputFrequency = this.deceleration.step(
        registry,
        outputFrequency,
        targetFrequency,
        dt,
        ovPrev.decelerationRateScale
      );
      if (outputFrequency <= FREQ_EPSILON) {
        outputFrequency = 0;
        this.stateMachine.advance(VfdVEvent.RAMP_DONE);
      } else if (
        targetFrequency > FREQ_EPSILON &&
        outputFrequency <= targetFrequency + FREQ_EPSILON
      ) {
        this.stateMachine.advance(VfdVEvent.TARGET_REACHED);
      } else if (targetFrequency > outputFrequency + FREQ_EPSILON) {
        // Target raised back up while decelerating (re-run mid-stop).
        this.stateMachine.advance(VfdVEvent.TARGET_RISE);
      }
    } else {
      // READY / COASTING / FAULT: inverter output disabled.
      outputFrequency = 0;
      if (
        this.stateMachine.state === VfdVState.COASTING &&
        Math.abs(prev.actualSpeedRPM) < STANDSTILL_RPM
      ) {
        this.stateMachine.advance(VfdVEvent.SPEED_ZERO);
      }
    }

    // --- 7. V/F output voltage ---------------------------------------------------
    const stateAfterRamp = this.stateMachine.state;
    const outputEnabled =
      stateAfterRamp === VfdVState.ACCELERATING ||
      stateAfterRamp === VfdVState.RUNNING ||
      stateAfterRamp === VfdVState.DECELERATING;
    const outputVoltage = outputEnabled
      ? this.vf.voltageFor(registry, outputFrequency, true)
      : 0;

    // --- 8-10. Motor torque / speed / current ------------------------------------
    const poles = registry.get(ParamId.motorPoles);
    const slipCompensationPercent = registry.get(ParamId.slipCompensation);
    const driveFrequency = outputEnabled ? outputFrequency : 0;
    // While the inverter output stage is enabled the field keeps
    // rotating in the driven direction — including during a ramp
    // deceleration, when the run command (and thus the commanded
    // direction) is already gone. Persisting the last driven direction
    // keeps the slip reference (and regenerative braking) intact.
    if (direction !== 0) {
      this.lastDrivenDirection = direction;
    }
    const driveDirection: 1 | -1 | 0 = outputEnabled
      ? direction !== 0
        ? direction
        : this.lastDrivenDirection
      : 0;
    // Slip compensation (05-06): the field speed is raised above the
    // nominal synchronous speed so the rotor reaches the setpoint speed
    // despite slip. The published synchronousSpeedRPM stays the nominal
    // (unsigned) value from output frequency and pole count.
    const nominalSyncRPM = TorqueModel.synchronousSpeedRPM(driveFrequency, poles);
    const fieldSyncRPM = nominalSyncRPM * (1 + slipCompensationPercent / 100);

    const motorOut = this.motor.step({
      outputFrequencyHz: driveFrequency,
      direction: driveDirection,
      outputEnabled,
      loadPercent: this.appliedLoadPercent,
      slipCompensationPercent,
      dt
    });
    const ratedSpeedRadS = this.motor.torque.ratedSpeedRadS();
    const loadTorqueNm =
      (Math.min(Math.abs(motorOut.omegaRadS) / Math.max(ratedSpeedRadS, 1e-9), 2) *
        (this.appliedLoadPercent / 100) *
        motorOut.ratedTorqueNm);

    // --- 11. DC bus voltage ---------------------------------------------------------
    this.bus.step({
      phaseCount: digital.phaseCount,
      developedTorqueNm: outputEnabled ? motorOut.developedTorqueNm : 0,
      omegaRadS: motorOut.omegaRadS,
      loadTorqueNm,
      outputEnabled,
      dt
    });
    const dcBusVoltage = this.bus.currentVoltage;
    // OV/Lv trip levels are percentages of the NOMINAL (full 3-phase)
    // DC bus: a phase loss drops the bus below the nominal reference,
    // which is exactly what Lv is supposed to detect.
    const nominalBaseVoltage = this.bus.baseVoltage(3);

    // --- 12. Thermal model -------------------------------------------------------------
    const overloadResult = this.overload.update(
      registry,
      motorOut.outputCurrent,
      true,
      dt,
      prev.activeFault === FaultCodes.MOTOR_OVERLOAD.code
    );
    const thermalState = this.thermal.update(
      registry,
      this.overload,
      motorOut.outputCurrent,
      this.model.driveRatedCurrentA,
      true,
      dt
    );

    // --- 13. Protection ------------------------------------------------------------------
    const faultsToRaise: string[] = [];

    const ocFault = this.oc.update(
      registry,
      stateAfterRamp,
      motorOut.outputCurrent,
      this.model.driveRatedCurrentA,
      dt
    );
    if (ocFault !== null) faultsToRaise.push(ocFault);

    const ovNow = this.ov.update(registry, dcBusVoltage, nominalBaseVoltage);
    if (ovNow.faultCode !== null) faultsToRaise.push(ovNow.faultCode);

    const uvFault = this.uv.update(registry, dcBusVoltage, nominalBaseVoltage, true);
    if (uvFault !== null) faultsToRaise.push(uvFault);

    if (overloadResult.faultCode !== null) {
      faultsToRaise.push(overloadResult.faultCode);
    }

    const overTorqueResult = this.overTorque.update(
      registry,
      motorOut.torquePercent,
      stateAfterRamp === VfdVState.ACCELERATING ||
        stateAfterRamp === VfdVState.RUNNING ||
        stateAfterRamp === VfdVState.DECELERATING,
      dt
    );
    if (overTorqueResult.faultCode !== null) {
      faultsToRaise.push(overTorqueResult.faultCode);
    }

    const extFault = this.externalFault.update(
      this.inputs.externalFault,
      prev.activeFault === FaultCodes.EXTERNAL_FAULT.code
    );
    if (extFault !== null) faultsToRaise.push(extFault);

    // --- 14. Fault manager ------------------------------------------------------------------
    let faultedThisTick = false;
    for (const code of faultsToRaise) {
      const wasActive = this.faultManager.hasHardFault();
      this.faultManager.raiseFault(code, simTime);
      if (!wasActive) {
        faultedThisTick = true;
        if (this.stateMachine.state !== VfdVState.FAULT) {
          this.stateMachine.advance(VfdVEvent.FAULT);
        }
      }
    }

    // OL2 auto-reset after cool-down (06-15 = 0 — explicitly permitted).
    if (
      prev.activeFault === FaultCodes.MOTOR_OVERLOAD.code &&
      overloadResult.autoResetPermitted
    ) {
      this.faultManager.clearFault();
      if (this.stateMachine.state === VfdVState.FAULT) {
        this.stateMachine.advance(VfdVEvent.FAULT_RESET);
      }
    }

    // --- 15. Relay outputs --------------------------------------------------------------------
    const relayContext: RelayContext = {
      state: this.stateMachine.state,
      outputFrequencyHz: outputFrequency,
      targetFrequencyHz: targetFrequency,
      maxFrequencyHz: registry.get(ParamId.maxOperationFrequency),
      actualSpeedRPM: motorOut.actualSpeedRPM,
      activeFault: this.faultManager.getActiveFault()?.code ?? null,
      powered: true
    };
    const relayStates = this.relays.update(registry, relayContext);

    // --- Fault output shutdown (spec §22: apply immediately, same tick) ------------------------
    const faulted = this.stateMachine.state === VfdVState.FAULT || faultedThisTick;
    const finalOutputFrequency = faulted ? 0 : outputFrequency;
    const finalOutputVoltage = faulted ? 0 : outputVoltage;
    const finalCurrent = faulted ? 0 : motorOut.outputCurrent;
    const finalTorquePercent = faulted ? 0 : motorOut.torquePercent;
    const finalOutputEnabled = faulted ? false : outputEnabled;

    // --- 16. Publish runtime state ---------------------------------------------------------------
    const activeFault = this.faultManager.getActiveFault()?.code ?? null;
    const elapsedRunTime =
      prev.elapsedRunTime +
      (this.stateMachine.state === VfdVState.ACCELERATING ||
      this.stateMachine.state === VfdVState.RUNNING
        ? dt
        : 0);

    const newState: VfdVRuntimeState = {
      powerOn: true,
      state: this.stateMachine.state,
      runCommand,
      forwardCommand: this.inputs.forwardCommand,
      reverseCommand: this.inputs.reverseCommand,
      direction: faulted ? 0 : direction,
      frequencyCommand: commands.frequencyCommand,
      targetFrequency: faulted ? 0 : targetFrequency,
      outputFrequency: finalOutputFrequency,
      outputVoltage: finalOutputVoltage,
      outputCurrent: finalCurrent,
      dcBusVoltage,
      synchronousSpeedRPM: faulted ? 0 : nominalSyncRPM,
      actualSpeedRPM: motorOut.actualSpeedRPM,
      slipRPM: faulted ? 0 : driveDirection * fieldSyncRPM - motorOut.actualSpeedRPM,
      torquePercent: finalTorquePercent,
      loadPercent: this.appliedLoadPercent,
      phaseLossWarning: this.phaseLoss.warning,
      overTorqueDetected: overTorqueResult.detected,
      motorTemperature: thermalState.motorTemperature,
      heatsinkTemperature: thermalState.heatsinkTemperature,
      outputEnabled: finalOutputEnabled,
      relayRA: relayStates.relayRA,
      relayRB: relayStates.relayRB,
      relayRC: relayStates.relayRC,
      aviVoltage: this.analogInputs.read(this.inputs.aviVoltage),
      activeFault,
      faultHistory: this.faultManager.getFaultCodes(),
      elapsedRunTime,
      simulationTime: simTime,
      inputPhases: {
        R: this.inputs.phaseR,
        S: this.inputs.phaseS,
        T: this.inputs.phaseT
      }
    };

    this.publishFaultRecords();
    this.state = newState;
    this.monitor.publish(this.state, this.overload.heatPercent);
    return this.state;
  }

  /** Current runtime state snapshot. */
  getState(): VfdVRuntimeState {
    return this.state;
  }

  /**
   * Sets the externally applied motor load, % of rated torque
   * (0-200; 150% supported per the core specification example).
   * Takes effect from the next update.
   */
  setLoadPercent(load: number): void {
    if (!Number.isFinite(load) || load < LOAD_MIN_PERCENT || load > LOAD_MAX_PERCENT) {
      throw new Error(`VfdVRuntimeEngine: load must be within [${LOAD_MIN_PERCENT}, ${LOAD_MAX_PERCENT}]%, got ${load}`);
    }
    this.appliedLoadPercent = load;
  }

  /** Currently applied load, % of rated torque. */
  getAppliedLoadPercent(): number {
    return this.appliedLoadPercent;
  }

  /**
   * Fault reset (command reset from the UI/PLC/RS-485).
   *
   * Faults are NEVER cleared automatically except where the
   * configuration explicitly permits (OL2 auto-reset, 06-15 = 0) or on
   * a power cycle. Returns true if a fault was cleared.
   */
  resetFault(): boolean {
    if (this.stateMachine.state !== VfdVState.FAULT) return false;
    const cleared = this.faultManager.clearFault();
    if (cleared) {
      this.oc.reset();
      this.overTorque.reset();
      this.externalFault.reset();
      this.stateMachine.advance(VfdVEvent.FAULT_RESET);
      // The published state reflects the cleared fault on the next tick;
      // update the cached snapshot immediately for API consistency.
      this.state = { ...this.state, state: this.stateMachine.state, activeFault: null };
    }
    return cleared;
  }

  /** Acknowledges the active fault (UI). */
  acknowledgeFault(): void {
    this.faultManager.acknowledgeFault();
  }

  /**
   * Parameter reset (drives the registry; the real drive's behavior is
   * governed by 00-02 — see schema provenance).
   */
  resetParameters(id?: string): void {
    this.registry.reset(id);
  }

  /** The fault manager (for UI/test access to history and acknowledgement). */
  getFaultManager(): FaultManager {
    return this.faultManager;
  }

  /** The monitor values (for UI/test access). */
  getMonitor(): VfdMonitorValues {
    return this.monitor;
  }

  // ---------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------

  /** Power-cycle handling: faults clear, mechanical/thermal state resets. */
  private handlePowerLoss(): void {
    this.faultManager.clearFault();
    this.commandSource.clearLatches();
    this.motor.resetMechanical();
    this.bus.reset();
    this.oc.reset();
    this.overload.reset();
    this.thermal.reset();
    this.phaseLoss.reset();
    this.overTorque.reset();
    this.externalFault.reset();
    this.lastDrivenDirection = 0;
  }

  /** Publishes a quiescent (un-energized) state snapshot. */
  private publishQuiescentState(simTime: number): VfdVRuntimeState {
    const prev = this.state;
    return {
      ...prev,
      powerOn: false,
      state: VfdVState.POWER_OFF,
      runCommand: false,
      forwardCommand: this.inputs.forwardCommand,
      reverseCommand: this.inputs.reverseCommand,
      direction: 0,
      frequencyCommand: 0,
      targetFrequency: 0,
      outputFrequency: 0,
      outputVoltage: 0,
      outputCurrent: 0,
      dcBusVoltage: this.bus.currentVoltage,
      synchronousSpeedRPM: 0,
      actualSpeedRPM: 0,
      slipRPM: 0,
      torquePercent: 0,
      loadPercent: this.appliedLoadPercent,
      phaseLossWarning: false,
      overTorqueDetected: false,
      outputEnabled: false,
      relayRA: false,
      relayRB: false,
      relayRC: false,
      aviVoltage: this.analogInputs.read(this.inputs.aviVoltage),
      activeFault: this.faultManager.getActiveFault()?.code ?? null,
      faultHistory: this.faultManager.getFaultCodes(),
      simulationTime: simTime,
      inputPhases: {
        R: this.inputs.phaseR,
        S: this.inputs.phaseS,
        T: this.inputs.phaseT
      }
    };
  }

  /** Writes the 06-17..06-20 fault records (READ_ONLY monitor parameters). */
  private publishFaultRecords(): void {
    const slots = this.faultManager.getFaultHistory();
    const addresses = [
      ParamId.faultHistory1,
      ParamId.faultHistory2,
      ParamId.faultHistory3,
      ParamId.faultHistory4
    ];
    for (let i = 0; i < addresses.length; i++) {
      const record = slots[i] ?? null;
      const result = this.registry.updateReadOnly(
        addresses[i]!,
        encodeFaultRecord(record === null ? null : record.code)
      );
      if (!result.ok) {
        throw new Error(`VfdVRuntimeEngine: failed to publish fault record: ${result.reason}`);
      }
    }
  }
}

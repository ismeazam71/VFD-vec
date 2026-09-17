import { ParamId } from "../../devices/vfd-v/paramIds.js";
import type { ParameterRegistry } from "../../parameters/ParameterRegistry.js";
import type { VfdVMotorModelConfig } from "../modelConstants.js";
import type { VFController } from "../voltage/VFController.js";
import { TorqueModel, type TorqueModelOutput } from "./TorqueModel.js";
import { SpeedModel } from "./SpeedModel.js";
import { CurrentModel } from "./CurrentModel.js";

/**
 * Motor model façade (core specification §10-§13).
 *
 * Owns the mechanical state (rotor speed) and composes:
 *   TorqueModel  — developed torque from the slip characteristic
 *   SpeedModel   — J dω/dt integration (inertia, load, friction)
 *   CurrentModel — output current from torque and motor data
 *
 * The model is deterministic and time-step independent within the
 * documented accuracy of a simplified V/F drive simulator (§34).
 */
export interface MotorStepInput {
  /** Inverter output frequency, Hz (unsigned). */
  readonly outputFrequencyHz: number;
  /** Commanded direction: 1 forward, -1 reverse, 0 none. */
  readonly direction: 1 | -1 | 0;
  /** Inverter output stage enabled (false in FAULT/COASTING/READY/OFF). */
  readonly outputEnabled: boolean;
  /** Applied load, % of rated torque. */
  readonly loadPercent: number;
  /**
   * Slip compensation (05-06), %: raises the field (synchronous) speed
   * reference above nominal so the rotor reaches the setpoint speed
   * despite slip. 0 = no compensation.
   */
  readonly slipCompensationPercent: number;
  /** Time step, s. */
  readonly dt: number;
}

export interface MotorStepOutput {
  /** Actual motor speed, signed RPM (world frame). */
  readonly actualSpeedRPM: number;
  /** Synchronous speed at the output frequency, unsigned RPM. */
  readonly synchronousSpeedRPM: number;
  /** Slip, signed RPM (commanded sync speed minus actual speed). */
  readonly slipRPM: number;
  /** Developed torque, % of rated (signed). */
  readonly torquePercent: number;
  /** Developed torque, signed Nm (for DC-bus regeneration math). */
  readonly developedTorqueNm: number;
  /** Available torque magnitude at the current frequency, Nm. */
  readonly availableTorqueNm: number;
  /** Rated torque, Nm. */
  readonly ratedTorqueNm: number;
  /** Output current, A (RMS). */
  readonly outputCurrent: number;
  /** Motor speed in rad/s (internal use, signed). */
  readonly omegaRadS: number;
}

export class MotorModel {
  private readonly torqueModel: TorqueModel;
  private readonly speedModel: SpeedModel;
  private readonly currentModel: CurrentModel;
  private readonly registry: ParameterRegistry;
  private readonly model: VfdVMotorModelConfig;

  /** Rotor speed, signed rad/s (world frame). Persistent between ticks. */
  private omega = 0;

  constructor(
    registry: ParameterRegistry,
    vf: VFController,
    model: VfdVMotorModelConfig
  ) {
    this.registry = registry;
    this.model = model;
    this.torqueModel = new TorqueModel(registry, vf, model);
    this.speedModel = new SpeedModel(model, this.torqueModel);
    this.currentModel = new CurrentModel(registry);
  }

  /** Rotor inertia (kg m^2) from the reference mechanical time constant. */
  private inertiaKgm2(): number {
    const ratedTorque = this.torqueModel.ratedTorqueNm();
    const ratedSpeed = this.torqueModel.ratedSpeedRadS();
    if (ratedTorque <= 0 || ratedSpeed <= 0) return 1;
    // Time constant definition: reach rated speed at rated torque in tau.
    return (ratedTorque * this.model.motorInertiaTimeConstantS) / ratedSpeed;
  }

  /**
   * Advances the motor by one tick.
   *
   * Note the order (spec §26 steps 8-10):
   *   torque (from current slip) -> speed integration -> current.
   * The developed torque used for the current is the torque at the
   * START of the tick (the torque that produced this tick's speed).
   */
  step(input: MotorStepInput): MotorStepOutput {
    const poles = this.registry.get(ParamId.motorPoles);
    const syncRPM = TorqueModel.synchronousSpeedRPM(input.outputFrequencyHz, poles);
    const slipCompFactor = 1 + input.slipCompensationPercent / 100;
    const syncRadS =
      input.direction *
      TorqueModel.synchronousSpeedRadS(input.outputFrequencyHz, poles) *
      slipCompFactor;

    const ratedTorque = this.torqueModel.ratedTorqueNm();

    const torque: TorqueModelOutput = this.torqueModel.torqueFor(
      this.omega,
      syncRadS,
      input.outputFrequencyHz,
      input.outputEnabled
    );

    this.omega = this.speedModel.stepSpeed({
      omega: this.omega,
      developedTorqueNm: torque.developedTorqueNm,
      loadPercent: input.loadPercent,
      inertiaKgm2: this.inertiaKgm2(),
      ratedSpeedRadS: this.torqueModel.ratedSpeedRadS(),
      ratedTorqueNm: ratedTorque,
      dt: input.dt
    });

    const current = this.currentModel.currentFor(
      torque.developedTorqueNm,
      ratedTorque,
      input.outputEnabled,
      input.outputFrequencyHz
    );

    const actualRPM = SpeedModel.toRPM(this.omega);
    const commandedSyncRPM = input.direction * syncRPM;

    return {
      actualSpeedRPM: actualRPM,
      synchronousSpeedRPM: syncRPM,
      slipRPM: commandedSyncRPM - actualRPM,
      torquePercent: torque.torquePercent,
      developedTorqueNm: torque.developedTorqueNm,
      availableTorqueNm: torque.availableTorqueNm,
      ratedTorqueNm: ratedTorque,
      outputCurrent: current,
      omegaRadS: this.omega
    };
  }

  /**
   * Resets the mechanical state (power cycle: the simulator assumes
   * the motor is at standstill when mains power is restored).
   */
  resetMechanical(): void {
    this.omega = 0;
  }

  /** Exposes the torque model (protection modules need the rated torque). */
  get torque(): TorqueModel {
    return this.torqueModel;
  }
}

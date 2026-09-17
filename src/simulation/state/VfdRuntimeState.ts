import { VfdVState, type VfdVState as State } from "./VfdVState.js";

/**
 * Physical inputs applied to the drive's front panel / terminals.
 *
 * These are the only "world" signals the engine reads. Everything else
 * (commands, frequency sources) is derived from these plus the parameter
 * set. The UI/PLC simulator writes these values; the engine never
 * mutates them.
 */
export interface VfdVPhysicalInputs {
  /** R/L1 phase present. */
  readonly phaseR: boolean;
  /** S/L2 phase present. */
  readonly phaseS: boolean;
  /** T/L3 phase present. */
  readonly phaseT: boolean;
  /** FWD digital input energized (24V to DCM). */
  readonly forwardCommand: boolean;
  /** REV digital input energized (24V to DCM). */
  readonly reverseCommand: boolean;
  /** AVI voltage with respect to ACM, volts (0..10). */
  readonly aviVoltage: number;
  /**
   * Externally triggered fault flag (e.g. from the PLC simulator or UI).
   * Models a fault raised outside the drive's own protection logic.
   */
  readonly externalFault: boolean;
}

/** Phase presence on the main input. */
export interface InputPhases {
  readonly R: boolean;
  readonly S: boolean;
  readonly T: boolean;
}

/**
 * Snapshot of the full deterministic VFD-V runtime state, published by
 * `VfdVRuntimeEngine.update()`.
 *
 * All values are plain data — the UI and the PLC simulator observe this
 * object; they never mutate it.
 */
export interface VfdVRuntimeState {
  /** Mains power applied (all three phases present). */
  readonly powerOn: boolean;

  readonly state: State;

  /** Resolved run command (after command source selection). */
  readonly runCommand: boolean;
  /** Raw FWD terminal / selected command source state. */
  readonly forwardCommand: boolean;
  /** Raw REV terminal / selected command source state. */
  readonly reverseCommand: boolean;

  /** 1 = forward, -1 = reverse, 0 = no direction (stop/standstill). */
  readonly direction: 1 | -1 | 0;

  /** Raw frequency command from the active source, Hz (pre-limiting). */
  readonly frequencyCommand: number;
  /** Final target frequency after bias/gain/limits, Hz. */
  readonly targetFrequency: number;
  /** Actual inverter output frequency, Hz. */
  readonly outputFrequency: number;

  /** V/F output voltage, V (line-to-line RMS). */
  readonly outputVoltage: number;
  /** Output current, A (RMS). */
  readonly outputCurrent: number;

  /** DC bus voltage, V. */
  readonly dcBusVoltage: number;

  /** Synchronous speed from output frequency and pole count, RPM (unsigned). */
  readonly synchronousSpeedRPM: number;
  /** Actual motor speed, signed RPM (sign = direction). */
  readonly actualSpeedRPM: number;
  /** Synchronous speed minus actual speed, signed RPM. */
  readonly slipRPM: number;

  /** Developed torque, % of rated. */
  readonly torquePercent: number;
  /** Externally applied load, % of rated torque. */
  readonly loadPercent: number;

  /** Motor temperature estimate, °C. */
  readonly motorTemperature: number;
  /** Drive heatsink temperature estimate, °C. */
  readonly heatsinkTemperature: number;

  /** Whether the inverter output stage is enabled. */
  readonly outputEnabled: boolean;

  readonly relayRA: boolean;
  readonly relayRB: boolean;
  readonly relayRC: boolean;

  /** AVI input voltage, V. */
  readonly aviVoltage: number;

  /** Code of the active hard fault, or null. */
  readonly activeFault: string | null;
  /** Fault history, newest first (maps to 06-17, 06-18, 06-19, 06-20). */
  readonly faultHistory: readonly string[];

  /** Cumulative time the drive has been in a running state, s. */
  readonly elapsedRunTime: number;
  /** Cumulative simulated time, s (deterministic clock). */
  readonly simulationTime: number;

  /** Input phase presence snapshot. */
  readonly inputPhases: InputPhases;
}

/**
 * Builds the initial runtime state: power off, no commands, all outputs
 * zeroed, FAULT-free.
 */
export function createInitialVfdVState(): VfdVRuntimeState {
  return {
    powerOn: false,
    state: VfdVState.POWER_OFF,
    runCommand: false,
    forwardCommand: false,
    reverseCommand: false,
    direction: 0,
    frequencyCommand: 0,
    targetFrequency: 0,
    outputFrequency: 0,
    outputVoltage: 0,
    outputCurrent: 0,
    dcBusVoltage: 0,
    synchronousSpeedRPM: 0,
    actualSpeedRPM: 0,
    slipRPM: 0,
    torquePercent: 0,
    loadPercent: 0,
    motorTemperature: 0,
    heatsinkTemperature: 0,
    outputEnabled: false,
    relayRA: false,
    relayRB: false,
    relayRC: false,
    aviVoltage: 0,
    activeFault: null,
    faultHistory: [],
    elapsedRunTime: 0,
    simulationTime: 0,
    inputPhases: { R: false, S: false, T: false }
  };
}

/**
 * Default physical inputs: no mains power, no commands, AVI at 0 V.
 */
export function createDefaultVfdVInputs(): VfdVPhysicalInputs {
  return {
    phaseR: false,
    phaseS: false,
    phaseT: false,
    forwardCommand: false,
    reverseCommand: false,
    aviVoltage: 0,
    externalFault: false
  };
}

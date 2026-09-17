/**
 * Terminal model types for simulated drive front panels.
 *
 * A terminal is a physical connection point with a fixed electrical role.
 * `runtimeMapping` names the field in the engine's physical inputs
 * (for inputs) or runtime state (for outputs) that the terminal drives
 * or reflects, so the mapping is auditable in one place.
 */

export const TerminalType = {
  /** Three-phase main power input. */
  POWER_INPUT: "power_input",
  /** Three-phase inverter output to the motor. */
  POWER_OUTPUT: "power_output",
  /** Chassis / protective earth. */
  GROUND: "ground",
  /** Fixed control power supply (+24V). */
  CONTROL_SUPPLY: "control_supply",
  /** Digital input common (DCM). */
  DIGITAL_COMMON: "digital_common",
  /** Fixed analog supply (+10V). */
  ANALOG_SUPPLY: "analog_supply",
  /** Analog input common (ACM). */
  ANALOG_COMMON: "analog_common",
  /** Sink-type digital input (24V to DCM). */
  DIGITAL_INPUT: "digital_input",
  /** Relay output contact. */
  DIGITAL_OUTPUT: "digital_output",
  /** 0-10V analog input. */
  ANALOG_INPUT: "analog_input",
  /** Two-wire serial communication (RS-485). */
  COMMUNICATION: "communication"
} as const;

export type TerminalType = (typeof TerminalType)[keyof typeof TerminalType];

export type TerminalDirection = "input" | "output" | "bidirectional" | "power";

export interface TerminalDefinition {
  /** Unique terminal id, e.g. "FWD". */
  readonly id: string;
  /** Label shown on the simulated front panel. */
  readonly label: string;
  readonly type: TerminalType;
  readonly direction: TerminalDirection;
  /** What the terminal electrically is (mains phase, 24V sink input...). */
  readonly electricalRole: string;
  /**
   * Name of the field this terminal maps to in the engine.
   * For inputs: a field of `VfdVPhysicalInputs`.
   * For outputs: a field of `VfdVRuntimeState`.
   * For fixed supplies / ground: a supply descriptor (no per-terminal
   * runtime signal).
   */
  readonly runtimeMapping: string;
}

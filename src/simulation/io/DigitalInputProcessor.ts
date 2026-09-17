import type { VfdVPhysicalInputs } from "../state/VfdRuntimeState.js";

/**
 * Digital input processor: maps the front-panel terminals (FWD, REV,
 * virtual keypad) onto clean command signals and derives the mains
 * power / phase-loss condition from the main input terminals.
 *
 * Pure and stateless — all edge detection lives in the command engine.
 */
export interface DigitalInputSignal {
  /** Mains power present (at least one phase on R/S/T). */
  readonly powerOn: boolean;
  /** Number of input phases present (0-3). */
  readonly phaseCount: number;
  readonly forwardCommand: boolean;
  readonly reverseCommand: boolean;
  readonly keypadForward: boolean;
  readonly keypadReverse: boolean;
  /** Virtual keypad frequency setpoint, Hz. */
  readonly keypadFrequency: number;
}

export class DigitalInputProcessor {
  /** Reads the physical inputs and derives the digital signal set. */
  read(inputs: VfdVPhysicalInputs): DigitalInputSignal {
    const phaseCount =
      (inputs.phaseR ? 1 : 0) + (inputs.phaseS ? 1 : 0) + (inputs.phaseT ? 1 : 0);
    return {
      powerOn: phaseCount > 0,
      phaseCount,
      forwardCommand: inputs.forwardCommand,
      reverseCommand: inputs.reverseCommand,
      keypadForward: inputs.keypadForward,
      keypadReverse: inputs.keypadReverse,
      keypadFrequency: inputs.keypadFrequency
    };
  }
}

import type { DigitalInputSignal } from "../io/DigitalInputProcessor.js";

/**
 * External-terminal operation command engine (FWD / REV).
 *
 * Implements the 02-00 terminal control modes:
 *
 *   Mode 0 — "2-wire FWD/REV":
 *     FWD ON  = forward run (level)
 *     REV ON  = reverse run (level)
 *     both OFF = stop
 *     FWD and REV are LEVEL commands, not independent speed inputs.
 *
 *   Mode 2 — "2-wire FWD/STOP + REV/STOP" (primary simulator mode):
 *     Momentary start/stop buttons (standard Delta 2-wire operation):
 *       FWD press while stopped        = start forward (latched)
 *       FWD press while running forward = stop
 *       REV press while stopped        = start reverse (latched,
 *                                        requires 00-23 enabled)
 *       REV press while running        = stop (also with 00-23 = 0:
 *                                        the REV terminal is always a
 *                                        valid stop button)
 *     Releasing a button never stops the drive (the run is latched
 *     until the next press). A press never auto-reverses: changing
 *     direction requires press-stop, then press-start (deterministic,
 *     prevents relay chattering). FWD+REV pressed simultaneously
 *     resolves through the conflict rule.
 *
 *   Mode 1 — "3-wire FWD/STOP/REV" is REJECTED at engine construction:
 *   it requires a STOP terminal that is not part of the core terminal
 *   profile (see schema provenance for 02-00).
 *
 * FWD/REV conflict (both active) is a CONFIGURABLE SAFETY RULE:
 *   ConflictRule.FORWARD_PREFERRED (default): FWD wins, REV ignored.
 * The rule is exposed so the simulator's safety configuration can be
 * changed without touching the engine.
 *
 * Reverse enable (00-23) is applied here: when disabled, REV never
 * creates reverse motion (it still acts as a stop in mode 2).
 */

export const ConflictRule = {
  /** FWD and REV both active -> forward runs, REV is ignored. */
  FORWARD_PREFERRED: "FORWARD_PREFERRED"
} as const;

export type ConflictRule = (typeof ConflictRule)[keyof typeof ConflictRule];

/** The default safety rule: forward wins a FWD/REV conflict. */
export const DEFAULT_CONFLICT_RULE: ConflictRule = ConflictRule.FORWARD_PREFERRED;

export interface ResolvedTerminalCommand {
  /** Run command active from the selected terminal mode. */
  readonly runCommand: boolean;
  /** Requested direction: 1 forward, -1 reverse, 0 none. */
  readonly direction: 1 | -1 | 0;
}

export class DigitalCommandEngine {
  private readonly conflictRule: ConflictRule;
  /** Latched direction for mode 2 (0 = stopped). */
  private latchedDirection: 1 | -1 | 0 = 0;
  /** Previous-tick raw signals, for edge detection (mode 2). */
  private prevForward = false;
  private prevReverse = false;
  /** Whether the drive is powered (latch clears on power loss). */
  private powered = false;

  constructor(conflictRule: ConflictRule = DEFAULT_CONFLICT_RULE) {
    this.conflictRule = conflictRule;
  }

  get rule(): ConflictRule {
    return this.conflictRule;
  }

  /**
   * Clears the mode-2 latch on power loss. Called explicitly by the
   * engine (the un-energized update path returns before consulting the
   * command engines). The previous-tick terminal states are kept so a
   * physically held button does not produce a phantom edge — the drive
   * never auto-restarts after a power restore.
   */
  clearLatches(): void {
    this.latchedDirection = 0;
  }

  /**
   * Resolves the terminal command for one tick.
   *
   * @param signal     sanitized digital inputs for this tick
   * @param mode       02-00 external terminal operation mode
   * @param reverseEnabled 00-23 reverse operation
   * @param powered    whether the drive currently has mains power
   */
  update(
    signal: DigitalInputSignal,
    mode: number,
    reverseEnabled: boolean,
    powered: boolean
  ): ResolvedTerminalCommand {
    if (!powered) {
      // Power loss clears the mode-2 latch; a fresh edge is required
      // after power restore (deterministic).
      this.latchedDirection = 0;
      this.prevForward = signal.forwardCommand;
      this.prevReverse = signal.reverseCommand;
      this.powered = false;
      return { runCommand: false, direction: 0 };
    }
    this.powered = true;

    const fwd = signal.forwardCommand;
    const rev = reverseEnabled ? signal.reverseCommand : false;

    // Refresh the previous-tick raw signals on EVERY mode so a runtime
    // mode switch never sees stale edges (deterministic).
    const prevForward = this.prevForward;
    const prevReverse = this.prevReverse;
    this.prevForward = signal.forwardCommand;
    this.prevReverse = signal.reverseCommand;

    if (mode === 0) {
      return this.resolveTwoWireLevel(fwd, rev);
    }
    if (mode === 2) {
      return this.resolveTwoWireLatched(fwd, rev, signal, prevForward, prevReverse);
    }
    // mode 1 is rejected at construction; this is defensive.
    throw new Error(`DigitalCommandEngine: unsupported terminal control mode ${mode}`);
  }

  private resolveTwoWireLevel(fwd: boolean, rev: boolean): ResolvedTerminalCommand {
    if (fwd && rev) {
      // Configurable conflict rule: forward preferred (deterministic).
      if (this.conflictRule === ConflictRule.FORWARD_PREFERRED) {
        return { runCommand: true, direction: 1 };
      }
      throw new Error(`DigitalCommandEngine: unknown conflict rule ${this.conflictRule}`);
    }
    if (fwd) return { runCommand: true, direction: 1 };
    if (rev) return { runCommand: true, direction: -1 };
    return { runCommand: false, direction: 0 };
  }

  private resolveTwoWireLatched(
    fwd: boolean,
    rev: boolean,
    signal: DigitalInputSignal,
    prevForward: boolean,
    prevReverse: boolean
  ): ResolvedTerminalCommand {
    const fwdRising = fwd && !prevForward;
    // Edge detection uses the RAW terminal state (a REV pulse must stop
    // the drive even when reverse motion is disabled by 00-23); the
    // GATED `rev` decides whether the pulse may START reverse motion.
    const revRising = signal.reverseCommand && !prevReverse;

    if (fwdRising && revRising) {
      // Simultaneous press: resolve through the conflict rule.
      this.latchedDirection = 1; // FORWARD_PREFERRED
    } else if (fwdRising) {
      // Momentary start/stop: start forward unless already forward.
      this.latchedDirection = this.latchedDirection === 1 ? 0 : 1;
    } else if (revRising) {
      if (this.latchedDirection === -1) {
        this.latchedDirection = 0;
      } else if (rev) {
        this.latchedDirection = -1;
      }
      // latched === 0 and reverse disabled: the pulse is a no-op.
    }
    // Falling edges (button release) intentionally do nothing: the run
    // is latched until the next press.

    if (this.latchedDirection === 0) {
      return { runCommand: false, direction: 0 };
    }
    return { runCommand: true, direction: this.latchedDirection };
  }
}

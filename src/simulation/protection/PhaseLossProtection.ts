import { ParamId } from "../../devices/vfd-v/paramIds.js";
import type { ParameterRegistry } from "../../parameters/ParameterRegistry.js";

/**
 * Input phase-loss protection (core specification §18).
 *
 * The input phase state is available in the runtime model (phase count
 * 0-3 on R/S/T). While the drive is energized with 1 or 2 phases
 * present, the configured 06-02 response applies:
 *
 *   0 = Disable              -> no action (bus sags; Lv may trip)
 *   1 = Warning and continue -> warning flag latched, drive keeps running
 *   2 = Warning and ramp stop-> warning flag latched, stop command issued
 *   3 = Warning and coast stop -> warning flag latched, coast stop issued
 *
 * Phase loss is a WARNING condition (soft), not a hard fault: the
 * drive does not enter the FAULT state from phase loss alone.
 * Edge-triggered: the warning latches once per phase-loss event and
 * clears when all three phases return.
 */
export interface PhaseLossResult {
  /** Phase-loss warning latched this tick. */
  readonly warning: boolean;
  /** Stop command to apply (false = continue). */
  readonly stop: boolean;
  /** Coast stop selected (otherwise ramp stop). */
  readonly coast: boolean;
}

export class PhaseLossProtection {
  private warningLatched = false;
  /** Whether a stop was issued for the current event (edge-once). */
  private stopIssued = false;

  /**
   * Evaluates the protection for one tick.
   *
   * @param registry   parameters (06-02)
   * @param phaseCount input phases present (0-3)
   * @param powered    mains power present
   * @param running    drive currently in a running/ramp state
   */
  update(
    registry: ParameterRegistry,
    phaseCount: number,
    powered: boolean,
    running: boolean
  ): PhaseLossResult {
    const response = registry.get(ParamId.phaseLossProtection);
    const lossActive = powered && phaseCount > 0 && phaseCount < 3;

    if (!lossActive) {
      this.warningLatched = false;
      this.stopIssued = false;
      return { warning: false, stop: false, coast: false };
    }

    if (response <= 0) {
      return { warning: false, stop: false, coast: false };
    }

    this.warningLatched = true;
    if (response >= 2 && running && !this.stopIssued) {
      this.stopIssued = true;
      return {
        warning: true,
        stop: true,
        coast: response === 3
      };
    }
    return { warning: true, stop: false, coast: false };
  }

  get warning(): boolean {
    return this.warningLatched;
  }

  /** Clears the latch (power cycle). */
  reset(): void {
    this.warningLatched = false;
    this.stopIssued = false;
  }
}

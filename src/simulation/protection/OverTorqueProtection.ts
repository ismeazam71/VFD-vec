import { ParamId } from "../../devices/vfd-v/paramIds.js";
import { FaultCodes } from "../../devices/vfd-v/faultCodes.js";
import type { ParameterRegistry } from "../../parameters/ParameterRegistry.js";

/**
 * Over-torque protection (core specification §19).
 *
 *   06-06 = level, % of rated torque (0 = disabled)
 *   06-07 = detection time, s — detection REQUIRES the torque to stay
 *     above the level for the full configured duration (a single
 *     sample never triggers)
 *   06-08 = response:
 *     0 = continue after detection (warning flag, no fault, no stop)
 *     1 = stop after detection: ramp stop AND the oL2 fault latches
 *
 * Uses the Delta VFD-V over-torque fault terminology: oL2.
 */
export interface OverTorqueResult {
  /** Fault code to raise (oL2), or null. */
  readonly faultCode: string | null;
  /** Stop command to apply (ramp stop), if the response requires it. */
  readonly stop: boolean;
  /** Detection currently active (for the "continue" response). */
  readonly detected: boolean;
}

export class OverTorqueProtection {
  /** Continuous over-torque duration, s. */
  private overDuration = 0;
  /** Detection latched this tick (edge). */
  private tripped = false;

  /**
   * Evaluates the protection for one tick.
   *
   * @param registry     parameters (06-06, 06-07, 06-08)
   * @param torquePercent developed torque, % of rated (signed magnitude)
   * @param running      drive in a running/ramp state (torque supervision
   *                     is active only while the motor is driven)
   * @param dt           time step, s
   */
  update(
    registry: ParameterRegistry,
    torquePercent: number,
    running: boolean,
    dt: number
  ): OverTorqueResult {
    const level = registry.get(ParamId.overTorqueLevel);
    if (level <= 0 || !running) {
      this.overDuration = 0;
      this.tripped = false;
      return { faultCode: null, stop: false, detected: false };
    }

    const detectionTime = registry.get(ParamId.overTorqueTime);
    const response = registry.get(ParamId.overTorqueResponse);

    if (Math.abs(torquePercent) > level) {
      this.overDuration += dt;
    } else {
      this.overDuration = 0;
    }

    // Detection requires the full configured duration.
    if (this.overDuration >= detectionTime && detectionTime >= 0 && !this.tripped) {
      this.tripped = true;
      this.overDuration = 0;
      if (response === 1) {
        // Stop after detection: ramp stop + oL2 fault latch.
        return {
          faultCode: FaultCodes.OVER_TORQUE.code,
          stop: true,
          detected: true
        };
      }
      // Continue after detection: warning only.
      return { faultCode: null, stop: false, detected: true };
    }
    return { faultCode: null, stop: false, detected: false };
  }

  /** Clears the latched detection (power cycle / fault clear). */
  reset(): void {
    this.overDuration = 0;
    this.tripped = false;
  }
}

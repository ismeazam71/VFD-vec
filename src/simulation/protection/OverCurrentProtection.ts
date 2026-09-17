import { ParamId } from "../../devices/vfd-v/paramIds.js";
import { FaultCodes } from "../../devices/vfd-v/faultCodes.js";
import type { ParameterRegistry } from "../../parameters/ParameterRegistry.js";
import { VfdVState } from "../state/VfdVState.js";
import type { VfdVState as State } from "../state/VfdVState.js";
import type { VfdVMotorModelConfig } from "../modelConstants.js";

/**
 * Over-current protection (core specification §15).
 *
 * Three state-dependent levels (% of the drive rated current):
 *
 *   state ACCELERATING -> 06-03 (ocA, acceleration over-current)
 *   state DECELERATING -> 06-04 (ocd, deceleration over-current)
 *   state RUNNING      -> 06-05 (ocn, constant-speed over-current)
 *
 * Trip logic: the current must exceed the level CONTINUOUSLY for the
 * configured OC trip delay (model constant, default 10 ms — models the
 * drive's hardware trip delay; a single-sample spike never trips).
 *
 * Stall prevention: the core EVC parameter set does not establish a
 * stall-prevention parameter for the VFD-V (source gap — see
 * provenance), so per the specification the engine applies stall
 * prevention ONLY where the parameter configuration specifies it:
 * i.e. not at all. The hard fault is created when the modeled condition
 * (sustained over-current) requires it.
 */
export class OverCurrentProtection {
  private readonly model: VfdVMotorModelConfig;
  /** Continuous over-current duration, s. */
  private overDuration = 0;

  constructor(model: VfdVMotorModelConfig) {
    this.model = model;
  }

  /**
   * Evaluates the protection for one tick.
   *
   * @returns the fault code to raise (ocA/ocd/ocn), or null.
   */
  update(
    registry: ParameterRegistry,
    state: State,
    currentA: number,
    driveRatedCurrentA: number,
    dt: number
  ): string | null {
    if (driveRatedCurrentA <= 0) return null;

    let level: number | null = null;
    let code: (typeof FaultCodes)[keyof typeof FaultCodes]["code"] | null = null;
    if (state === VfdVState.ACCELERATING) {
      level = registry.get(ParamId.accelOverCurrentLevel);
      code = FaultCodes.ACCEL_OVER_CURRENT.code;
    } else if (state === VfdVState.DECELERATING) {
      level = registry.get(ParamId.decelOverCurrentLevel);
      code = FaultCodes.DECEL_OVER_CURRENT.code;
    } else if (state === VfdVState.RUNNING) {
      level = registry.get(ParamId.constSpeedOverCurrentLevel);
      code = FaultCodes.CONST_SPEED_OVER_CURRENT.code;
    }
    if (level === null || code === null) {
      // No OC supervision in this state (READY/COASTING/DC_BRAKING/FAULT).
      this.overDuration = 0;
      return null;
    }

    const thresholdA = (level / 100) * driveRatedCurrentA;
    if (currentA > thresholdA) {
      this.overDuration += dt;
    } else {
      this.overDuration = 0;
    }

    if (this.overDuration >= this.model.ocTripDelayS) {
      this.overDuration = 0;
      return code;
    }
    return null;
  }

  /** Resets the integration (fault latch/clear, power cycle). */
  reset(): void {
    this.overDuration = 0;
  }
}

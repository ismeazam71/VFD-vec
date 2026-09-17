import { ParamId } from "../../devices/vfd-v/paramIds.js";
import type { ParameterRegistry } from "../../parameters/ParameterRegistry.js";

/**
 * Acceleration controller (01-12, 1st acceleration time).
 *
 * The ramp rate is defined as
 *
 *     rate = 01-00 (max operation frequency) / 01-12   [Hz/s]
 *
 * so with 01-12 = 10 s and 01-00 = 60 Hz the output ramps 0 -> 60 Hz
 * in exactly 10 s (core specification §7). For targets below the
 * maximum frequency the ramp takes proportionally less time.
 *
 * The step is time-step independent:
 *
 *     output += rate * dt, clamped at the target
 *
 * (a linear ramp is integrated exactly for any dt).
 *
 * 01-12 = 0 means "immediate" (output snaps to the target).
 */
export class AccelerationController {
  /**
   * Steps the output frequency toward a higher target.
   *
   * @param registry  parameters (01-00, 01-12)
   * @param output    current output frequency, Hz
   * @param target    target frequency (>= output in normal use)
   * @param dt        time step, s
   * @returns new output frequency, Hz
   */
  step(registry: ParameterRegistry, output: number, target: number, dt: number): number {
    const accelTime = registry.get(ParamId.firstAccelerationTime);
    if (accelTime <= 0) {
      return Math.min(target, registry.get(ParamId.maxOperationFrequency));
    }
    const maxFrequency = registry.get(ParamId.maxOperationFrequency);
    const rate = maxFrequency / accelTime; // Hz/s
    const next = output + rate * dt;
    if (next >= target) return target;
    return Math.min(next, maxFrequency);
  }
}

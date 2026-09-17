import { ParamId } from "../../devices/vfd-v/paramIds.js";
import type { ParameterRegistry } from "../../parameters/ParameterRegistry.js";

/**
 * Deceleration controller (01-13, 1st deceleration time).
 *
 * The ramp rate is
 *
 *     rate = 01-00 (max operation frequency) / 01-13   [Hz/s]
 *
 * (symmetric to acceleration, per core specification §7).
 *
 * `rateScale` (0 < rateScale <= 1) implements the OV stall-prevention
 * slowdown: when the DC bus approaches the OV level the engine reduces
 * the deceleration rate, which limits regenerated energy (see
 * OverVoltageProtection). 1 = full rate.
 *
 * 01-13 = 0 means "immediate" (output snaps to the target).
 */
export class DecelerationController {
  /**
   * Steps the output frequency toward a lower target.
   *
   * @param registry  parameters (01-00, 01-13)
   * @param output    current output frequency, Hz
   * @param target    target frequency (<= output in normal use; 0 for stop)
   * @param dt        time step, s
   * @param rateScale OV stall-prevention scale (0 < scale <= 1)
   * @returns new output frequency, Hz
   */
  step(
    registry: ParameterRegistry,
    output: number,
    target: number,
    dt: number,
    rateScale: number
  ): number {
    const decelTime = registry.get(ParamId.firstDecelerationTime);
    if (decelTime <= 0) {
      return Math.max(target, 0);
    }
    const maxFrequency = registry.get(ParamId.maxOperationFrequency);
    const scale = Math.min(Math.max(rateScale, 0), 1);
    const rate = (maxFrequency / decelTime) * scale; // Hz/s
    const next = output - rate * dt;
    if (next <= target) return Math.max(target, 0);
    return Math.max(next, 0);
  }
}

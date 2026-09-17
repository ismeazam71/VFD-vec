import { ParamId } from "../../devices/vfd-v/paramIds.js";
import type { ParameterRegistry } from "../../parameters/ParameterRegistry.js";

/**
 * Simplified motor current model (core specification §11).
 *
 *   I = I_noLoad (05-02) x runFactor
 *       + (I_FL (05-01) - I_noLoad) x |T_developed| / T_rated
 *
 *   - runFactor = 1 while the inverter output is enabled above 0 Hz,
 *     0 otherwise (no magnetizing current with the output disabled).
 *   - The load-dependent part is proportional to the developed torque:
 *     no-load steady -> ~I_noLoad; full-load steady -> I_FL; stall /
 *     breakdown torque -> above I_FL (the over-current protections then
 *     act). During acceleration the slip grows, the developed torque
 *     grows, and the current rises — and settles in steady state.
 *
 * Deterministic: no random ripple is generated. (If a UI later requires
 * a cosmetic ripple it must be added as a separate, configurable layer
 * outside this model.)
 *
 * Documented simplification: at low output frequency the available
 * torque (hence modeled current) is limited by the V/F voltage, so a
 * low-frequency stall shows less current than a real drive's
 * impedance-limited stall current.
 */
export class CurrentModel {
  private readonly registry: ParameterRegistry;

  constructor(registry: ParameterRegistry) {
    this.registry = registry;
  }

  /**
   * Computes the output current for one tick.
   *
   * @param developedTorqueNm  developed torque, signed Nm
   * @param ratedTorqueNm      rated torque, Nm
   * @param outputEnabled      inverter output stage enabled
   * @param outputFrequencyHz  inverter output frequency
   * @returns output current, A (RMS, >= 0)
   */
  currentFor(
    developedTorqueNm: number,
    ratedTorqueNm: number,
    outputEnabled: boolean,
    outputFrequencyHz: number
  ): number {
    const noLoadCurrent = this.registry.get(ParamId.motorNoLoadCurrent);
    const fullLoadCurrent = this.registry.get(ParamId.motorFullLoadCurrent);

    if (!outputEnabled || outputFrequencyHz <= 0) return 0;
    if (fullLoadCurrent <= 0) return 0;

    const runFactor = 1;
    const torqueFraction =
      ratedTorqueNm > 0 ? Math.abs(developedTorqueNm) / ratedTorqueNm : 0;

    const current =
      noLoadCurrent * runFactor + (fullLoadCurrent - noLoadCurrent) * torqueFraction;
    return Math.max(current, 0);
  }
}

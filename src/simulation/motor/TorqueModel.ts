import type { VFController } from "../voltage/VFController.js";
import type { ParameterRegistry } from "../../parameters/ParameterRegistry.js";
import type { VfdVMotorModelConfig } from "../modelConstants.js";
import { ParamId } from "../../devices/vfd-v/paramIds.js";

/**
 * Simplified induction-motor torque model (core specification §12).
 *
 * Sign convention
 *   - All speeds/torques are SIGNED in a fixed world frame.
 *   - `syncSpeedRadS` is the synchronous speed of the commanded
 *     frequency INCLUDING the commanded direction (d x 2pi x f x 120/60/poles).
 *   - Developed torque is reported in the same world frame.
 *
 * Torque characteristic (documented simplification):
 *
 *   slip s = (syncSpeedRadS - omega) / syncSpeedRadS
 *
 *   T_slip(s) = T_avail x 2s / (s^2 + 2 x s_rated)
 *
 *   - low slip:  T ~ T_avail x s / s_rated   (linear, as a real
 *     induction motor in the stable region)
 *   - at s = s_rated: T = T_avail              (rated operating point)
 *   - clamped to  |T| <= T_breakdown = 1.8 x T_avail
 *     (breakdown torque; the peak of the raw characteristic is higher
 *     and would be non-physical for a VFD-limited drive)
 *   - s < 0 (speed above synchronous): T < 0 (regeneration)
 *
 * T_avail = T_rated x (V(f)/V_rated)^2  — from the V/F curve
 * (constant-flux approximation; at low frequency the available torque
 * drops with the square of the voltage, as in V/F control).
 */
export interface TorqueModelOutput {
  /** Developed torque, signed Nm (world frame). */
  readonly developedTorqueNm: number;
  /** Available (limiting) torque magnitude at the current frequency, Nm. */
  readonly availableTorqueNm: number;
  /** Rated torque, Nm. */
  readonly ratedTorqueNm: number;
  /** Developed torque, % of rated (can exceed 100 during transients). */
  readonly torquePercent: number;
  /** Operating slip (signed, in the commanded-rotation frame). */
  readonly slip: number;
}

export class TorqueModel {
  private readonly vf: VFController;
  private readonly registry: ParameterRegistry;
  private readonly ratedSlip: number;
  private readonly breakdownTorqueFactor = 1.8;

  constructor(registry: ParameterRegistry, vf: VFController, model: VfdVMotorModelConfig) {
    this.registry = registry;
    this.vf = vf;
    this.ratedSlip = model.ratedSlipFraction;
  }

  /** Rated torque from the motor rated output (05-07) at the rated speed. */
  ratedTorqueNm(): number {
    const ratedPowerW = this.registry.get(ParamId.motorRatedOutput) * 1000;
    if (ratedPowerW <= 0) return 0;
    const ratedSpeedRadS = this.ratedSpeedRadS();
    return ratedPowerW / Math.max(ratedSpeedRadS, 1e-9);
  }

  /** Rated mechanical speed (rad/s): sync at max frequency minus rated slip. */
  ratedSpeedRadS(): number {
    const maxFrequency = this.registry.get(ParamId.maxOperationFrequency);
    const poles = this.registry.get(ParamId.motorPoles);
    const sync = TorqueModel.synchronousSpeedRadS(maxFrequency, poles);
    return sync * (1 - this.ratedSlip);
  }

  /** Synchronous speed (rad/s) for a frequency and pole count (unsigned). */
  static synchronousSpeedRadS(frequencyHz: number, poles: number): number {
    if (poles <= 0) return 0;
    return (2 * Math.PI * 120 * frequencyHz) / (60 * poles);
  }

  /** Synchronous speed, RPM (unsigned). */
  static synchronousSpeedRPM(frequencyHz: number, poles: number): number {
    if (poles <= 0) return 0;
    return (120 * frequencyHz) / poles;
  }

  /**
   * Computes the developed torque for one tick.
   *
   * @param omega        actual motor speed, signed rad/s (world frame)
   * @param syncSpeedRadS commanded synchronous speed, signed rad/s
   * @param outputFrequencyHz inverter output frequency (unsigned)
   * @param outputEnabled  inverter output stage enabled
   */
  torqueFor(
    omega: number,
    syncSpeedRadS: number,
    outputFrequencyHz: number,
    outputEnabled: boolean
  ): TorqueModelOutput {
    const ratedTorque = this.ratedTorqueNm();
    if (!outputEnabled || ratedTorque <= 0) {
      return {
        developedTorqueNm: 0,
        availableTorqueNm: 0,
        ratedTorqueNm: ratedTorque,
        torquePercent: 0,
        slip: 0
      };
    }

    const torqueFactor = this.vf.torqueFactor(this.registry, outputFrequencyHz);
    const availableTorque = ratedTorque * torqueFactor;
    const breakdownTorque = this.breakdownTorqueFactor * availableTorque;

    let slip: number;
    if (Math.abs(syncSpeedRadS) < 1e-9) {
      // No synchronous reference (0 Hz): no electromagnetic torque.
      slip = 0;
    } else {
      slip = (syncSpeedRadS - omega) / syncSpeedRadS;
    }

    let developed: number;
    if (availableTorque <= 0) {
      developed = 0;
    } else {
      // Torque in the commanded-rotation frame.
      const t = (2 * slip * availableTorque) / (slip * slip + 2 * this.ratedSlip);
      const clamped = Math.min(Math.max(t, -breakdownTorque), breakdownTorque);
      // Convert to the world frame (sign of the commanded rotation).
      developed = clamped * Math.sign(syncSpeedRadS);
    }

    return {
      developedTorqueNm: developed,
      availableTorqueNm: availableTorque,
      ratedTorqueNm: ratedTorque,
      torquePercent: ratedTorque > 0 ? (developed / ratedTorque) * 100 : 0,
      slip
    };
  }
}

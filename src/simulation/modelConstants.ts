/**
 * SIMULATOR MODEL CONSTANTS — VFD-V reference configuration
 * ===========================================================
 *
 * These are PHYSICS/MODEL constants of the simulation model, NOT Delta
 * VFD-V parameters. They do not appear in the EVC schema and are
 * intentionally separated from it:
 *
 *   - Every value is a documented engineering assumption for the
 *     "VFD-V 10HP (7.5kW) and below" reference configuration.
 *   - They are overridable through `VfdVMotorModelConfig` at engine
 *     construction so other drive models can be simulated.
 *   - Where a value depends on the real drive model (voltage class,
 *     rated current), it is marked REFERENCE and MUST be set per
 *     actual drive before production use.
 *
 * No random values are used anywhere in the engine (determinism).
 */

/** Square root of 2 (peak factor of the AC input). */
export const SQRT2 = Math.SQRT2;

/** Rectification factor: 3-phase full bridge, nominal DC bus = 1.35 x line voltage (RMS). */
export const DC_RECTIFICATION_FACTOR = 1.35;

export interface VfdVMotorModelConfig {
  /** REFERENCE: three-phase line voltage (RMS), V. 400V class. */
  readonly lineVoltageV: number;
  /** REFERENCE: drive rated output current (A) for the 7.5kW VFD-V class. */
  readonly driveRatedCurrentA: number;
  /**
   * Motor mechanical time constant (s): time to accelerate from 0 to
   * synchronous speed at full available torque with no load. Models
   * rotor inertia; no EVC parameter exists for it (source gap).
   */
  readonly motorInertiaTimeConstantS: number;
  /** DC bus capacitance (F) — models over-voltage rise under regeneration. */
  readonly busCapacitanceF: number;
  /** DC bus bleed (resistor) time constant (s) for above-nominal bus voltage. */
  readonly busBleedTimeConstantS: number;
  /** Motor thermal time constant (s) for the I²t electronic thermal relay. */
  readonly motorThermalTimeConstantS: number;
  /** Drive heatsink thermal time constant (s). */
  readonly heatsinkThermalTimeConstantS: number;
  /** Temperature rise (°C) at 100% thermal heat (motor). */
  readonly motorTempRiseAtFullHeatC: number;
  /** Temperature rise (°C) at 100% heatsink heat. */
  readonly heatsinkTempRiseAtFullHeatC: number;
  /**
   * Over-current trip integration delay (s): the current must exceed the
   * level continuously for this duration before the fault latches
   * (models the drive's hardware OC trip delay).
   */
  readonly ocTripDelayS: number;
  /** Over-voltage stall-prevention threshold, fraction of the OV trip level. */
  readonly ovStallPreventionFraction: number;
  /** Friction loss, fraction of rated torque (models mechanical friction). */
  readonly frictionTorqueFraction: number;
  /**
   * Rated operating slip of the reference induction motor (fraction).
   * No EVC parameter exists for it (source gap); 3% is typical for a
   * 4-pole induction motor.
   */
  readonly ratedSlipFraction: number;
  /**
   * Built-in low-frequency V/F starting boost, % of the maximum
   * voltage at 0 Hz (falling linearly to 0 at the maximum frequency).
   * Models the drive's inherent low-frequency voltage lift: a purely
   * linear (0,0)->(max,max) curve produces no starting torque
   * (T ~ V^2), so the boost is a documented model constant, separate
   * from the user-settable 05-03 torque compensation.
   */
  readonly vfStartingBoostPercent: number;
  /**
   * Maximum internal integration substep (s). Ticks larger than this
   * are subdivided for numerical stability of the mechanical model
   * (deterministic: a fixed substep is always used).
   */
  readonly maxMechanicalSubstepS: number;
}

/** Reference configuration: VFD-V 7.5kW, 3-phase 400V class. */
export const VFD_V_REFERENCE_MODEL: VfdVMotorModelConfig = {
  lineVoltageV: 400,
  driveRatedCurrentA: 19.5,
  motorInertiaTimeConstantS: 5,
  busCapacitanceF: 1500e-6,
  busBleedTimeConstantS: 5,
  motorThermalTimeConstantS: 300,
  heatsinkThermalTimeConstantS: 180,
  motorTempRiseAtFullHeatC: 40,
  heatsinkTempRiseAtFullHeatC: 30,
  ocTripDelayS: 0.01,
  ovStallPreventionFraction: 0.93,
  frictionTorqueFraction: 0.02,
  ratedSlipFraction: 0.03,
  vfStartingBoostPercent: 15,
  maxMechanicalSubstepS: 0.05
};

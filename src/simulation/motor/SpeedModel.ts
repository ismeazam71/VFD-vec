import type { VfdVMotorModelConfig } from "../modelConstants.js";
import { TorqueModel } from "./TorqueModel.js";

/**
 * Motor speed model (core specification §10).
 *
 * Mechanical integration of the rotor:
 *
 *     J x d(omega)/dt = T_motor + T_load + T_friction
 *
 *   - T_motor: developed electromagnetic torque (TorqueModel; 0 when
 *     the inverter output is disabled — FAULT, COASTING, READY)
 *   - T_load:  the externally applied load, % of rated torque, modeled
 *     proportional to |speed| (T = load% x T_rated x |omega|/omega_rated,
 *     capped at 2x so it does not vanish at high speed) opposing motion
 *   - T_friction: small constant mechanical friction opposing motion
 *
 * Synchronous speed comes from the output frequency and pole count
 * (05-05):  n_sync = 120 x f / poles.
 *
 * This is a SIMPLIFIED model: it reproduces the qualitative behavior
 * (slip, coast decay, re-energization from a spinning motor, stall)
 * and is deterministic, but it does not claim physical precision
 * beyond that (core specification §34).
 *
 * Numerical method: explicit Euler with internal substepping
 * (maxMechanicalSubstepS) so variable dt stays numerically stable.
 */

export interface SpeedStepInput {
  /** Actual motor speed at the start of the tick, signed rad/s. */
  readonly omega: number;
  /** Developed electromagnetic torque for the tick, signed Nm. */
  readonly developedTorqueNm: number;
  /** Applied load, % of rated torque. */
  readonly loadPercent: number;
  /** Rotor inertia, kg m^2. */
  readonly inertiaKgm2: number;
  /** Rated speed (rad/s) — reference for the load scaling. */
  readonly ratedSpeedRadS: number;
  /** Rated torque, Nm. */
  readonly ratedTorqueNm: number;
  /** Time step, s. */
  readonly dt: number;
}

export class SpeedModel {
  private readonly model: VfdVMotorModelConfig;
  private readonly torqueModel: TorqueModel;

  constructor(model: VfdVMotorModelConfig, torqueModel: TorqueModel) {
    this.model = model;
    this.torqueModel = torqueModel;
  }

  /**
   * Integrates the rotor speed for one tick.
   *
   * @returns new motor speed, signed rad/s
   */
  stepSpeed(input: SpeedStepInput): number {
    let omega = input.omega;
    if (input.inertiaKgm2 <= 0 || input.dt <= 0) return omega;

    const substep = this.model.maxMechanicalSubstepS;
    const n = Math.max(1, Math.ceil(input.dt / substep));
    const h = input.dt / n;
    const ratedSpeed = Math.max(input.ratedSpeedRadS, 1e-9);

    const frictionMax = this.model.frictionTorqueFraction * input.ratedTorqueNm;

    for (let i = 0; i < n; i++) {
      // Stiction: a nearly-stationary rotor does not move unless the
      // developed torque exceeds the static friction limit (documented
      // simplification: static = kinetic friction magnitude). Without
      // this, friction chatters the speed through zero forever.
      if (Math.abs(omega) < 0.01 && Math.abs(input.developedTorqueNm) <= frictionMax) {
        omega = 0;
        continue;
      }
      const loadTorque =
        (Math.min(Math.abs(omega) / ratedSpeed, 2) *
          (input.loadPercent / 100) *
          input.ratedTorqueNm) *
        -Math.sign(omega || 1);
      const frictionTorque = frictionMax * -Math.sign(omega || 1);
      const net = input.developedTorqueNm + loadTorque + frictionTorque;
      omega += (net / input.inertiaKgm2) * h;
    }

    return omega;
  }

  /** Rad/s -> signed RPM. */
  static toRPM(omega: number): number {
    return (omega * 60) / (2 * Math.PI);
  }

  /** Synchronous speed, signed RPM, for a frequency, pole count, direction. */
  synchronousSpeedRPM(
    frequencyHz: number,
    poles: number,
    direction: 1 | -1 | 0
  ): number {
    return direction * TorqueModel.synchronousSpeedRPM(frequencyHz, poles);
  }
}

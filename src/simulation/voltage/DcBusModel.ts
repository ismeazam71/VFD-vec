import { DC_RECTIFICATION_FACTOR } from "../modelConstants.js";
import type { VfdVMotorModelConfig } from "../modelConstants.js";

/**
 * DC bus voltage model (core specification §16/§17).
 *
 * Base (nominal) bus voltage:
 *
 *     V_base = 1.35 x V_line x phaseFactor
 *
 *   - 1.35: 3-phase full-bridge rectification factor (model constant)
 *   - V_line: REFERENCE line voltage (model-dependent, from the model
 *     config — no universal threshold is hard-coded)
 *   - phaseFactor: 3 phases -> 1.0, 2 phases -> sqrt(2/3), 1 phase -> 0.5
 *     (degraded rectification — documented approximation; the input
 *     phase state is available in the runtime model per §18)
 *
 * Dynamics (the grid is modeled as a stiff source through the rectifier
 * diodes — it can feed the bus but NOT absorb regeneration):
 *
 *   dV/dt = (P_generation - P_bleed) / (C x V)
 *
 *   - P_generation: motor regeneration while running
 *     (P = -T_developed x omega when T and omega oppose) plus load
 *     generation while coasting (P = 0.9 x T_load x |omega|)
 *   - P_bleed: the bus bleed resistor, active only above V_base
 *     (linear decay with the bleed time constant)
 *   - Phase loss: `base` drops (fewer phases -> lower rectified
 *     ceiling). While the bus sits above the new base the capacitor
 *     discharges at the net consumption rate (dominant) or the idle
 *     bleed rate, floored at the new base — this is what makes the
 *     low-voltage (Lv) protection observable after a phase loss.
 *
 * Deterministic; no random ripple.
 */

export interface DcBusStepInput {
  /** Phase count present on the main input (0-3). */
  readonly phaseCount: number;
  /** Developed torque, signed Nm (world frame). */
  readonly developedTorqueNm: number;
  /** Motor speed, signed rad/s (world frame). */
  readonly omegaRadS: number;
  /** Load torque at the current speed, Nm (magnitude, >= 0). */
  readonly loadTorqueNm: number;
  /** Inverter output stage enabled. */
  readonly outputEnabled: boolean;
  /** Time step, s. */
  readonly dt: number;
}

const PHASE_FACTORS = [0, 0.5, Math.sqrt(2 / 3), 1] as const;

export class DcBusModel {
  private readonly model: VfdVMotorModelConfig;
  private voltage = 0;

  constructor(model: VfdVMotorModelConfig) {
    this.model = model;
  }

  /** Nominal (base) DC bus voltage for the current phase count. */
  baseVoltage(phaseCount: number): number {
    const factor = PHASE_FACTORS[Math.min(Math.max(phaseCount, 0), 3)] ?? 0;
    return DC_RECTIFICATION_FACTOR * this.model.lineVoltageV * factor;
  }

  get currentVoltage(): number {
    return this.voltage;
  }

  /**
   * Steps the bus voltage for one tick.
   *
   * @returns the new DC bus voltage, V
   */
  step(input: DcBusStepInput): number {
    if (input.phaseCount <= 0) {
      // No mains: the bus discharges through the bleed path to 0.
      this.voltage = Math.max(0, this.voltage - this.voltage * (input.dt / this.model.busBleedTimeConstantS));
      if (this.voltage < 1) this.voltage = 0;
      return this.voltage;
    }

    const base = this.baseVoltage(input.phaseCount);

    // Generation into the bus.
    let pGeneration = 0;
    let pConsumption = 0;
    if (input.outputEnabled) {
      // Regeneration: torque opposes motion.
      const pMech = -input.developedTorqueNm * input.omegaRadS;
      if (pMech > 0) pGeneration = pMech;
      else pConsumption = -pMech;
    } else {
      // Coasting under load: the load spins the motor as a generator.
      pGeneration = 0.9 * input.loadTorqueNm * Math.abs(input.omegaRadS);
    }

    const cV = this.model.busCapacitanceF * Math.max(this.voltage, 1);
    if (pGeneration > 0) {
      this.voltage += (pGeneration * input.dt) / cV;
    } else if (this.voltage > base) {
      // The rectifier can no longer hold the bus at this level (a
      // phase was lost, dropping `base`): the capacitor discharges at
      // the net consumption rate (dominant), or the idle bleed rate
      // when there is no consumption.
      const bleedP = ((this.voltage - base) / this.model.busBleedTimeConstantS) * Math.max(this.voltage, 1);
      const dischargeP = Math.max(pConsumption, bleedP);
      this.voltage -= (dischargeP * input.dt) / cV;
    }
    // Below the base level the stiff grid source holds the bus at
    // base (documented simplification: no load-sag modeling).
    if (this.voltage < base) this.voltage = base;

    return this.voltage;
  }

  /** Full discharge (power off handling keeps this for safety). */
  reset(): void {
    this.voltage = 0;
  }
}

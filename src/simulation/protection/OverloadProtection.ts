import { ParamId } from "../../devices/vfd-v/paramIds.js";
import { FaultCodes } from "../../devices/vfd-v/faultCodes.js";
import type { ParameterRegistry } from "../../parameters/ParameterRegistry.js";
import type { VfdVMotorModelConfig } from "../modelConstants.js";

/**
 * Electronic thermal relay — motor overload protection (core
 * specification §14/§20).
 *
 * Simplified I²t model:
 *
 *   d(heat)/dt = ( (I / I_rated)^2 - 1 ) x (100 / tau)   [%/s]
 *
 *   - I_rated = 05-01 x (06-13 / 100)
 *   - tau     = motorThermalTimeConstantS (model constant)
 *
 * Thermal accumulation has INERTIA: a brief current spike cannot
 * trip the relay; sustained overload (I > I_rated) raises the heat
 * toward 100%, where the OL2 fault latches. While I < I_rated the heat
 * decays (cool-down).
 *
 * Reset behavior (06-15):
 *   0 = auto reset after cool-down (heat < AUTO_RESET_THRESHOLD)
 *   1 = manual reset only (engine resetFault / power cycle)
 */

/** Heat level below which an auto-reset (06-15 = 0) is permitted. */
const AUTO_RESET_THRESHOLD_PERCENT = 20;

export interface OverloadResult {
  /** Fault code to raise (OL2), or null. */
  readonly faultCode: string | null;
  /** Whether a latched OL2 may auto-reset now (06-15 = 0). */
  readonly autoResetPermitted: boolean;
  /** Thermal heat, % (0 = cold). */
  readonly heatPercent: number;
}

export class OverloadProtection {
  private readonly model: VfdVMotorModelConfig;
  /** Thermal heat, %. */
  private heat = 0;

  constructor(model: VfdVMotorModelConfig) {
    this.model = model;
  }

  get heatPercent(): number {
    return this.heat;
  }

  /**
   * Steps the I²t thermal model and evaluates the overload for one tick.
   *
   * @param registry    parameters (05-01, 06-13, 06-15)
   * @param currentA    output current, A
   * @param powered     mains power present (the relay integrates only
   *                    while the drive is energized; heat still cools)
   * @param dt          time step, s
   * @param faultActive whether an OL2 fault is currently latched
   */
  update(
    registry: ParameterRegistry,
    currentA: number,
    powered: boolean,
    dt: number,
    faultActive: boolean
  ): OverloadResult {
    const motorCurrent = registry.get(ParamId.motorFullLoadCurrent);
    const relayPercent = registry.get(ParamId.thermalRelayMotorCurrent);
    const ratedCurrent = motorCurrent * (relayPercent / 100);
    const behavior = registry.get(ParamId.thermalProtectionBehavior);

    if (powered && ratedCurrent > 0 && currentA > 0) {
      const ratio = currentA / ratedCurrent;
      this.heat += ((ratio * ratio - 1) * (100 / this.model.motorThermalTimeConstantS)) * dt;
    } else if (currentA <= 0 || !powered) {
      // Cool-down: the heat decays toward 0.
      this.heat = Math.max(0, this.heat - (100 / this.model.motorThermalTimeConstantS) * dt * 0.5);
    }
    this.heat = Math.min(Math.max(this.heat, 0), 150);

    let faultCode: string | null = null;
    if (this.heat >= 100) {
      // The relay latches once; the FaultManager keeps it until reset.
      faultCode = faultActive ? null : FaultCodes.MOTOR_OVERLOAD.code;
    }

    const autoResetPermitted = behavior === 0 && this.heat < AUTO_RESET_THRESHOLD_PERCENT;

    return { faultCode, autoResetPermitted, heatPercent: this.heat };
  }

  /** Clears the thermal state (power cycle / factory reset). */
  reset(): void {
    this.heat = 0;
  }
}

import { ParamId } from "../../devices/vfd-v/paramIds.js";
import type { ParameterRegistry } from "../../parameters/ParameterRegistry.js";
import type { VfdVMotorModelConfig } from "../modelConstants.js";
import type { OverloadProtection } from "./OverloadProtection.js";

/**
 * Thermal state monitoring (core specification §14).
 *
 * Exposes deterministic temperature estimates derived from the thermal
 * models:
 *
 *   motorTemperature   = ambient (06-14) + motor heat% x motorTempRise
 *   heatsinkTemperature = ambient (06-14) + heatsink heat% x heatsinkTempRise
 *
 * The heatsink heat follows its own I²t accumulation against the DRIVE
 * rated current (the heatsink protects the power stage, not the motor):
 *
 *   d(heat)/dt = ( (I / I_drive_rated)^2 - 1 ) x (100 / tau_heatsink)
 *
 * No hard fault is generated from the heatsink in the core version:
 * the core EVC set does not establish an inverter-overload (OL1)
 * parameter for this simulator (source gap — documented).
 */
export interface ThermalState {
  /** Motor temperature estimate, °C. */
  readonly motorTemperature: number;
  /** Drive heatsink temperature estimate, °C. */
  readonly heatsinkTemperature: number;
  /** Heatsink heat, % (monitoring only). */
  readonly heatsinkHeatPercent: number;
}

export class ThermalProtection {
  private readonly model: VfdVMotorModelConfig;
  private heatsinkHeat = 0;

  constructor(model: VfdVMotorModelConfig) {
    this.model = model;
  }

  /**
   * Steps the heatsink thermal model and returns the temperature state.
   *
   * @param registry        parameters (06-14)
   * @param motorRelay      the motor I²t relay (source of the motor heat)
   * @param currentA        output current, A
   * @param driveRatedA     drive rated current, A
   * @param powered         mains power present
   * @param dt              time step, s
   */
  update(
    registry: ParameterRegistry,
    motorRelay: OverloadProtection,
    currentA: number,
    driveRatedA: number,
    powered: boolean,
    dt: number
  ): ThermalState {
    if (powered && driveRatedA > 0 && currentA > 0) {
      const ratio = currentA / driveRatedA;
      this.heatsinkHeat += ((ratio * ratio - 1) * (100 / this.model.heatsinkThermalTimeConstantS)) * dt;
    } else {
      this.heatsinkHeat = Math.max(
        0,
        this.heatsinkHeat - (100 / this.model.heatsinkThermalTimeConstantS) * dt * 0.5
      );
    }
    this.heatsinkHeat = Math.min(Math.max(this.heatsinkHeat, 0), 150);

    const ambient = registry.get(ParamId.thermalRelayAmbient);
    return {
      motorTemperature: ambient + (motorRelay.heatPercent / 100) * this.model.motorTempRiseAtFullHeatC,
      heatsinkTemperature:
        ambient + (this.heatsinkHeat / 100) * this.model.heatsinkTempRiseAtFullHeatC,
      heatsinkHeatPercent: this.heatsinkHeat
    };
  }

  /** Clears the thermal state (power cycle). */
  reset(): void {
    this.heatsinkHeat = 0;
  }
}

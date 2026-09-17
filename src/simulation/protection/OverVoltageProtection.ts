import { ParamId } from "../../devices/vfd-v/paramIds.js";
import { FaultCodes } from "../../devices/vfd-v/faultCodes.js";
import type { ParameterRegistry } from "../../parameters/ParameterRegistry.js";
import type { VfdVMotorModelConfig } from "../modelConstants.js";

/**
 * Over-voltage protection (core specification §16).
 *
 * Monitors the DC bus against 06-01 (OV trip threshold, % of the
 * nominal DC bus voltage; 0 = disabled). The nominal DC bus is
 * model-derived (voltage class), so no single universal threshold is
 * hard-coded.
 *
 * OV STALL PREVENTION: while the bus voltage is above
 *   ovStallPreventionFraction x trip level
 * the engine receives `stallPreventionActive = true` and slows the
 * deceleration ramp (DecelerationController rate scale), which reduces
 * regenerated energy. If the protection can no longer maintain a safe
 * bus level (bus reaches the trip level), the OV fault latches.
 *
 * OV is never generated randomly — only by modeled regeneration
 * (deceleration/coasting under load) against the modeled bus dynamics.
 */
export interface OverVoltageResult {
  /** Fault code to raise, or null. */
  readonly faultCode: string | null;
  /** Deceleration rate scale while stall prevention is active (0 < s <= 1). */
  readonly decelerationRateScale: number;
  /** Whether the bus is in the stall-prevention zone. */
  readonly stallPreventionActive: boolean;
}

/** Rate scale applied to the deceleration ramp under OV stall prevention. */
const OV_STALL_PREVENTION_RATE_SCALE = 0.5;

export class OverVoltageProtection {
  private readonly model: VfdVMotorModelConfig;

  constructor(model: VfdVMotorModelConfig) {
    this.model = model;
  }

  /**
   * Evaluates the protection for one tick.
   *
   * @param registry     parameters (06-01)
   * @param dcBusVoltage current DC bus voltage, V
   * @param baseVoltage  nominal DC bus voltage for the phase count, V
   */
  update(registry: ParameterRegistry, dcBusVoltage: number, baseVoltage: number): OverVoltageResult {
    const thresholdPercent = registry.get(ParamId.overVoltageProtection);
    if (thresholdPercent <= 0 || baseVoltage <= 0) {
      return { faultCode: null, decelerationRateScale: 1, stallPreventionActive: false };
    }

    const tripVoltage = (thresholdPercent / 100) * baseVoltage;
    const stallVoltage = this.model.ovStallPreventionFraction * tripVoltage;

    if (dcBusVoltage >= tripVoltage) {
      return {
        faultCode: FaultCodes.OVER_VOLTAGE.code,
        decelerationRateScale: 1,
        stallPreventionActive: true
      };
    }
    if (dcBusVoltage >= stallVoltage) {
      return {
        faultCode: null,
        decelerationRateScale: OV_STALL_PREVENTION_RATE_SCALE,
        stallPreventionActive: true
      };
    }
    return { faultCode: null, decelerationRateScale: 1, stallPreventionActive: false };
  }
}

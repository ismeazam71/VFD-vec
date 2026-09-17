import { ParamId } from "../../devices/vfd-v/paramIds.js";
import { FaultCodes } from "../../devices/vfd-v/faultCodes.js";
import type { ParameterRegistry } from "../../parameters/ParameterRegistry.js";

/**
 * Low-voltage (Lv) protection (core specification §17).
 *
 * Monitors the DC bus / input voltage against 06-00 (Lv trip threshold,
 * % of the nominal DC bus voltage; 0 = disabled). The nominal bus
 * voltage is model-derived from the selected model voltage class —
 * no universal threshold is hard-coded.
 *
 * A fault is raised while the bus stays below the threshold (the drive
 * cannot operate). If power is restored the fault must be cleared per
 * the reset behavior.
 */
export class UnderVoltageProtection {
  /**
   * Evaluates the protection for one tick.
   *
   * @param registry      parameters (06-00)
   * @param dcBusVoltage  current DC bus voltage, V
   * @param baseVoltage   nominal DC bus voltage for the phase count, V
   * @param powered       mains power present
   */
  update(
    registry: ParameterRegistry,
    dcBusVoltage: number,
    baseVoltage: number,
    powered: boolean
  ): string | null {
    if (!powered || baseVoltage <= 0) return null;
    const thresholdPercent = registry.get(ParamId.underVoltageProtection);
    if (thresholdPercent <= 0) return null;
    const tripVoltage = (thresholdPercent / 100) * baseVoltage;
    if (dcBusVoltage < tripVoltage) {
      return FaultCodes.UNDER_VOLTAGE.code;
    }
    return null;
  }
}

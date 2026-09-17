import type { ParameterRegistry } from "../../parameters/ParameterRegistry.js";
import { ParamId } from "../../devices/vfd-v/paramIds.js";

export const AVI_SUPPLY_VOLTAGE_V = 10;

/**
 * Analog input processor: reads the AVI terminal and clamps it to the
 * 0-10V supply range.
 *
 * The AVI SCALING (bias/gain -> frequency) is the AnalogCommandEngine's
 * job; this processor only handles the physical signal.
 */
export class AnalogInputProcessor {
  /**
   * Reads and sanitizes the AVI voltage.
   *
   * Out-of-range readings are clamped (deterministic, no fault — the
   * drive clamps its analog front end).
   */
  read(aviVoltage: number): number {
    if (!Number.isFinite(aviVoltage)) return 0;
    return Math.min(Math.max(aviVoltage, 0), AVI_SUPPLY_VOLTAGE_V);
  }
}

/**
 * Resolves the AVI configuration parameters from the registry in one
 * place (single source of the parameter->field binding for AVI):
 *
 *   03-00 -> aviFunction
 *   03-03 -> aviBias
 *   03-06 -> aviBiasMode
 *   03-09 -> aviGain
 */
export function readAviConfig(registry: ParameterRegistry): {
  readonly aviFunction: number;
  readonly aviBias: number;
  readonly aviBiasMode: number;
  readonly aviGain: number;
} {
  return {
    aviFunction: registry.get(ParamId.aviFunction),
    aviBias: registry.get(ParamId.aviBias),
    aviBiasMode: registry.get(ParamId.aviBiasMode),
    aviGain: registry.get(ParamId.aviGain)
  };
}

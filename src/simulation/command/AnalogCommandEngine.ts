import type { ParameterRegistry } from "../../parameters/ParameterRegistry.js";
import { ParamId } from "../../devices/vfd-v/paramIds.js";
import { AVI_SUPPLY_VOLTAGE_V } from "../io/AnalogInputProcessor.js";

/**
 * Analog command engine: converts the AVI 0-10V signal into a frequency
 * command through the configured AVI scaling.
 *
 * Pipeline (per core specification §5):
 *
 *   AVI voltage (0-10V)
 *       ↓  fraction = v / 10          (03-06 mode 0 only; mode 1 = gap)
 *       ↓  bias:     b = (03-03)/100
 *       ↓  gain:     g = (03-09)/100
 *       ↓  f = 01-00 × (b + (1 - b) × fraction) × g
 *       ↓  clamp to [0, 01-00]
 *
 * With the factory defaults (bias 0, gain 100, 01-00 = 60Hz):
 *   0V -> 0Hz, 5V -> 30Hz, 10V -> 60Hz.
 *
 * The configured AVI scaling is NEVER bypassed: this is the only path
 * from AVI to a frequency command.
 */
export class AnalogCommandEngine {
  /**
   * Converts an AVI voltage to a frequency command.
   *
   * @param registry  parameter registry (reads 01-00, 03-00, 03-03, 03-06, 03-09)
   * @param voltage   AVI voltage, volts (already clamped 0-10 by the
   *                  AnalogInputProcessor)
   * @returns frequency command in Hz
   *
   * @throws Error when 03-00 selects a non-core AVI function or 03-06
   *         selects the unimplemented 4-20mA mode (explicit source gap).
   */
  frequencyFromAvi(registry: ParameterRegistry, voltage: number): number {
    const maxFrequency = registry.get(ParamId.maxOperationFrequency);
    const aviFunction = registry.get(ParamId.aviFunction);
    const biasPercent = registry.get(ParamId.aviBias);
    const biasMode = registry.get(ParamId.aviBiasMode);
    const gainPercent = registry.get(ParamId.aviGain);

    if (aviFunction !== 0) {
      throw new Error(
        `AnalogCommandEngine: AVI function ${aviFunction} (03-00) is not supported by the core engine (only 0 = frequency command). See schema provenance.`
      );
    }
    if (biasMode !== 0) {
      throw new Error(
        `AnalogCommandEngine: AVI bias mode ${biasMode} (03-06) is not implemented (source gap — only 0 = 0-10V scaling is supported).`
      );
    }

    const fraction = Math.min(Math.max(voltage / AVI_SUPPLY_VOLTAGE_V, 0), 1);
    const bias = Math.min(Math.max(biasPercent, 0), 100) / 100;
    const gain = Math.max(gainPercent, 0) / 100;

    const frequency = maxFrequency * (bias + (1 - bias) * fraction) * gain;
    return Math.min(Math.max(frequency, 0), maxFrequency);
  }
}

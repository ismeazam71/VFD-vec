import { ParamId } from "../../devices/vfd-v/paramIds.js";
import type { ParameterRegistry } from "../../parameters/ParameterRegistry.js";

/**
 * Frequency command limiting pipeline (core specification §6):
 *
 *   Raw Command
 *       ↓  Source Selection          (00-20 — done by CommandSourceManager)
 *       ↓  AVI Scaling / Comm Scaling(03-xx — done by AnalogCommandEngine)
 *       ↓  Bias                      (inside AVI scaling)
 *       ↓  Gain                      (inside AVI scaling)
 *       ↓  Frequency Limits  (THIS MODULE)
 *       ↓  Final Target Frequency
 *
 * Limits applied, in order:
 *   1. f = min(f, 01-00)               maximum operation frequency
 *   2. f = min(f, 01-10)               upper bound frequency
 *   3. f = max(f, 01-11)               lower bound frequency
 *      (only while a run command is active — stopping always targets 0)
 *   4. minimum output frequency (01-09) deadband: while running, the
 *      inverter either runs at >= 01-09 or does not run at all
 *   5. f = clamp(f, 0, 01-00)          absolute sanity clamp
 *
 * The target frequency is NEVER mixed with the actual output frequency:
 * this module only produces the target; the ramp controllers produce
 * the output.
 */
export class FrequencyCommandEngine {
  /**
   * Applies the frequency limits.
   *
   * @param registry   parameters
   * @param rawHz      raw frequency command from the active source
   * @param running    true while a run command is active (the lower
   *                   bound 01-11 and the 01-09 deadband constrain
   *                   running commands only; stopping always targets 0)
   * @returns final target frequency, Hz
   */
  applyLimits(registry: ParameterRegistry, rawHz: number, running: boolean): number {
    const maxFrequency = registry.get(ParamId.maxOperationFrequency);
    const upperBound = registry.get(ParamId.upperBoundFrequency);
    const lowerBound = registry.get(ParamId.lowerBoundFrequency);
    const minOutput = registry.get(ParamId.minOutputFrequency);

    let f = rawHz;
    if (!Number.isFinite(f)) f = 0;
    f = Math.min(f, maxFrequency);
    f = Math.min(f, upperBound);
    if (running) {
      f = Math.max(f, lowerBound);
      // Minimum output frequency deadband: a run command below the
      // minimum output frequency runs at the minimum (the inverter
      // output cannot sit inside the deadband while running).
      f = Math.max(f, minOutput);
    }
    f = Math.min(Math.max(f, 0), maxFrequency);
    return f;
  }
}

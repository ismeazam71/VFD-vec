import { ParamId } from "../../devices/vfd-v/paramIds.js";
import type { ParameterRegistry } from "../../parameters/ParameterRegistry.js";
import type { VfdVMotorModelConfig } from "../modelConstants.js";

interface VFPoint {
  readonly frequencyHz: number;
  readonly voltageV: number;
}

/**
 * V/F controller (core specification §9).
 *
 * The output voltage is produced by PIECEWISE-LINEAR interpolation of
 * the programmable V/F curve:
 *
 *     (0 Hz, 0 V)
 *       + 01-02/01-03  (1st V/F point, when active)
 *       + 01-04/01-05  (2nd V/F point, when active)
 *       + 01-06/01-07  (3rd V/F point, when active)
 *       + (01-00 Hz, 01-01 V)   (maximum operation point)
 *
 * A point is ACTIVE when its frequency is > 0, strictly greater than
 * the previous active point's frequency, and its voltage is >= 0. With
 * all points inactive (the factory state — source gap, see provenance)
 * the curve degenerates to the standard 2-point linear V/F:
 *     V(f) = 01-01 * f / 01-00
 *
 * Torque compensation (05-03) is applied as a low-frequency voltage
 * lift:
 *     V(f) += 05-03% * 01-01 * (1 - f/01-00)
 * (maximum at 0 Hz, zero at the maximum frequency — documented
 * simplification of the VFD-V torque-compensation behavior).
 *
 * The result is clamped to [0, 01-01] (maximum output voltage) and the
 * selected model voltage class is honored through 01-01 (reference
 * value for the 400V class).
 *
 * A built-in low-frequency starting boost (model constant
 * `vfStartingBoostPercent`, falling linearly to 0 at the maximum
 * frequency) is applied in addition to 05-03 so the model can
 * produce starting torque (T ~ V^2; a purely linear curve from 0V
 * cannot start a loaded motor).
 */
export class VFController {
  private readonly model: VfdVMotorModelConfig;

  constructor(model: VfdVMotorModelConfig) {
    this.model = model;
  }

  /**
   * Computes the output voltage for a given output frequency.
   *
   * @param registry       parameters (01-00..01-08, 05-03)
   * @param frequencyHz    inverter output frequency
   * @param outputEnabled  false -> 0 V (inverter output disabled)
   * @returns output voltage, V (line-to-line RMS)
   */
  voltageFor(registry: ParameterRegistry, frequencyHz: number, outputEnabled: boolean): number {
    if (!outputEnabled) return 0;

    const maxFrequency = registry.get(ParamId.maxOperationFrequency);
    const maxVoltage = registry.get(ParamId.maxOperationVoltage);
    const torqueCompPercent = registry.get(ParamId.torqueCompensation);

    if (maxFrequency <= 0) return 0;

    const f = Math.min(Math.max(frequencyHz, 0), maxFrequency);

    const points = this.buildCurve(registry, maxFrequency, maxVoltage);

    // Piecewise-linear interpolation.
    let v = 0;
    for (let i = 1; i < points.length; i++) {
      const p0 = points[i - 1]!;
      const p1 = points[i]!;
      if (f <= p1.frequencyHz) {
        const span = p1.frequencyHz - p0.frequencyHz;
        const t = span > 0 ? (f - p0.frequencyHz) / span : 1;
        v = p0.voltageV + (p1.voltageV - p0.voltageV) * t;
        break;
      }
      v = p1.voltageV;
    }

    // Low-frequency voltage lift: model starting boost + 05-03.
    const boostPercent = this.model.vfStartingBoostPercent + torqueCompPercent;
    if (boostPercent > 0) {
      v += (boostPercent / 100) * maxVoltage * (1 - f / maxFrequency);
    }

    return Math.min(Math.max(v, 0), maxVoltage);
  }

  /**
   * The available-torque factor at a frequency, (V(f)/V_rated)^2.
   *
   * Used by the torque model: under V/F control the available torque
   * follows the square of the applied voltage (constant-flux
   * approximation). Returns 0..1 (>= 1 is clamped: the curve is
   * normalized by the maximum operating point).
   */
  torqueFactor(registry: ParameterRegistry, frequencyHz: number): number {
    const maxFrequency = registry.get(ParamId.maxOperationFrequency);
    const maxVoltage = registry.get(ParamId.maxOperationVoltage);
    if (maxFrequency <= 0 || maxVoltage <= 0) return 0;
    const f = Math.min(Math.max(frequencyHz, 0), maxFrequency);
    const v = this.voltageFor(registry, f, true);
    const factor = (v / maxVoltage) ** 2;
    return Math.min(factor, 1);
  }

  /** Builds the sorted, sanitized V/F curve including the anchor points. */
  private buildCurve(
    registry: ParameterRegistry,
    maxFrequency: number,
    maxVoltage: number
  ): VFPoint[] {
    const raw: Array<VFPoint | null> = [
      this.readPoint(registry, ParamId.vfPoint1Frequency, ParamId.vfPoint1Voltage),
      this.readPoint(registry, ParamId.vfPoint2Frequency, ParamId.vfPoint2Voltage),
      this.readPoint(registry, ParamId.vfPoint3Frequency, ParamId.vfPoint3Voltage)
    ];

    const curve: VFPoint[] = [{ frequencyHz: 0, voltageV: 0 }];
    let lastFrequency = 0;
    for (const point of raw) {
      if (point === null) continue;
      if (point.frequencyHz <= lastFrequency) continue; // inactive / unordered
      if (point.frequencyHz > maxFrequency) continue; // beyond the max point
      curve.push({
        frequencyHz: point.frequencyHz,
        voltageV: Math.min(Math.max(point.voltageV, 0), maxVoltage)
      });
      lastFrequency = point.frequencyHz;
    }
    curve.push({ frequencyHz: maxFrequency, voltageV: Math.max(maxVoltage, 0) });
    return curve;
  }

  /**
   * Reads one V/F point. Returns null when the point is inactive:
   * frequency <= 0, or frequency value missing (null default in the
   * schema — a source gap, treated as "point not set").
   */
  private readPoint(
    registry: ParameterRegistry,
    freqId: string,
    voltId: string
  ): VFPoint | null {
    const def = registry.getDefinition(freqId);
    const frequency = registry.get(freqId);
    const voltage = registry.get(voltId);
    // A null-default parameter is initialized to 0 by the registry;
    // 0 Hz marks "point inactive" either way.
    if (def === undefined || frequency <= 0) return null;
    return { frequencyHz: frequency, voltageV: voltage };
  }
}

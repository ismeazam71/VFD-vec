import { ParameterDatatype, type ParameterDefinition } from "./types.js";

const TOLERANCE = 1e-9;

function isIntegerDatatype(datatype: ParameterDefinition["datatype"]): boolean {
  return (
    datatype === ParameterDatatype.INT16 ||
    datatype === ParameterDatatype.INT32 ||
    datatype === ParameterDatatype.UINT16 ||
    datatype === ParameterDatatype.UINT32
  );
}

function isStepAligned(value: number, step: number, origin: number): boolean {
  if (step <= 0) return true;
  const ratio = (value - origin) / step;
  return Math.abs(ratio - Math.round(ratio)) < TOLERANCE;
}

/**
 * Validates a candidate value against a parameter definition.
 *
 * Checks, in order:
 *   1. value is a finite number
 *   2. integer datatypes reject fractional values
 *   3. min/max range
 *   4. step alignment (relative to the factory default)
 *   5. enum membership for ENUM parameters
 *
 * Pure function — no state, deterministic, safe to call from tests and
 * from the parameter registry.
 */
export function validateParameterValue(
  definition: ParameterDefinition,
  value: number
): { readonly ok: true } | { readonly ok: false; readonly reason: string } {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { ok: false, reason: `value must be a finite number, got ${String(value)}` };
  }
  if (isIntegerDatatype(definition.datatype) && !Number.isInteger(value)) {
    return {
      ok: false,
      reason: `${definition.id}: ${definition.datatype} requires an integer value`
    };
  }
  if (value < definition.min - TOLERANCE || value > definition.max + TOLERANCE) {
    return {
      ok: false,
      reason: `${definition.id}: value ${value} out of range [${definition.min}, ${definition.max}]`
    };
  }
  if (!isStepAligned(value, definition.step, definition.default)) {
    return {
      ok: false,
      reason: `${definition.id}: value ${value} not aligned to step ${definition.step}`
    };
  }
  if (definition.enum !== undefined) {
    const allowed = definition.enum.some((option) => option.value === value);
    if (!allowed) {
      const options = definition.enum.map((option) => option.value).join("|");
      return { ok: false, reason: `${definition.id}: value ${value} not in enum {${options}}` };
    }
  }
  return { ok: true };
}

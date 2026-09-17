import type { ParameterDefinition } from "./types.js";
import { ParameterAccess } from "./types.js";
import type { ParameterLoadResult, ParameterWriteResult } from "./results.js";
import { validateParameterValue } from "./validate.js";

/**
 * Centralized, strongly typed parameter store for one drive instance.
 *
 * The registry is the ONLY place parameter values live. Runtime modules
 * (frequency controller, protection, relays, ...) read through `get(id)`
 * and never keep private copies of parameter values.
 *
 * Parameter definitions come from the device schema
 * (`src/devices/vfd-v/schema/`); the registry validates them on load so
 * a malformed schema is rejected before any simulation runs.
 *
 * NULL handling (source gaps): a definition with `default: null` is
 * initialized to 0. See the schema provenance for the gap list.
 */
export class ParameterRegistry {
  private readonly definitions = new Map<string, ParameterDefinition>();
  private readonly values = new Map<string, number>();

  /**
   * Loads a set of parameter definitions and initializes every value to
   * its factory default (null default -> 0).
   *
   * Replaces any previously loaded schema.
   */
  load(defs: readonly ParameterDefinition[]): ParameterLoadResult {
    const result = validateDefinitionSet(defs);
    if (!result.ok) {
      return result;
    }
    this.definitions.clear();
    this.values.clear();
    for (const def of defs) {
      this.definitions.set(def.id, def);
      this.values.set(def.id, def.default ?? 0);
    }
    return { ok: true, reason: undefined };
  }

  /** All loaded definitions, in load order. */
  get all(): readonly ParameterDefinition[] {
    return [...this.definitions.values()];
  }

  /** Definition for a parameter id, or undefined if not in the schema. */
  getDefinition(id: string): ParameterDefinition | undefined {
    return this.definitions.get(id);
  }

  /**
   * Reads the current value of a parameter.
   *
   * Throws if the id is not part of the loaded schema — a runtime module
   * referencing a parameter that is not in the schema is a bug we want
   * to fail loudly on, not silently propagate 0.
   */
  get(id: string): number {
    const value = this.values.get(id);
    if (value === undefined) {
      throw new Error(`ParameterRegistry: parameter "${id}" is not in the loaded schema`);
    }
    return value;
  }

  /**
   * Writes a value after full validation (datatype, min/max, step, enum,
   * access). Invalid values are rejected with a reason; the previous
   * value is left untouched.
   *
   * Read-only parameters reject all external writes.
   */
  set(id: string, value: number): ParameterWriteResult {
    const def = this.definitions.get(id);
    if (def === undefined) {
      return { ok: false, reason: `parameter "${id}" is not in the loaded schema` };
    }
    if (def.access === ParameterAccess.READ_ONLY) {
      return { ok: false, reason: `parameter "${id}" is read-only` };
    }
    const validation = validateParameterValue(def, value);
    if (!validation.ok) {
      return validation;
    }
    this.values.set(id, value);
    return { ok: true };
  }

  /**
   * Internal update of a READ_ONLY parameter by the simulation engine
   * itself (monitor values such as the 06-17..06-20 fault records).
   *
   * External callers (UI, PLC simulator, RS-485) MUST use `set()`, which
   * rejects read-only parameters. Bounds are still validated; step and
   * enum checks are intentionally skipped because monitor values are not
   * user-writable steps.
   */
  updateReadOnly(id: string, value: number): ParameterWriteResult {
    const def = this.definitions.get(id);
    if (def === undefined) {
      return { ok: false, reason: `parameter "${id}" is not in the loaded schema` };
    }
    if (def.access !== ParameterAccess.READ_ONLY) {
      return { ok: false, reason: `parameter "${id}" is not a read-only monitor parameter` };
    }
    if (def.min !== null && value < def.min - 1e-9) {
      return { ok: false, reason: `${id}: value ${value} below min ${def.min}` };
    }
    if (def.max !== null && value > def.max + 1e-9) {
      return { ok: false, reason: `${id}: value ${value} above max ${def.max}` };
    }
    this.values.set(id, value);
    return { ok: true };
  }

  /**
   * Restores the factory default for one parameter, or for all parameters
   * when `id` is omitted. Read-only parameters are always at their
   * default and are skipped.
   *
   * NOTE: on the real drive this operation is governed by 00-02
   * (parameter reset behavior); the simulator exposes it directly for
   * testability (see schema provenance for 00-02).
   */
  reset(id?: string): void {
    if (id !== undefined) {
      const def = this.definitions.get(id);
      if (def === undefined || def.access === ParameterAccess.READ_ONLY) return;
      this.values.set(id, def.default ?? 0);
      return;
    }
    for (const def of this.definitions.values()) {
      this.values.set(def.id, def.default ?? 0);
    }
  }
}

/**
 * Structural validation of a whole EVC definition set.
 *
 * Rejects: empty sets, duplicate ids, malformed ids, and definitions
 * whose known min/max/step/enum/default are mutually inconsistent.
 * Null (source-gap) bounds are permitted and simply not cross-checked.
 */
export function validateDefinitionSet(
  defs: readonly ParameterDefinition[]
): ParameterLoadResult {
  if (defs.length === 0) {
    return { ok: false, reason: "parameter schema is empty" };
  }
  const seen = new Set<string>();
  for (const def of defs) {
    if (seen.has(def.id)) {
      return { ok: false, reason: `duplicate parameter id "${def.id}"` };
    }
    seen.add(def.id);
    if (!/^\d{2}-\d{2,3}$/.test(def.id)) {
      return { ok: false, reason: `malformed parameter id "${def.id}"` };
    }
    for (const field of ["default", "min", "max", "step"] as const) {
      const v = def[field];
      if (v !== null && !Number.isFinite(v)) {
        return { ok: false, reason: `parameter "${def.id}": ${field} must be finite or null` };
      }
    }
    if (def.min !== null && def.max !== null && def.min > def.max) {
      return { ok: false, reason: `parameter "${def.id}": min ${def.min} > max ${def.max}` };
    }
    if (def.step !== null && def.step <= 0 && def.datatype !== "ENUM") {
      return { ok: false, reason: `parameter "${def.id}": step must be > 0 or null` };
    }
    if (def.default !== null && def.min !== null && def.default < def.min - 1e-9) {
      return { ok: false, reason: `parameter "${def.id}": default ${def.default} below min ${def.min}` };
    }
    if (def.default !== null && def.max !== null && def.default > def.max + 1e-9) {
      return { ok: false, reason: `parameter "${def.id}": default ${def.default} above max ${def.max}` };
    }
    if (def.enum !== undefined) {
      const enumValues = new Set<number>();
      for (const option of def.enum) {
        if (enumValues.has(option.value)) {
          return {
            ok: false,
            reason: `parameter "${def.id}": duplicate enum value ${option.value}`
          };
        }
        enumValues.add(option.value);
        if (def.min !== null && option.value < def.min - 1e-9) {
          return {
            ok: false,
            reason: `parameter "${def.id}": enum value ${option.value} below min ${def.min}`
          };
        }
        if (def.max !== null && option.value > def.max + 1e-9) {
          return {
            ok: false,
            reason: `parameter "${def.id}": enum value ${option.value} above max ${def.max}`
          };
        }
      }
      if (def.default !== null && !enumValues.has(def.default)) {
        return {
          ok: false,
          reason: `parameter "${def.id}": default ${def.default} not in enum`
        };
      }
    }
  }
  return { ok: true, reason: undefined };
}

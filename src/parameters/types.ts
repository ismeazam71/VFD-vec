/**
 * EVC v1.0 parameter schema types.
 *
 * Every parameter definition in this project is expressed as a
 * `ParameterDefinition` record. The VFD-V schema lives in
 * `src/devices/vfd-v/schema/`; the runtime engine must read values
 * through the `ParameterRegistry` — never from duplicated copies.
 *
 * NULL VALUES (source gaps):
 *   `default`, `min`, `max`, `step` may be `null` when the value is not
 *   established by the available source material (see
 *   `src/devices/vfd-v/schema/provenance.ts`). Semantics:
 *     - null default -> the registry initializes the value to 0
 *     - null min/max -> unbounded on that side for validation
 *     - null step    -> no step alignment check
 *   Engine-bound parameters must NOT be null (the engine validates this
 *   at construction time and fails loudly with the gap list).
 */

/** Datatypes used by the EVC v1.0 schema. */
export const ParameterDatatype = {
  INT16: "INT16",
  INT32: "INT32",
  UINT16: "UINT16",
  UINT32: "UINT32",
  REAL: "REAL",
  ENUM: "ENUM"
} as const;

export type ParameterDatatype = (typeof ParameterDatatype)[keyof typeof ParameterDatatype];

/** Write access rules per EVC schema. */
export const ParameterAccess = {
  READ_WRITE: "READ_WRITE",
  READ_ONLY: "READ_ONLY",
  WRITE_ONLY: "WRITE_ONLY"
} as const;

export type ParameterAccess = (typeof ParameterAccess)[keyof typeof ParameterAccess];

/** One selectable value of an ENUM parameter. */
export interface ParameterEnumOption {
  readonly value: number;
  readonly label: string;
}

/**
 * A single EVC v1.0 parameter record.
 *
 * Field names intentionally mirror the EVC schema so the loader can map
 * file records onto this interface without renaming.
 */
export interface ParameterDefinition {
  /** Parameter address, e.g. "01-00". */
  readonly id: string;
  /** Official Delta parameter name (do not rename). */
  readonly name: string;
  readonly datatype: ParameterDatatype;
  /** Engineering unit (Hz, s, %, V, A ...). Absent for unitless parameters. */
  readonly unit: string | undefined;
  /** Factory default value; null = source gap (see provenance). */
  readonly default: number | null;
  /** Minimum value; null = not established. */
  readonly min: number | null;
  /** Maximum value; null = not established. */
  readonly max: number | null;
  /** Step increment; null = not established. */
  readonly step: number | null;
  /** Allowed values for ENUM parameters. Absent for numeric parameters. */
  readonly enum: readonly ParameterEnumOption[] | undefined;
  /** Runtime effect description (documentation, not logic). */
  readonly runtimeEffect: string | undefined;
  readonly access: ParameterAccess;
}

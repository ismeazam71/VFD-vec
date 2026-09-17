/**
 * EVC v1.0 parameter schema types.
 *
 * Every parameter definition in this project is expressed as a
 * `ParameterDefinition` record, loaded from the authoritative EVC file
 * (VFD-V_EVC_v1.0_core_parameters.evc). The runtime engine must read
 * values through the `ParameterRegistry` — never from duplicated copies.
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
  /** Human-readable parameter name from the EVC file. */
  readonly name: string;
  readonly datatype: ParameterDatatype;
  /** Engineering unit (Hz, s, %, V, A ...). Absent for unitless parameters. */
  readonly unit: string | undefined;
  /** Factory default value. */
  readonly default: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  /** Allowed values for ENUM parameters. Absent for numeric parameters. */
  readonly enum: readonly ParameterEnumOption[] | undefined;
  /** Runtime effect description from the EVC file (documentation, not logic). */
  readonly runtimeEffect: string | undefined;
  readonly access: ParameterAccess;
}

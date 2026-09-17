/**
 * Validation results for parameter reads/writes.
 */
export type ParameterWriteResult =
  { readonly ok: true } | { readonly ok: false; readonly reason: string };

/**
 * Result of a bulk parameter load / definition check.
 */
export interface ParameterLoadResult {
  readonly ok: boolean;
  /** First structural problem found in the definition set, if any. */
  readonly reason: string | undefined;
}

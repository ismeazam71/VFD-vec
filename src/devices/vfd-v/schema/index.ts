import { VFD_V_CORE_PARAMETERS, VFD_V_CORE_PARAMETER_COUNT } from "./vfdVCoreParameters.js";
import { VFD_V_PROVENANCE } from "./provenance.js";

export { VFD_V_CORE_PARAMETERS, VFD_V_CORE_PARAMETER_COUNT } from "./vfdVCoreParameters.js";
export {
  VFD_V_PROVENANCE,
  ProvenanceStatus,
  getProvenance,
  getVfdVSourceGaps,
  getVfdVReferenceValues
} from "./provenance.js";
export type { ParameterProvenance } from "./provenance.js";

/**
 * Sanity guard: every schema parameter must have a provenance record.
 * Called once at engine construction (cheap; 85 entries).
 *
 * @throws Error listing parameters missing provenance records.
 */
export function assertSchemaProvenanceComplete(): void {
  const missing = VFD_V_CORE_PARAMETERS.filter((p) => VFD_V_PROVENANCE[p.id] === undefined).map(
    (p) => p.id
  );
  if (missing.length > 0) {
    throw new Error(`VFD-V schema: missing provenance records for: ${missing.join(", ")}`);
  }
  if (VFD_V_CORE_PARAMETER_COUNT !== 85) {
    throw new Error(`VFD-V schema: expected 85 core parameters, found ${VFD_V_CORE_PARAMETER_COUNT}`);
  }
}

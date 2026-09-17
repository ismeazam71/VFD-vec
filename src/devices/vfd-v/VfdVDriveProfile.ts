import { ParameterRegistry } from "../../parameters/ParameterRegistry.js";
import { VfdVRuntimeEngine, type VfdVEngineConfig } from "../../simulation/VfdVRuntimeEngine.js";
import {
  VFD_V_CORE_PARAMETERS,
  VFD_V_CORE_PARAMETER_COUNT,
  assertSchemaProvenanceComplete,
  getProvenance,
  getVfdVSourceGaps,
  getVfdVReferenceValues,
  ProvenanceStatus,
  VFD_V_PROVENANCE
} from "./schema/index.js";
export { assertSchemaProvenanceComplete } from "./schema/index.js";
import { VFD_V_CORE_TERMINALS, getVfdVTerminal } from "./terminals.js";
import type { TerminalDefinition } from "../../terminals/types.js";
import type { ParameterProvenance } from "./schema/provenance.js";
import type { ParameterDefinition } from "../../parameters/types.js";

/**
 * VFD-V drive profile — the plugin entry point for the Delta VFD-V.
 *
 * A drive profile packages everything that is VFD-V specific:
 *   - the EVC v1.0 core parameter schema (85 parameters) + provenance
 *   - the core terminal profile (18 terminals)
 *   - a factory for the runtime engine
 *
 * Other drive models (other Delta series, Siemens, ...) will register
 * their own profiles; the simulator core stays drive-agnostic.
 */
export interface DriveProfile {
  readonly id: string;
  readonly manufacturer: string;
  readonly series: string;
  readonly parameterCount: number;
  loadSchema(registry: ParameterRegistry): void;
  getTerminals(): readonly TerminalDefinition[];
  getTerminal(id: string): TerminalDefinition;
  getProvenance(parameterId: string): ParameterProvenance;
  getSourceGaps(): string[];
  getReferenceValues(): string[];
  createEngine(config: Omit<VfdVEngineConfig, "parameters"> & { parameters?: ParameterRegistry }): VfdVRuntimeEngine;
}

export const VfdVDriveProfile: DriveProfile = {
  id: "delta-vfd-v-core",
  manufacturer: "Delta Electronics",
  series: "VFD-V",
  parameterCount: VFD_V_CORE_PARAMETER_COUNT,

  loadSchema(registry: ParameterRegistry): void {
    assertSchemaProvenanceComplete();
    const result = registry.load(VFD_V_CORE_PARAMETERS);
    if (!result.ok) {
      throw new Error(`VfdVDriveProfile: failed to load schema: ${result.reason}`);
    }
  },

  getTerminals(): readonly TerminalDefinition[] {
    return VFD_V_CORE_TERMINALS;
  },

  getTerminal(id: string): TerminalDefinition {
    return getVfdVTerminal(id);
  },

  getProvenance(parameterId: string): ParameterProvenance {
    return getProvenance(parameterId);
  },

  getSourceGaps(): string[] {
    return getVfdVSourceGaps();
  },

  getReferenceValues(): string[] {
    return getVfdVReferenceValues();
  },

  /**
   * Creates a VFD-V engine. When `config.parameters` is omitted, a
   * fresh registry is created and loaded with the VFD-V core schema.
   */
  createEngine(
    config: Omit<VfdVEngineConfig, "parameters"> & { parameters?: ParameterRegistry }
  ): VfdVRuntimeEngine {
    const registry =
      config.parameters ?? (() => {
        const reg = new ParameterRegistry();
        this.loadSchema(reg);
        return reg;
      })();
    return new VfdVRuntimeEngine({
      parameters: registry,
      model: config.model,
      conflictRule: config.conflictRule
    });
  }
};

export {
  VFD_V_CORE_PARAMETERS,
  VFD_V_CORE_PARAMETER_COUNT,
  VFD_V_CORE_TERMINALS,
  VFD_V_PROVENANCE,
  ProvenanceStatus,
  getProvenance,
  getVfdVSourceGaps,
  getVfdVReferenceValues
};
export type { ParameterDefinition, ParameterProvenance };

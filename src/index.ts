/**
 * vfd-vec — PLC Simulator with modular VFD/drive engine.
 *
 * Public API (core version).
 *
 * The simulation engine is deterministic and headless: it has no
 * dependency on React, timers, or wall-clock time. The update contract
 * is `engine.update(dt) -> VfdVRuntimeState`.
 */

// --- Parameter layer ----------------------------------------------------
export { ParameterDatatype, ParameterAccess } from "./parameters/types.js";
export type {
  ParameterDefinition,
  ParameterDatatype as ParameterDatatypeType,
  ParameterAccess as ParameterAccessType,
  ParameterEnumOption
} from "./parameters/types.js";
export { ParameterRegistry, validateDefinitionSet } from "./parameters/ParameterRegistry.js";
export { validateParameterValue } from "./parameters/validate.js";
export type { ParameterLoadResult, ParameterWriteResult } from "./parameters/results.js";
export { ParamId, PARAM_ADDRESSES } from "./parameters/paramIds.js";
export type { ParamAddress } from "./parameters/paramIds.js";

// --- State machine --------------------------------------------------------
export {
  VfdVState,
  VfdVEvent,
  ALL_VFD_V_STATES,
  ALL_VFD_V_EVENTS
} from "./simulation/state/VfdVState.js";
export type {
  VfdVState as VfdVStateType,
  VfdVEvent as VfdVEventType
} from "./simulation/state/VfdVState.js";
export { VfdStateMachine } from "./simulation/state/VfdStateMachine.js";

// --- Runtime state ---------------------------------------------------------
export {
  createInitialVfdVState,
  createDefaultVfdVInputs
} from "./simulation/state/VfdRuntimeState.js";
export type {
  VfdVRuntimeState,
  VfdVPhysicalInputs,
  InputPhases
} from "./simulation/state/VfdRuntimeState.js";

// --- Faults ------------------------------------------------------------------
export { FaultCodes, FaultSeverity, getFaultCode } from "./simulation/faults/FaultCodes.js";
export type { FaultCodeDefinition, FaultCodeKey } from "./simulation/faults/FaultCodes.js";
export { FaultHistory } from "./simulation/faults/FaultHistory.js";
export type { FaultRecord } from "./simulation/faults/FaultHistory.js";
export { FaultManager } from "./simulation/faults/FaultManager.js";

// --- Terminals -----------------------------------------------------------------
export { TerminalType } from "./terminals/types.js";
export type { TerminalDefinition, TerminalDirection } from "./terminals/types.js";
export { VFD_V_CORE_TERMINALS, getVfdVTerminal } from "./terminals/vfdVTerminals.js";

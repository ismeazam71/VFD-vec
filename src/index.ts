/**
 * vfd-vec — PLC Simulator with modular VFD/drive engine.
 *
 * Public API (core version).
 *
 * The simulation engine is deterministic and headless: it has no
 * dependency on React, timers, or wall-clock time. The update contract
 * is `engine.update(dt) -> VfdVRuntimeState`.
 */

// --- Generic EVC v1.0 parameter layer --------------------------------------
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

// --- Generic terminal model types ---------------------------------------------
export { TerminalType } from "./terminals/types.js";
export type { TerminalDefinition, TerminalDirection } from "./terminals/types.js";

// --- Generic simulation core -----------------------------------------------------
export { VfdVState, VfdVEvent, ALL_VFD_V_STATES, ALL_VFD_V_EVENTS } from "./simulation/state/VfdVState.js";
export type {
  VfdVState as VfdVStateType,
  VfdVEvent as VfdVEventType
} from "./simulation/state/VfdVState.js";
export { VfdStateMachine } from "./simulation/state/VfdStateMachine.js";
export {
  createInitialVfdVState,
  createDefaultVfdVInputs
} from "./simulation/state/VfdRuntimeState.js";
export type {
  VfdVRuntimeState,
  VfdVPhysicalInputs,
  InputPhases
} from "./simulation/state/VfdRuntimeState.js";
export { FaultManager } from "./simulation/faults/FaultManager.js";
export { FaultHistory } from "./simulation/faults/FaultHistory.js";
export type { FaultRecord } from "./simulation/faults/FaultHistory.js";
export { VFD_V_REFERENCE_MODEL } from "./simulation/modelConstants.js";
export type { VfdVMotorModelConfig } from "./simulation/modelConstants.js";

// --- Command / frequency / motor / voltage / io / protection modules ---------------
export { CommandSourceManager } from "./simulation/command/CommandSourceManager.js";
export type { ResolvedCommands } from "./simulation/command/CommandSourceManager.js";
export {
  DigitalCommandEngine,
  ConflictRule,
  DEFAULT_CONFLICT_RULE
} from "./simulation/command/DigitalCommandEngine.js";
export type { ResolvedTerminalCommand } from "./simulation/command/DigitalCommandEngine.js";
export { AnalogCommandEngine } from "./simulation/command/AnalogCommandEngine.js";
export {
  CommunicationCommandEngine,
  NO_COMM_FREQUENCY
} from "./simulation/command/CommunicationCommandEngine.js";
export type { CommunicationCommandState } from "./simulation/command/CommunicationCommandEngine.js";
export { FrequencyCommandEngine } from "./simulation/frequency/FrequencyCommandEngine.js";
export { AccelerationController } from "./simulation/frequency/AccelerationController.js";
export { DecelerationController } from "./simulation/frequency/DecelerationController.js";
export { VFController } from "./simulation/voltage/VFController.js";
export { DcBusModel } from "./simulation/voltage/DcBusModel.js";
export type { DcBusStepInput } from "./simulation/voltage/DcBusModel.js";
export { MotorModel } from "./simulation/motor/MotorModel.js";
export type { MotorStepInput, MotorStepOutput } from "./simulation/motor/MotorModel.js";
export { TorqueModel } from "./simulation/motor/TorqueModel.js";
export type { TorqueModelOutput } from "./simulation/motor/TorqueModel.js";
export { SpeedModel } from "./simulation/motor/SpeedModel.js";
export { CurrentModel } from "./simulation/motor/CurrentModel.js";
export { DigitalInputProcessor } from "./simulation/io/DigitalInputProcessor.js";
export type { DigitalInputSignal } from "./simulation/io/DigitalInputProcessor.js";
export { AnalogInputProcessor, AVI_SUPPLY_VOLTAGE_V, readAviConfig } from "./simulation/io/AnalogInputProcessor.js";
export { RelayOutputProcessor } from "./simulation/io/RelayOutputProcessor.js";
export type { RelayContext, RelayStates } from "./simulation/io/RelayOutputProcessor.js";
export { OverCurrentProtection } from "./simulation/protection/OverCurrentProtection.js";
export { OverVoltageProtection } from "./simulation/protection/OverVoltageProtection.js";
export type { OverVoltageResult } from "./simulation/protection/OverVoltageProtection.js";
export { UnderVoltageProtection } from "./simulation/protection/UnderVoltageProtection.js";
export { PhaseLossProtection } from "./simulation/protection/PhaseLossProtection.js";
export type { PhaseLossResult } from "./simulation/protection/PhaseLossProtection.js";
export { OverTorqueProtection } from "./simulation/protection/OverTorqueProtection.js";
export type { OverTorqueResult } from "./simulation/protection/OverTorqueProtection.js";
export { OverloadProtection } from "./simulation/protection/OverloadProtection.js";
export type { OverloadResult } from "./simulation/protection/OverloadProtection.js";
export { ThermalProtection } from "./simulation/protection/ThermalProtection.js";
export type { ThermalState } from "./simulation/protection/ThermalProtection.js";
export { ExternalFaultProtection } from "./simulation/protection/ExternalFaultProtection.js";
export { VfdRs485Interface } from "./simulation/communication/VfdRs485Interface.js";
export type { Rs485Command, Rs485ReadResult } from "./simulation/communication/VfdRs485Interface.js";
export { VfdMonitorValues, MONITOR_IDS } from "./simulation/monitoring/VfdMonitorValues.js";
export type { MonitorId } from "./simulation/monitoring/VfdMonitorValues.js";
export { VfdVRuntimeEngine } from "./simulation/VfdVRuntimeEngine.js";
export type { VfdVEngineConfig } from "./simulation/VfdVRuntimeEngine.js";

// --- Delta VFD-V device profile -------------------------------------------------------
export {
  VfdVDriveProfile,
  VFD_V_CORE_PARAMETERS,
  VFD_V_CORE_PARAMETER_COUNT,
  VFD_V_CORE_TERMINALS,
  VFD_V_PROVENANCE,
  ProvenanceStatus,
  getProvenance,
  getVfdVSourceGaps,
  getVfdVReferenceValues,
  assertSchemaProvenanceComplete
} from "./devices/vfd-v/VfdVDriveProfile.js";
export type { DriveProfile } from "./devices/vfd-v/VfdVDriveProfile.js";
export { getVfdVTerminal } from "./devices/vfd-v/terminals.js";
export { ParamId, PARAM_ADDRESSES } from "./devices/vfd-v/paramIds.js";
export type { ParamAddress } from "./devices/vfd-v/paramIds.js";
export { FaultCodes, FaultSeverity, getFaultCode } from "./devices/vfd-v/faultCodes.js";
export type { FaultCodeDefinition, FaultCodeKey } from "./devices/vfd-v/faultCodes.js";
export { encodeFaultRecord, decodeFaultRecord, NO_FAULT_RECORDED } from "./devices/vfd-v/faultRecordValues.js";

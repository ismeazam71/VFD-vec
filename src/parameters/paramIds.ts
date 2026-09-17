/**
 * Centralized parameter address bindings.
 *
 * Runtime modules must reference parameters through these identifiers —
 * never through raw string literals — so the address set is defined in
 * exactly one place and can be audited against the EVC v1.0 schema.
 *
 * Only parameters whose meaning is fixed by the core specification are
 * listed here. The remaining addresses (V/F curve points 01-01..01-08,
 * relay RB/RC functions, thermal relay details) are bound during the EVC
 * schema integration step, when their names are taken verbatim from
 * VFD-V_EVC_v1.0_core_parameters.evc.
 */
export const ParamId = {
  // --- Group 00: system functions -------------------------------------
  /** 00-02 — parameter reset behavior. */
  parameterReset: "00-02",
  /** 00-20 — source of frequency command. */
  frequencyCommandSource: "00-20",
  /** 00-21 — source of operation command. */
  operationCommandSource: "00-21",
  /** 00-22 — stop method (0 = ramp, 1 = coast). */
  stopMethod: "00-22",
  /** 00-23 — reverse operation enable. */
  reverseOperation: "00-23",

  // --- Group 01: basic functions ---------------------------------------
  /** 01-00 — maximum operation frequency (Hz). */
  maxOperationFrequency: "01-00",
  /** 01-09 — minimum output frequency (Hz). */
  minOutputFrequency: "01-09",
  /** 01-10 — upper bound frequency (Hz). */
  upperBoundFrequency: "01-10",
  /** 01-11 — lower bound frequency (Hz). */
  lowerBoundFrequency: "01-11",
  /** 01-12 — 1st acceleration time (s). */
  firstAccelerationTime: "01-12",
  /** 01-13 — 1st deceleration time (s). */
  firstDecelerationTime: "01-13",
  /** 01-14 — 2nd acceleration time (s). */
  secondAccelerationTime: "01-14",
  /** 01-15 — 2nd deceleration time (s). */
  secondDecelerationTime: "01-15",
  /** 01-16 — 3rd acceleration time (s). */
  thirdAccelerationTime: "01-16",
  /** 01-17 — 3rd deceleration time (s). */
  thirdDecelerationTime: "01-17",
  /** 01-18 — 4th acceleration time (s). */
  fourthAccelerationTime: "01-18",
  /** 01-19 — 4th deceleration time (s). */
  fourthDecelerationTime: "01-19",

  // --- Group 02: multifunction terminals --------------------------------
  /** 02-00 — external terminal control mode (2-wire FWD/STOP + REV/STOP). */
  externalTerminalControlMode: "02-00",
  /** 02-11 — RA relay multifunction output selection. */
  relayFunctionRA: "02-11",
  // TODO(EVC): bind RB/RC relay function parameters once the EVC schema is in.

  // --- Group 03: analog input -------------------------------------------
  /** 03-00 — AVI function selection. */
  aviFunction: "03-00",
  /** 03-03 — AVI bias. */
  aviBias: "03-03",
  /** 03-06 — AVI bias mode. */
  aviBiasMode: "03-06",
  /** 03-09 — AVI gain. */
  aviGain: "03-09",

  // --- Group 05: motor parameters ---------------------------------------
  /** 05-01 — motor full-load current (A). */
  motorFullLoadCurrent: "05-01",
  /** 05-02 — motor no-load current (A). */
  motorNoLoadCurrent: "05-02",
  /** 05-03 — torque compensation. */
  torqueCompensation: "05-03",
  /** 05-04 — slip compensation. */
  slipCompensation: "05-04",
  /** 05-05 — motor number of poles. */
  motorPoles: "05-05",

  // --- Group 06: protection ----------------------------------------------
  /** 06-00 — input under-voltage (Lv) protection level. */
  underVoltageProtection: "06-00",
  /** 06-01 — over-voltage (OV) protection level. */
  overVoltageProtection: "06-01",
  /** 06-02 — input phase-loss protection and response. */
  phaseLossProtection: "06-02",
  /** 06-03 — acceleration over-current (ocA) level. */
  accelOverCurrentLevel: "06-03",
  /** 06-04 — deceleration over-current (ocd) level. */
  decelOverCurrentLevel: "06-04",
  /** 06-05 — constant-speed over-current (ocn) level. */
  constSpeedOverCurrentLevel: "06-05",
  /** 06-06 — over-torque (oL2) level. */
  overTorqueLevel: "06-06",
  /** 06-07 — over-torque detection time. */
  overTorqueTime: "06-07",
  /** 06-08 — over-torque response (disabled / continue / stop). */
  overTorqueResponse: "06-08",
  /** 06-13 — electronic thermal relay setting 1. */
  thermalRelaySetting1: "06-13",
  /** 06-14 — electronic thermal relay setting 2. */
  thermalRelaySetting2: "06-14",
  /** 06-15 — thermal protection behavior setting. */
  thermalProtectionBehavior: "06-15",
  /** 06-17 — fault history slot 1 (newest fault). */
  faultHistory1: "06-17",
  /** 06-18 — fault history slot 2. */
  faultHistory2: "06-18",
  /** 06-19 — fault history slot 3. */
  faultHistory3: "06-19",
  /** 06-20 — fault history slot 4 (oldest fault). */
  faultHistory4: "06-20",

  // --- Group 09: communication -------------------------------------------
  /** 09-00 — RS-485 communication address. */
  communicationAddress: "09-00",
  /** 09-01 — RS-485 transmission speed (baud rate). */
  transmissionSpeed: "09-01"
} as const;

export type ParamAddress = (typeof ParamId)[keyof typeof ParamId];

/** All parameter addresses bound in this module (useful for validation). */
export const PARAM_ADDRESSES: readonly string[] = Object.values(ParamId);

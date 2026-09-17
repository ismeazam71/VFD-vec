/**
 * Centralized VFD-V parameter address bindings.
 *
 * Runtime modules must reference parameters through these identifiers —
 * never through raw string literals — so the address set is defined in
 * exactly one place and can be audited against the EVC v1.0 schema.
 *
 * Every address here MUST exist in `vfdVCoreParameters.ts` (asserted by
 * tests). Addresses marked (schema-only) are part of the schema but not
 * consumed by the core engine.
 */
export const ParamId = {
  // --- Group 00: system functions ----------------------------------------
  driveSelection: "00-00",
  controlModeSelection: "00-01",
  parameterReset: "00-02",
  operationPassword: "00-03",
  /** 00-20 — source of frequency command. */
  frequencyCommandSource: "00-20",
  /** 00-21 — source of operation command. */
  operationCommandSource: "00-21",
  /** 00-22 — stop method (0 = ramp, 1 = coast). */
  stopMethod: "00-22",
  /** 00-23 — reverse operation enable. */
  reverseOperation: "00-23",

  // --- Group 01: basic functions ------------------------------------------
  /** 01-00 — maximum operation frequency (Hz). */
  maxOperationFrequency: "01-00",
  /** 01-01 — maximum operation voltage (V). */
  maxOperationVoltage: "01-01",
  /** 01-02 — 1st V/F point frequency (Hz). */
  vfPoint1Frequency: "01-02",
  /** 01-03 — 1st V/F point voltage (V). */
  vfPoint1Voltage: "01-03",
  /** 01-04 — 2nd V/F point frequency (Hz). */
  vfPoint2Frequency: "01-04",
  /** 01-05 — 2nd V/F point voltage (V). */
  vfPoint2Voltage: "01-05",
  /** 01-06 — 3rd V/F point frequency (Hz). */
  vfPoint3Frequency: "01-06",
  /** 01-07 — 3rd V/F point voltage (V). */
  vfPoint3Voltage: "01-07",
  /** 01-08 — torque boost (%). Schema-only in core (see provenance). */
  torqueBoost: "01-08",
  /** 01-09 — minimum operation frequency (Hz). */
  minOutputFrequency: "01-09",
  /** 01-10 — upper bound frequency (Hz). */
  upperBoundFrequency: "01-10",
  /** 01-11 — lower bound frequency (Hz). */
  lowerBoundFrequency: "01-11",
  /** 01-12 — 1st acceleration time (s). */
  firstAccelerationTime: "01-12",
  /** 01-13 — 1st deceleration time (s). */
  firstDecelerationTime: "01-13",
  /** 01-14 — 2nd acceleration time (s). Schema-only in core. */
  secondAccelerationTime: "01-14",
  /** 01-15 — 2nd deceleration time (s). Schema-only in core. */
  secondDecelerationTime: "01-15",
  /** 01-16 — 3rd acceleration time (s). Schema-only in core. */
  thirdAccelerationTime: "01-16",
  /** 01-17 — 3rd deceleration time (s). Schema-only in core. */
  thirdDecelerationTime: "01-17",
  /** 01-18 — 4th acceleration time (s). Schema-only in core. */
  fourthAccelerationTime: "01-18",
  /** 01-19 — 4th deceleration time (s). Schema-only in core. */
  fourthDecelerationTime: "01-19",

  // --- Group 02: multifunction terminals -----------------------------------
  /** 02-00 — external terminal operation mode. */
  externalTerminalControlMode: "02-00",
  /** 02-07..02-09 — MO1-MO3 multifunction outputs. Schema-only in core
   *  (MO terminals are not part of the core terminal profile). */
  moFunction1: "02-07",
  moFunction2: "02-08",
  moFunction3: "02-09",
  /** 02-11 — RA relay multifunction output selection. */
  relayFunctionRA: "02-11",
  /** 02-12 — RB relay multifunction output selection. */
  relayFunctionRB: "02-12",
  /** 02-13 — RC relay multifunction output selection. */
  relayFunctionRC: "02-13",

  // --- Group 03: analog input (AVI) -----------------------------------------
  /** 03-00 — AVI function selection. */
  aviFunction: "03-00",
  /** 03-03 — AVI bias (%). */
  aviBias: "03-03",
  /** 03-06 — AVI bias mode. */
  aviBiasMode: "03-06",
  /** 03-09 — AVI gain (%). */
  aviGain: "03-09",

  // --- Group 04: analog output (AFM). Schema-only in core. -------------------
  afmFunction: "04-00",
  afmRange: "04-01",

  // --- Group 05: motor parameters --------------------------------------------
  /** 05-01 — motor full-load current (A). */
  motorFullLoadCurrent: "05-01",
  /** 05-02 — motor no-load current (A). */
  motorNoLoadCurrent: "05-02",
  /** 05-03 — torque compensation (%). */
  torqueCompensation: "05-03",
  /** 05-04 — slip compensation (%). */
  slipCompensation: "05-04",
  /** 05-05 — motor number of poles. */
  motorPoles: "05-05",
  /** 05-06 — motor rated voltage (V). Schema-only in core. */
  motorRatedVoltage: "05-06",
  /** 05-07 — motor rated output (kW). Schema-only in core. */
  motorRatedOutput: "05-07",

  // --- Group 06: protection ----------------------------------------------------
  /** 06-00 — input under-voltage (Lv) protection level (% of nominal DC bus; 0 = off). */
  underVoltageProtection: "06-00",
  /** 06-01 — inverter over-voltage (OV) protection level (% of nominal DC bus; 0 = off). */
  overVoltageProtection: "06-01",
  /** 06-02 — input phase-loss protection and response. */
  phaseLossProtection: "06-02",
  /** 06-03 — acceleration over-current (ocA) level (% of drive rated current). */
  accelOverCurrentLevel: "06-03",
  /** 06-04 — deceleration over-current (ocd) level. */
  decelOverCurrentLevel: "06-04",
  /** 06-05 — constant-speed over-current (ocn) level. */
  constSpeedOverCurrentLevel: "06-05",
  /** 06-06 — over-torque (oL2) level (% of rated torque; 0 = off). */
  overTorqueLevel: "06-06",
  /** 06-07 — over-torque detection time (s). */
  overTorqueTime: "06-07",
  /** 06-08 — over-torque response. */
  overTorqueResponse: "06-08",
  /** 06-13 — electronic thermal relay 1 (motor rated current, % of 05-01). */
  thermalRelayMotorCurrent: "06-13",
  /** 06-14 — electronic thermal relay 2 (ambient temperature, °C). */
  thermalRelayAmbient: "06-14",
  /** 06-15 — thermal protection behavior (auto/manual reset). */
  thermalProtectionBehavior: "06-15",
  /** 06-17 — fault record 1 (newest). */
  faultHistory1: "06-17",
  /** 06-18 — fault record 2. */
  faultHistory2: "06-18",
  /** 06-19 — fault record 3. */
  faultHistory3: "06-19",
  /** 06-20 — fault record 4 (oldest). */
  faultHistory4: "06-20",

  // --- Group 07: control. Schema-only in core (multi-step module later). --------
  multiStepSpeedSource: "07-00",
  multiStepSpeed1: "07-01",
  multiStepSpeed2: "07-02",
  multiStepSpeed3: "07-03",
  multiStepSpeed4: "07-04",
  multiStepSpeed5: "07-05",
  multiStepSpeed6: "07-06",
  multiStepSpeed7: "07-07",
  multiStepSpeed8: "07-08",
  multiStepSpeed9: "07-09",
  multiStepSpeed10: "07-10",

  // --- Group 09: communication (RS-485) ------------------------------------------
  /** 09-00 — RS-485 communication address. */
  communicationAddress: "09-00",
  /** 09-01 — RS-485 transmission speed (baud rate). */
  transmissionSpeed: "09-01",
  /** 09-02 — communication data format. Schema-only in core. */
  communicationDataFormat: "09-02",
  /** 09-03 — communication timeout. Schema-only in core. */
  communicationTimeout: "09-03"
} as const;

export type ParamAddress = (typeof ParamId)[keyof typeof ParamId];

/** All parameter addresses bound in this module (useful for validation). */
export const PARAM_ADDRESSES: readonly string[] = Object.values(ParamId);

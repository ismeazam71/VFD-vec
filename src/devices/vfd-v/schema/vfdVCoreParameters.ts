import { ParameterAccess, ParameterDatatype, type ParameterDefinition } from "../../../parameters/types.js";

/**
 * VFD-V EVC v1.0 core parameter schema (85 parameters).
 *
 * RECONSTRUCTED from the Delta VFD-V parameter reference available in
 * the project conversation (the authoritative EVC file was not present
 * in the workspace). Official Delta parameter numbers and terminology
 * are preserved. Values that could not be established are `null` — see
 * `provenance.ts` for the full source-gap list.
 *
 * This is the single source of truth for parameter metadata in the
 * project; no other module defines parameter values.
 */

type NumOpts = Partial<{
  unit: string;
  default: number | null;
  min: number | null;
  max: number | null;
  step: number | null;
  access: (typeof ParameterAccess)[keyof typeof ParameterAccess];
  runtimeEffect: string;
}>;

type EnumOpts = {
  unit?: string;
  default: number;
  min: number;
  max: number;
  options: ReadonlyArray<{ value: number; label: string }>;
  access?: (typeof ParameterAccess)[keyof typeof ParameterAccess];
  runtimeEffect?: string;
};

function num(
  id: string,
  name: string,
  datatype: (typeof ParameterDatatype)[keyof typeof ParameterDatatype],
  opts: NumOpts = {}
): ParameterDefinition {
  return {
    id,
    name,
    datatype,
    unit: opts.unit,
    default: opts.default ?? null,
    min: opts.min ?? null,
    max: opts.max ?? null,
    step: opts.step ?? null,
    enum: undefined,
    runtimeEffect: opts.runtimeEffect,
    access: opts.access ?? ParameterAccess.READ_WRITE
  };
}

function enu(id: string, name: string, opts: EnumOpts): ParameterDefinition {
  return {
    id,
    name,
    datatype: ParameterDatatype.ENUM,
    unit: opts.unit,
    default: opts.default,
    min: opts.min,
    max: opts.max,
    step: 1,
    enum: opts.options.map((o) => ({ value: o.value, label: o.label })),
    runtimeEffect: opts.runtimeEffect,
    access: opts.access ?? ParameterAccess.READ_WRITE
  };
}

// Option sets shared by the multifunction output parameters.
const RELAY_FUNCTIONS = [
  { value: 0, label: "No function" },
  { value: 1, label: "AC Drive Running" },
  { value: 2, label: "Speed Attained" },
  { value: 3, label: "Zero Speed" },
  { value: 4, label: "Drive Ready" },
  { value: 5, label: "Error indication" }
] as const;

const COMMAND_SOURCES = [
  { value: 0, label: "RS-485 (communication)" },
  { value: 1, label: "External terminal" },
  { value: 2, label: "Digital keypad" }
] as const;

export const VFD_V_CORE_PARAMETERS: readonly ParameterDefinition[] = [
  // =========================================================================
  // Group 00 — System functions
  // =========================================================================
  enu("00-00", "Drive selection", {
    default: 0,
    min: 0,
    max: 0,
    options: [{ value: 0, label: "General purpose (VFD-V)" }],
    runtimeEffect: "Selects the drive type. Core simulator implements the general-purpose VFD-V only."
  }),
  enu("00-01", "Control mode selection", {
    default: 0,
    min: 0,
    max: 1,
    options: [
      { value: 0, label: "V/F control" },
      { value: 1, label: "Vector control (sensorless)" }
    ],
    runtimeEffect: "Core engine implements V/F control only; vector control is a later capability module."
  }),
  enu("00-02", "Parameter reset", {
    default: 0,
    min: 0,
    max: 1,
    options: [
      { value: 0, label: "Reset after power off" },
      { value: 1, label: "Reset anytime" }
    ],
    runtimeEffect: "Parameter reset behavior (semantics best-effort — see provenance)."
  }),
  num("00-03", "Operation password", ParameterDatatype.INT16, {
    default: 0,
    min: 0,
    max: 999,
    step: 1,
    runtimeEffect: "Operation password (000-999); not enforced by the core simulator."
  }),
  enu("00-20", "Source of frequency command", {
    default: 2,
    min: 0,
    max: 2,
    options: COMMAND_SOURCES,
    runtimeEffect: "Selects the frequency command source: RS-485 / external terminal (AVI) / digital keypad."
  }),
  enu("00-21", "Source of operation command", {
    default: 2,
    min: 0,
    max: 2,
    options: COMMAND_SOURCES,
    runtimeEffect: "Selects the operation command source: RS-485 / external terminals (FWD/REV) / digital keypad."
  }),
  enu("00-22", "Stop method", {
    default: 0,
    min: 0,
    max: 1,
    options: [
      { value: 0, label: "Ramp to stop" },
      { value: 1, label: "Coast to stop" }
    ],
    runtimeEffect: "0 = ramp to stop (deceleration ramp to 0Hz), 1 = coast to stop (output disabled, motor freewheels)."
  }),
  enu("00-23", "Reverse operation", {
    default: 0,
    min: 0,
    max: 1,
    options: [
      { value: 0, label: "Disable" },
      { value: 1, label: "Enable" }
    ],
    runtimeEffect: "When disabled, REV commands must not create reverse motion."
  }),

  // =========================================================================
  // Group 01 — Basic functions
  // =========================================================================
  num("01-00", "Maximum operation frequency", ParameterDatatype.REAL, {
    unit: "Hz",
    default: 60,
    min: 0,
    max: 400,
    step: 0.1,
    runtimeEffect: "Upper limit of the output frequency; anchor of the V/F curve and ramp rate reference."
  }),
  num("01-01", "Maximum operation voltage", ParameterDatatype.REAL, {
    unit: "V",
    default: 480,
    min: 0,
    max: 1000,
    step: 1,
    runtimeEffect: "Maximum output voltage (model-dependent voltage class; 400V-class reference value)."
  }),
  num("01-02", "1st V/F point frequency", ParameterDatatype.REAL, {
    unit: "Hz",
    runtimeEffect: "Programmable V/F curve point 1 (frequency); 0/null = point inactive (linear curve)."
  }),
  num("01-03", "1st V/F point voltage", ParameterDatatype.REAL, {
    unit: "V",
    runtimeEffect: "Programmable V/F curve point 1 (voltage)."
  }),
  num("01-04", "2nd V/F point frequency", ParameterDatatype.REAL, {
    unit: "Hz",
    runtimeEffect: "Programmable V/F curve point 2 (frequency); 0/null = point inactive."
  }),
  num("01-05", "2nd V/F point voltage", ParameterDatatype.REAL, {
    unit: "V",
    runtimeEffect: "Programmable V/F curve point 2 (voltage)."
  }),
  num("01-06", "3rd V/F point frequency", ParameterDatatype.REAL, {
    unit: "Hz",
    runtimeEffect: "Programmable V/F curve point 3 (frequency); 0/null = point inactive."
  }),
  num("01-07", "3rd V/F point voltage", ParameterDatatype.REAL, {
    unit: "V",
    runtimeEffect: "Programmable V/F curve point 3 (voltage). See provenance note: spec §6 lists 01-07 among frequency limits; the VFD-V reference treats it as a V/F point."
  }),
  num("01-08", "Torque boost", ParameterDatatype.REAL, {
    unit: "%",
    runtimeEffect: "Torque compensation / boost at low frequency (semantics gap — core engine does not apply it; see 05-03 which is applied)."
  }),
  num("01-09", "Minimum operation frequency", ParameterDatatype.REAL, {
    unit: "Hz",
    default: 0,
    min: 0,
    max: 400,
    step: 0.1,
    runtimeEffect: "Minimum output frequency; the inverter output deadband at low speed."
  }),
  num("01-10", "Upper bound frequency", ParameterDatatype.REAL, {
    unit: "Hz",
    default: 60,
    min: 0,
    max: 400,
    step: 0.1,
    runtimeEffect: "Upper bound applied to the frequency command (independent of 01-00)."
  }),
  num("01-11", "Lower bound frequency", ParameterDatatype.REAL, {
    unit: "Hz",
    default: 0,
    min: 0,
    max: 400,
    step: 0.1,
    runtimeEffect: "Lower bound applied to the running frequency command; stop always targets 0Hz."
  }),
  num("01-12", "1st acceleration time", ParameterDatatype.REAL, {
    unit: "s",
    default: 10,
    min: 0,
    max: 9999,
    step: 0.1,
    runtimeEffect: "Time for the output frequency to ramp from 0 to 01-00. 0 = immediate."
  }),
  num("01-13", "1st deceleration time", ParameterDatatype.REAL, {
    unit: "s",
    default: 10,
    min: 0,
    max: 9999,
    step: 0.1,
    runtimeEffect: "Time for the output frequency to ramp from 01-00 to 0. 0 = immediate."
  }),
  num("01-14", "2nd acceleration time", ParameterDatatype.REAL, {
    unit: "s",
    default: 10,
    min: 0,
    max: 9999,
    step: 0.1,
    runtimeEffect: "2nd ramp time set (schema only in the core version)."
  }),
  num("01-15", "2nd deceleration time", ParameterDatatype.REAL, {
    unit: "s",
    default: 10,
    min: 0,
    max: 9999,
    step: 0.1,
    runtimeEffect: "2nd ramp time set (schema only in the core version)."
  }),
  num("01-16", "3rd acceleration time", ParameterDatatype.REAL, {
    unit: "s",
    default: 10,
    min: 0,
    max: 9999,
    step: 0.1,
    runtimeEffect: "3rd ramp time set (schema only in the core version)."
  }),
  num("01-17", "3rd deceleration time", ParameterDatatype.REAL, {
    unit: "s",
    default: 10,
    min: 0,
    max: 9999,
    step: 0.1,
    runtimeEffect: "3rd ramp time set (schema only in the core version)."
  }),
  num("01-18", "4th acceleration time", ParameterDatatype.REAL, {
    unit: "s",
    default: 10,
    min: 0,
    max: 9999,
    step: 0.1,
    runtimeEffect: "4th ramp time set (schema only in the core version)."
  }),
  num("01-19", "4th deceleration time", ParameterDatatype.REAL, {
    unit: "s",
    default: 10,
    min: 0,
    max: 9999,
    step: 0.1,
    runtimeEffect: "4th ramp time set (schema only in the core version)."
  }),

  // =========================================================================
  // Group 02 — Multifunction terminals
  // =========================================================================
  enu("02-00", "External terminal operation mode", {
    default: 2,
    min: 0,
    max: 2,
    options: [
      { value: 0, label: "2-wire FWD/REV" },
      { value: 1, label: "3-wire FWD/STOP/REV" },
      { value: 2, label: "2-wire FWD/STOP + REV/STOP" }
    ],
    runtimeEffect: "External terminal control mode. Core engine supports 0 and 2; mode 1 requires a STOP terminal not present in the core profile (rejected at construction)."
  }),
  enu("02-01", "MI1 function", { default: 0, min: 0, max: 0, options: [{ value: 0, label: "No function" }] }),
  enu("02-02", "MI2 function", { default: 0, min: 0, max: 0, options: [{ value: 0, label: "No function" }] }),
  enu("02-03", "MI3 function", { default: 0, min: 0, max: 0, options: [{ value: 0, label: "No function" }] }),
  enu("02-04", "MI4 function", { default: 0, min: 0, max: 0, options: [{ value: 0, label: "No function" }] }),
  enu("02-05", "MI5 function", { default: 0, min: 0, max: 0, options: [{ value: 0, label: "No function" }] }),
  enu("02-06", "MI6 function", { default: 0, min: 0, max: 0, options: [{ value: 0, label: "No function" }] }),
  enu("02-07", "MO1 function", { default: 0, min: 0, max: 5, options: RELAY_FUNCTIONS }),
  enu("02-08", "MO2 function", { default: 0, min: 0, max: 5, options: RELAY_FUNCTIONS }),
  enu("02-09", "MO3 function", { default: 0, min: 0, max: 5, options: RELAY_FUNCTIONS }),
  enu("02-11", "RA relay function", {
    default: 0,
    min: 0,
    max: 5,
    options: RELAY_FUNCTIONS,
    runtimeEffect: "RA multifunction relay output selection (specification §23)."
  }),
  enu("02-12", "RB relay function", { default: 0, min: 0, max: 5, options: RELAY_FUNCTIONS }),
  enu("02-13", "RC relay function", { default: 0, min: 0, max: 5, options: RELAY_FUNCTIONS }),

  // =========================================================================
  // Group 03 — Analog input (AVI)
  // =========================================================================
  enu("03-00", "AVI function", {
    default: 0,
    min: 0,
    max: 0,
    options: [{ value: 0, label: "Frequency command (0-10V)" }],
    runtimeEffect: "AVI terminal function. Core engine implements frequency command only."
  }),
  num("03-03", "AVI bias", ParameterDatatype.REAL, {
    unit: "%",
    default: 0,
    min: 0,
    max: 100,
    step: 1,
    runtimeEffect: "Frequency offset at AVI = 0V, as % of the range."
  }),
  enu("03-06", "AVI bias mode", {
    default: 0,
    min: 0,
    max: 1,
    options: [
      { value: 0, label: "0-10V scaling" },
      { value: 1, label: "4-20mA scaling (not implemented — source gap)" }
    ],
    runtimeEffect: "Analog input scaling mode. Mode 1 semantics not established; the engine rejects it."
  }),
  num("03-09", "AVI gain", ParameterDatatype.REAL, {
    unit: "%",
    default: 100,
    min: 0,
    max: 200,
    step: 1,
    runtimeEffect: "Slope multiplier for the AVI frequency command (100 = full range over 0-10V)."
  }),

  // =========================================================================
  // Group 04 — Analog output (AFM)
  // =========================================================================
  enu("04-00", "AFM function", {
    default: 0,
    min: 0,
    max: 0,
    options: [{ value: 0, label: "Output frequency" }],
    runtimeEffect: "AFM terminal function (AFM terminal not present in the core profile; schema only)."
  }),
  enu("04-01", "AFM range", {
    default: 0,
    min: 0,
    max: 0,
    options: [{ value: 0, label: "0-10V" }],
    runtimeEffect: "AFM output range (schema only)."
  }),

  // =========================================================================
  // Group 05 — Motor parameters
  // =========================================================================
  num("05-01", "Motor full-load current", ParameterDatatype.REAL, {
    unit: "A",
    default: 15.0,
    min: 0,
    max: 999.9,
    step: 0.1,
    runtimeEffect: "Motor rated (full-load) current; basis of the current model and the electronic thermal relay. Model-dependent reference value."
  }),
  num("05-02", "Motor no-load current", ParameterDatatype.REAL, {
    unit: "A",
    default: 1.5,
    min: 0,
    max: 999.9,
    step: 0.1,
    runtimeEffect: "Motor current at no load; base offset of the current model. Model-dependent reference value."
  }),
  num("05-03", "Torque compensation", ParameterDatatype.REAL, {
    unit: "%",
    default: 0,
    min: 0,
    max: 100,
    step: 1,
    runtimeEffect: "Low-frequency V/F voltage lift (torque compensation)."
  }),
  num("05-04", "Slip compensation", ParameterDatatype.REAL, {
    unit: "%",
    default: 0,
    min: 0,
    max: 100,
    step: 0.1,
    runtimeEffect: "Frequency feedforward correction for slip, % of commanded frequency."
  }),
  num("05-05", "Motor number of poles", ParameterDatatype.INT16, {
    default: 4,
    min: 2,
    max: 12,
    step: 2,
    runtimeEffect: "Motor pole count; synchronous speed = 120 x f / poles."
  }),
  num("05-06", "Motor rated voltage", ParameterDatatype.REAL, {
    unit: "V",
    runtimeEffect: "Motor rated voltage (schema only; the engine uses 01-01 for the V/F anchor)."
  }),
  num("05-07", "Motor rated output", ParameterDatatype.REAL, {
    unit: "kW",
    default: 7.5,
    min: 0,
    max: 999.9,
    step: 0.1,
    runtimeEffect: "Motor rated power (reference configuration; schema only)."
  }),

  // =========================================================================
  // Group 06 — Protection
  // =========================================================================
  num("06-00", "Input under-voltage (Lv) protection", ParameterDatatype.INT16, {
    unit: "%",
    default: 0,
    min: 0,
    max: 90,
    step: 1,
    runtimeEffect: "Lv trip threshold, % of nominal DC bus; 0 = disabled. Model-dependent via the voltage class."
  }),
  num("06-01", "Inverter over-voltage (OV) protection", ParameterDatatype.INT16, {
    unit: "%",
    default: 0,
    min: 0,
    max: 140,
    step: 1,
    runtimeEffect: "OV trip threshold, % of nominal DC bus; 0 = disabled. OV stall prevention active when enabled."
  }),
  enu("06-02", "Input phase loss protection", {
    default: 0,
    min: 0,
    max: 3,
    options: [
      { value: 0, label: "Disable" },
      { value: 1, label: "Warning and continue" },
      { value: 2, label: "Warning and ramp stop" },
      { value: 3, label: "Warning and coast stop" }
    ],
    runtimeEffect: "Phase-loss response (specification §18)."
  }),
  num("06-03", "Acceleration over-current level (ocA)", ParameterDatatype.INT16, {
    unit: "%",
    default: 180,
    min: 125,
    max: 500,
    step: 5,
    runtimeEffect: "Acceleration over-current trip level, % of drive rated current (fault ocA)."
  }),
  num("06-04", "Deceleration over-current level (ocd)", ParameterDatatype.INT16, {
    unit: "%",
    default: 180,
    min: 125,
    max: 500,
    step: 5,
    runtimeEffect: "Deceleration over-current trip level, % of drive rated current (fault ocd)."
  }),
  num("06-05", "Constant-speed over-current level (ocn)", ParameterDatatype.INT16, {
    unit: "%",
    default: 180,
    min: 125,
    max: 500,
    step: 5,
    runtimeEffect: "Constant-speed over-current trip level, % of drive rated current (fault ocn)."
  }),
  num("06-06", "Over-torque level (oL2)", ParameterDatatype.INT16, {
    unit: "%",
    default: 0,
    min: 0,
    max: 200,
    step: 5,
    runtimeEffect: "Over-torque detection level, % of rated torque; 0 = disabled (fault oL2)."
  }),
  num("06-07", "Over-torque detection time", ParameterDatatype.REAL, {
    unit: "s",
    default: 1.0,
    min: 0,
    max: 32,
    step: 0.1,
    runtimeEffect: "Required duration for over-torque detection (specification §19)."
  }),
  enu("06-08", "Over-torque response", {
    default: 0,
    min: 0,
    max: 1,
    options: [
      { value: 0, label: "Continue after detection" },
      { value: 1, label: "Stop after detection (ramp)" }
    ],
    runtimeEffect: "Over-torque response; disable via 06-06 = 0."
  }),
  num("06-13", "Electronic thermal relay 1 (motor rated current)", ParameterDatatype.INT16, {
    unit: "%",
    default: 100,
    min: 10,
    max: 100,
    step: 1,
    runtimeEffect: "I²t electronic thermal relay rated current, % of 05-01 (interpretation — see provenance)."
  }),
  num("06-14", "Electronic thermal relay 2 (ambient temperature)", ParameterDatatype.INT16, {
    unit: "°C",
    default: 40,
    min: 0,
    max: 60,
    step: 1,
    runtimeEffect: "Ambient temperature for the thermal model (interpretation — see provenance)."
  }),
  enu("06-15", "Thermal protection behavior", {
    default: 0,
    min: 0,
    max: 1,
    options: [
      { value: 0, label: "Auto reset after cool-down" },
      { value: 1, label: "Manual reset" }
    ],
    runtimeEffect: "OL2 reset behavior (auto cool-down vs manual reset)."
  }),
  num("06-17", "Fault record 1 (newest)", ParameterDatatype.INT16, {
    default: 0,
    min: -999,
    max: 999,
    step: 1,
    access: ParameterAccess.READ_ONLY,
    runtimeEffect: "Most recent fault (numeric code per faultRecordValues.ts)."
  }),
  num("06-18", "Fault record 2", ParameterDatatype.INT16, {
    default: 0,
    min: -999,
    max: 999,
    step: 1,
    access: ParameterAccess.READ_ONLY,
    runtimeEffect: "Fault history record 2."
  }),
  num("06-19", "Fault record 3", ParameterDatatype.INT16, {
    default: 0,
    min: -999,
    max: 999,
    step: 1,
    access: ParameterAccess.READ_ONLY,
    runtimeEffect: "Fault history record 3."
  }),
  num("06-20", "Fault record 4 (oldest)", ParameterDatatype.INT16, {
    default: 0,
    min: -999,
    max: 999,
    step: 1,
    access: ParameterAccess.READ_ONLY,
    runtimeEffect: "Fault history record 4."
  }),

  // =========================================================================
  // Group 07 — Control (multi-step speed; schema only in the core version)
  // =========================================================================
  enu("07-00", "Multi-step speed source", {
    default: 0,
    min: 0,
    max: 0,
    options: [{ value: 0, label: "External terminal (not wired in core)" }],
    runtimeEffect: "Multi-step speed source (later capability module)."
  }),
  num("07-01", "Multi-step speed 1", ParameterDatatype.REAL, { unit: "Hz", default: 0, min: 0, max: 400, step: 0.1 }),
  num("07-02", "Multi-step speed 2", ParameterDatatype.REAL, { unit: "Hz", default: 0, min: 0, max: 400, step: 0.1 }),
  num("07-03", "Multi-step speed 3", ParameterDatatype.REAL, { unit: "Hz", default: 0, min: 0, max: 400, step: 0.1 }),
  num("07-04", "Multi-step speed 4", ParameterDatatype.REAL, { unit: "Hz", default: 0, min: 0, max: 400, step: 0.1 }),
  num("07-05", "Multi-step speed 5", ParameterDatatype.REAL, { unit: "Hz", default: 0, min: 0, max: 400, step: 0.1 }),
  num("07-06", "Multi-step speed 6", ParameterDatatype.REAL, { unit: "Hz", default: 0, min: 0, max: 400, step: 0.1 }),
  num("07-07", "Multi-step speed 7", ParameterDatatype.REAL, { unit: "Hz", default: 0, min: 0, max: 400, step: 0.1 }),
  num("07-08", "Multi-step speed 8", ParameterDatatype.REAL, { unit: "Hz", default: 0, min: 0, max: 400, step: 0.1 }),
  num("07-09", "Multi-step speed 9", ParameterDatatype.REAL, { unit: "Hz", default: 0, min: 0, max: 400, step: 0.1 }),
  num("07-10", "Multi-step speed 10", ParameterDatatype.REAL, { unit: "Hz", default: 0, min: 0, max: 400, step: 0.1 }),

  // =========================================================================
  // Group 09 — Communication (RS-485 / Modbus)
  // =========================================================================
  num("09-00", "Communication address", ParameterDatatype.INT16, {
    default: 1,
    min: 1,
    max: 247,
    step: 1,
    runtimeEffect: "RS-485 (Modbus) station address."
  }),
  enu("09-01", "Transmission speed", {
    default: 0,
    min: 0,
    max: 4,
    options: [
      { value: 0, label: "9600 bps" },
      { value: 1, label: "19200 bps" },
      { value: 2, label: "38400 bps" },
      { value: 3, label: "57600 bps" },
      { value: 4, label: "115200 bps" }
    ],
    runtimeEffect: "RS-485 baud rate."
  }),
  enu("09-02", "Communication data format", {
    default: 0,
    min: 0,
    max: 0,
    options: [{ value: 0, label: "8 data bits, no parity (gap)" }],
    runtimeEffect: "RS-485 data format (details not established — schema only)."
  }),
  num("09-03", "Communication timeout", ParameterDatatype.REAL, {
    unit: "s",
    default: 0,
    min: 0,
    max: 60,
    step: 0.1,
    runtimeEffect: "Communication timeout/watchdog (details not established — schema only)."
  })
];

/** Number of parameters in the core schema (asserted by tests). */
export const VFD_V_CORE_PARAMETER_COUNT = VFD_V_CORE_PARAMETERS.length;

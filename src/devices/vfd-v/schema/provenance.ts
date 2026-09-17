/**
 * PROVENANCE — VFD-V EVC v1.0 core parameter schema
 * ===================================================
 *
 * IMPORTANT CONTEXT (read before using this schema):
 *
 * The authoritative EVC file (VFD-V_EVC_v1.0_core_parameters.evc) and
 * the Delta-VFD-V-User-Manual.pdf were NOT available as files in this
 * workspace. The schema in this package is a RECONSTRUCTION of the
 * Delta VFD-V parameter reference built from the VFD-V technical
 * information available in the project conversation, following the
 * project's source protocol:
 *
 *   - Official Delta parameter numbers and terminology are preserved
 *     and never renamed.
 *   - No parameter value was invented: where a value could not be
 *     established, it is `null` (see ParameterDefinition) and the
 *     address is listed below with status "gap".
 *   - Values used for the 10HP (7.5kW) reference configuration are
 *     marked "reference" — they are model-dependent and MUST be set
 *     per actual drive/motor before production use.
 *   - "standard" = consistent with the published VFD-V parameter
 *     reference as available in the conversation; still to be diffed
 *     against the official EVC file when it becomes available.
 *
 * SOURCE GAPS (addresses with null values or unverified details):
 *   - 01-02..01-08: V/F curve point values and torque boost — null.
 *     The V/F controller falls back to the standard 2-point linear
 *     curve (0Hz/0V -> 01-00/01-01) when no point is set.
 *   - 00-02: parameter-reset semantics (option labels are
 *     best-effort; the simulator exposes reset directly).
 *   - 02-00: option numbering is best-effort; the engine supports
 *     modes 0 (2-wire FWD/REV) and 2 (2-wire FWD/STOP + REV/STOP).
 *     Mode 1 (3-wire) requires a STOP terminal that is not present in
 *     the core terminal profile and is rejected at engine
 *     construction.
 *   - 02-01..02-09: MIx/MOx function option lists beyond the core
 *     subset (see 02-07..02-13 for the relay/MO option set taken from
 *     the specification).
 *   - 03-00 / 03-06 / 04-00 / 04-01: option lists beyond the core
 *     subset; 03-06 mode 1 (4-20mA) is not implemented by the engine.
 *   - 05-01 / 05-02 / 05-06 / 05-07: motor data — reference values.
 *   - 06-00 / 06-01 / 06-06 / 06-07 / 06-13 / 06-14 / 06-15:
 *     protection setpoints / defaults — reference or gap.
 *   - 06-17..06-20: fault-record numeric encoding (the drive stores
 *     fault codes as numbers; the code->number map in
 *     `faultRecordValues.ts` is a documented simulator convention).
 *   - 07-00..07-10: multi-step speed function — schema only; not
 *     wired into the core engine (multi-step is a later module).
 *   - 09-02 / 09-03: communication format/timeout details.
 *   - 02-12 / 02-13: RB/RC relay function parameter addresses follow
 *     the 02-11 (RA) pattern; the specification names only 02-11.
 *
 * NOTE on 01-07: the core specification lists 01-07 among the
 * frequency-limiting parameters, while the VFD-V reference treats
 * 01-07 as the 3rd V/F point voltage. The frequency pipeline uses
 * 01-00 / 01-09 / 01-10 / 01-11 for limiting; this discrepancy is
 * recorded here instead of being silently resolved.
 */

export const ProvenanceStatus = {
  /** Consistent with the VFD-V parameter reference in the conversation. */
  STANDARD: "standard",
  /** Model-dependent value assumed for the 10HP/7.5kW reference configuration. */
  REFERENCE: "reference",
  /** Not established by available source material (null value / gap note). */
  GAP: "gap"
} as const;

export type ProvenanceStatus = (typeof ProvenanceStatus)[keyof typeof ProvenanceStatus];

export interface ParameterProvenance {
  readonly status: ProvenanceStatus;
  readonly note: string;
}

export const VFD_V_PROVENANCE: Readonly<Record<string, ParameterProvenance>> = {
  // --- 00 system ---------------------------------------------------------
  "00-00": { status: ProvenanceStatus.GAP, note: "Other drive-selection options not established." },
  "00-01": {
    status: ProvenanceStatus.STANDARD,
    note: "V/F (0) is the core engine mode; vector control is not simulated in the core version."
  },
  "00-02": {
    status: ProvenanceStatus.GAP,
    note: "Parameter-reset semantics are best-effort; the simulator exposes registry.reset() directly."
  },
  "00-03": { status: ProvenanceStatus.STANDARD, note: "Operation password 000-999; not enforced by the core simulator." },
  "00-20": { status: ProvenanceStatus.STANDARD, note: "Core sources: RS-485, external terminal (AVI), digital keypad." },
  "00-21": { status: ProvenanceStatus.STANDARD, note: "Core sources: RS-485, external terminals (FWD/REV), digital keypad." },
  "00-22": { status: ProvenanceStatus.STANDARD, note: "0 = ramp to stop, 1 = coast to stop (per specification)." },
  "00-23": { status: ProvenanceStatus.STANDARD, note: "0 = reverse disabled, 1 = enabled (per specification)." },

  // --- 01 basic ------------------------------------------------------------
  "01-00": { status: ProvenanceStatus.STANDARD, note: "Maximum operation frequency, default 60Hz." },
  "01-01": {
    status: ProvenanceStatus.REFERENCE,
    note: "Maximum operation voltage — model-dependent (voltage class). 480V assumes 3-phase 400V class, 7.5kW reference."
  },
  "01-02": { status: ProvenanceStatus.GAP, note: "1st V/F point frequency — value not established." },
  "01-03": { status: ProvenanceStatus.GAP, note: "1st V/F point voltage — value not established." },
  "01-04": { status: ProvenanceStatus.GAP, note: "2nd V/F point frequency — value not established." },
  "01-05": { status: ProvenanceStatus.GAP, note: "2nd V/F point voltage — value not established." },
  "01-06": { status: ProvenanceStatus.GAP, note: "3rd V/F point frequency — value not established." },
  "01-07": { status: ProvenanceStatus.GAP, note: "3rd V/F point voltage — value not established. See file header note on 01-07." },
  "01-08": {
    status: ProvenanceStatus.GAP,
    note: "Torque boost — semantics (boost % vs startup frequency) not established; core engine does not apply it."
  },
  "01-09": { status: ProvenanceStatus.STANDARD, note: "Minimum output frequency (low-speed deadband)." },
  "01-10": { status: ProvenanceStatus.STANDARD, note: "Upper bound frequency." },
  "01-11": { status: ProvenanceStatus.STANDARD, note: "Lower bound frequency (applies while running; stop always targets 0)." },
  "01-12": { status: ProvenanceStatus.STANDARD, note: "1st acceleration time; rate = 01-00 / time (Hz/s), per spec example." },
  "01-13": { status: ProvenanceStatus.STANDARD, note: "1st deceleration time." },
  "01-14": { status: ProvenanceStatus.STANDARD, note: "2nd acceleration time (schema only in core; multi-step module will use it)." },
  "01-15": { status: ProvenanceStatus.STANDARD, note: "2nd deceleration time (schema only in core)." },
  "01-16": { status: ProvenanceStatus.STANDARD, note: "3rd acceleration time (schema only in core)." },
  "01-17": { status: ProvenanceStatus.STANDARD, note: "3rd deceleration time (schema only in core)." },
  "01-18": { status: ProvenanceStatus.STANDARD, note: "4th acceleration time (schema only in core)." },
  "01-19": { status: ProvenanceStatus.STANDARD, note: "4th deceleration time (schema only in core)." },

  // --- 02 multifunction terminals -------------------------------------------
  "02-00": {
    status: ProvenanceStatus.GAP,
    note: "Option numbering best-effort. Engine supports 0 (FWD/REV) and 2 (FWD/STOP + REV/STOP); mode 1 (3-wire) rejected at construction (no STOP terminal in core profile)."
  },
  "02-01": { status: ProvenanceStatus.GAP, note: "MI1 function — option list not established (core profile has no MI1 terminal)." },
  "02-02": { status: ProvenanceStatus.GAP, note: "MI2 function — option list not established." },
  "02-03": { status: ProvenanceStatus.GAP, note: "MI3 function — option list not established." },
  "02-04": { status: ProvenanceStatus.GAP, note: "MI4 function — option list not established." },
  "02-05": { status: ProvenanceStatus.GAP, note: "MI5 function — option list not established." },
  "02-06": { status: ProvenanceStatus.GAP, note: "MI6 function — option list not established." },
  "02-07": { status: ProvenanceStatus.STANDARD, note: "MO1 function — core option subset per specification §23." },
  "02-08": { status: ProvenanceStatus.STANDARD, note: "MO2 function — core option subset per specification §23." },
  "02-09": { status: ProvenanceStatus.STANDARD, note: "MO3 function — core option subset per specification §23." },
  "02-11": { status: ProvenanceStatus.STANDARD, note: "RA relay function — option subset per specification §23." },
  "02-12": { status: ProvenanceStatus.GAP, note: "RB relay function — address follows the 02-11 pattern; specification names only 02-11." },
  "02-13": { status: ProvenanceStatus.GAP, note: "RC relay function — address follows the 02-11 pattern; specification names only 02-11." },

  // --- 03 analog input ---------------------------------------------------------
  "03-00": {
    status: ProvenanceStatus.GAP,
    note: "AVI function — only 'frequency command' (0) is established and implemented; other functions not wired."
  },
  "03-03": { status: ProvenanceStatus.STANDARD, note: "AVI bias, % of range at 0V." },
  "03-06": {
    status: ProvenanceStatus.GAP,
    note: "AVI bias mode — mode 0 (0-10V) implemented; mode 1 (4-20mA) semantics not established, engine rejects it."
  },
  "03-09": { status: ProvenanceStatus.STANDARD, note: "AVI gain, % (100 = full range)." },

  // --- 04 analog output ----------------------------------------------------------
  "04-00": { status: ProvenanceStatus.GAP, note: "AFM function — option list not established (AFM terminal not in core profile)." },
  "04-01": { status: ProvenanceStatus.GAP, note: "AFM range — not established." },

  // --- 05 motor --------------------------------------------------------------------
  "05-01": {
    status: ProvenanceStatus.REFERENCE,
    note: "Motor full-load current — model-dependent. 15.0A for 7.5kW/400V reference motor."
  },
  "05-02": {
    status: ProvenanceStatus.REFERENCE,
    note: "Motor no-load current — model-dependent. 1.5A (~10% of reference FL); set per motor."
  },
  "05-03": { status: ProvenanceStatus.STANDARD, note: "Torque compensation — applied as low-frequency V/F voltage lift." },
  "05-04": { status: ProvenanceStatus.STANDARD, note: "Slip compensation — frequency feedforward correction (% of frequency)." },
  "05-05": { status: ProvenanceStatus.STANDARD, note: "Motor number of poles (2-12, step 2)." },
  "05-06": { status: ProvenanceStatus.GAP, note: "Motor rated voltage — value not established; schema only (engine uses 01-01)." },
  "05-07": { status: ProvenanceStatus.REFERENCE, note: "Motor rated output — 7.5kW reference configuration; schema only." },

  // --- 06 protection -----------------------------------------------------------------
  "06-00": {
    status: ProvenanceStatus.GAP,
    note: "Input under-voltage (Lv) — % of nominal DC bus; 0 = disabled. Nominal DC bus derived from the reference line voltage (model-dependent)."
  },
  "06-01": {
    status: ProvenanceStatus.GAP,
    note: "Inverter over-voltage (OV) — % of nominal DC bus; 0 = disabled. OV stall prevention active when enabled."
  },
  "06-02": {
    status: ProvenanceStatus.GAP,
    note: "Input phase loss — responses per specification §18; option numbering best-effort (0 = disable)."
  },
  "06-03": { status: ProvenanceStatus.STANDARD, note: "Acceleration over-current (ocA) level, % of drive rated current." },
  "06-04": { status: ProvenanceStatus.STANDARD, note: "Deceleration over-current (ocd) level, % of drive rated current." },
  "06-05": { status: ProvenanceStatus.STANDARD, note: "Constant-speed over-current (ocn) level, % of drive rated current." },
  "06-06": {
    status: ProvenanceStatus.GAP,
    note: "Over-torque (oL2) level, % of rated torque; 0 = disabled. Default 0 assumed."
  },
  "06-07": { status: ProvenanceStatus.GAP, note: "Over-torque detection time — required duration per specification §19; default 1.0s assumed." },
  "06-08": {
    status: ProvenanceStatus.GAP,
    note: "Over-torque response — numbering best-effort (0 = continue, 1 = stop); disable via 06-06 = 0."
  },
  "06-13": {
    status: ProvenanceStatus.GAP,
    note: "Electronic thermal relay setting 1 — interpreted as motor rated current for the I²t relay, % of 05-01 (default 100)."
  },
  "06-14": { status: ProvenanceStatus.GAP, note: "Electronic thermal relay setting 2 — interpreted as ambient temperature °C (default 40)." },
  "06-15": {
    status: ProvenanceStatus.GAP,
    note: "Thermal protection behavior — 0 = auto reset after cool-down (heat < 20%), 1 = manual reset."
  },
  "06-17": { status: ProvenanceStatus.GAP, note: "Fault record 1 (newest) — numeric encoding per faultRecordValues.ts." },
  "06-18": { status: ProvenanceStatus.GAP, note: "Fault record 2." },
  "06-19": { status: ProvenanceStatus.GAP, note: "Fault record 3." },
  "06-20": { status: ProvenanceStatus.GAP, note: "Fault record 4 (oldest)." },

  // --- 07 control (multi-step speed) ----------------------------------------------------
  "07-00": { status: ProvenanceStatus.GAP, note: "Multi-step speed source — schema only; multi-step is a later capability module." },
  "07-01": { status: ProvenanceStatus.GAP, note: "Multi-step speed 1 — schema only." },
  "07-02": { status: ProvenanceStatus.GAP, note: "Multi-step speed 2 — schema only." },
  "07-03": { status: ProvenanceStatus.GAP, note: "Multi-step speed 3 — schema only." },
  "07-04": { status: ProvenanceStatus.GAP, note: "Multi-step speed 4 — schema only." },
  "07-05": { status: ProvenanceStatus.GAP, note: "Multi-step speed 5 — schema only." },
  "07-06": { status: ProvenanceStatus.GAP, note: "Multi-step speed 6 — schema only." },
  "07-07": { status: ProvenanceStatus.GAP, note: "Multi-step speed 7 — schema only." },
  "07-08": { status: ProvenanceStatus.GAP, note: "Multi-step speed 8 — schema only." },
  "07-09": { status: ProvenanceStatus.GAP, note: "Multi-step speed 9 — schema only." },
  "07-10": { status: ProvenanceStatus.GAP, note: "Multi-step speed 10 — schema only." },

  // --- 09 communication ------------------------------------------------------------------
  "09-00": { status: ProvenanceStatus.STANDARD, note: "RS-485 communication address, 1-247, default 1." },
  "09-01": { status: ProvenanceStatus.STANDARD, note: "RS-485 transmission speed (baud) enum." },
  "09-02": { status: ProvenanceStatus.GAP, note: "Communication data format — details not established." },
  "09-03": { status: ProvenanceStatus.GAP, note: "Communication timeout/watchdog — details not established." }
};

/** All addresses with status "gap" (source gaps, for reporting). */
export function getVfdVSourceGaps(): string[] {
  return Object.entries(VFD_V_PROVENANCE)
    .filter(([, p]) => p.status === ProvenanceStatus.GAP)
    .map(([id]) => id)
    .sort();
}

/** All addresses with status "reference" (model-dependent defaults). */
export function getVfdVReferenceValues(): string[] {
  return Object.entries(VFD_V_PROVENANCE)
    .filter(([, p]) => p.status === ProvenanceStatus.REFERENCE)
    .map(([id]) => id)
    .sort();
}

/** Provenance for one address (falls back to an explicit "gap" record). */
export function getProvenance(id: string): ParameterProvenance {
  return VFD_V_PROVENANCE[id] ?? {
    status: ProvenanceStatus.GAP,
    note: `No provenance record for "${id}".`
  };
}

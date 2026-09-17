import { describe, expect, it } from "vitest";
import { VFD_V_CORE_TERMINALS, getVfdVTerminal } from "../../src/devices/vfd-v/terminals.js";

/**
 * The core hardware profile must expose exactly these 18 terminals and
 * nothing else (per the core specification — no MI1-MI6, ACI, AUI, AFM,
 * MO1-MO3, MCM, DFM, MRA/MRC).
 */
const EXPECTED_TERMINALS = [
  "R/L1",
  "S/L2",
  "T/L3",
  "E",
  "U/T1",
  "V/T2",
  "W/T3",
  "+24V",
  "DCM",
  "FWD",
  "REV",
  "+10V",
  "AVI",
  "ACM",
  "RA",
  "RB",
  "RC",
  "RS-485"
];

const EXCLUDED_TERMINALS = [
  "MI1",
  "MI2",
  "MI3",
  "MI4",
  "MI5",
  "MI6",
  "ACI",
  "AUI",
  "AFM",
  "MO1",
  "MO2",
  "MO3",
  "MCM",
  "DFM",
  "MRA",
  "MRC"
];

describe("VFD-V core terminal profile", () => {
  it("exposes exactly the 18 specified terminals", () => {
    const ids = VFD_V_CORE_TERMINALS.map((t) => t.id);
    expect(ids).toHaveLength(18);
    expect([...ids].sort()).toEqual([...EXPECTED_TERMINALS].sort());
  });

  it("contains no excluded terminals from future capability modules", () => {
    const ids = new Set(VFD_V_CORE_TERMINALS.map((t) => t.id));
    for (const excluded of EXCLUDED_TERMINALS) {
      expect(ids.has(excluded), `terminal ${excluded} must not exist in the core profile`).toBe(
        false
      );
    }
  });

  it("FWD maps to the forward command input", () => {
    const fwd = getVfdVTerminal("FWD");
    expect(fwd.type).toBe("digital_input");
    expect(fwd.direction).toBe("input");
    expect(fwd.runtimeMapping).toBe("forwardCommand");
  });

  it("AVI maps to the analog input voltage", () => {
    const avi = getVfdVTerminal("AVI");
    expect(avi.type).toBe("analog_input");
    expect(avi.runtimeMapping).toBe("aviVoltage");
  });

  it("relay terminals map to relay output state fields", () => {
    expect(getVfdVTerminal("RA").runtimeMapping).toBe("relayRA");
    expect(getVfdVTerminal("RB").runtimeMapping).toBe("relayRB");
    expect(getVfdVTerminal("RC").runtimeMapping).toBe("relayRC");
  });

  it("motor output terminals reflect the inverter output stage", () => {
    for (const id of ["U/T1", "V/T2", "W/T3"]) {
      expect(getVfdVTerminal(id).runtimeMapping).toBe("outputEnabled");
    }
  });

  it("throws for terminals outside the core profile", () => {
    expect(() => getVfdVTerminal("MI1")).toThrow(/Unknown VFD-V core terminal/);
  });

  it("every terminal has a unique id and a non-empty runtime mapping", () => {
    const ids = VFD_V_CORE_TERMINALS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of VFD_V_CORE_TERMINALS) {
      expect(t.runtimeMapping.length).toBeGreaterThan(0);
      expect(t.electricalRole.length).toBeGreaterThan(0);
    }
  });
});

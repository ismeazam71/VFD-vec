import { describe, expect, it } from "vitest";
import { FaultHistory, type FaultRecord } from "../../src/simulation/faults/FaultHistory.js";
import { FaultManager } from "../../src/simulation/faults/FaultManager.js";
import { FaultCodes } from "../../src/devices/vfd-v/faultCodes.js";

function record(code: string, t: number): FaultRecord {
  return { code, description: `desc-${code}`, simulationTime: t };
}

describe("FaultHistory", () => {
  it("stores the newest fault in slot 0 (06-17) and shifts older ones down", () => {
    const h = new FaultHistory();
    h.push(record("ocA", 1));
    h.push(record("OV", 2));
    const slots = h.readonlySlots();
    expect(slots[0]?.code).toBe("OV"); // 06-17 = newest
    expect(slots[1]?.code).toBe("ocA"); // 06-18
    expect(slots[2]).toBeNull();
    expect(slots[3]).toBeNull();
  });

  it("keeps exactly the four most recent faults", () => {
    const h = new FaultHistory();
    h.push(record("ocA", 1));
    h.push(record("OV", 2));
    h.push(record("Lv", 3));
    h.push(record("oL2", 4));
    h.push(record("ocn", 5));
    h.push(record("OL2", 6));
    const slots = h.readonlySlots();
    expect(slots[0]?.code).toBe("OL2");
    expect(slots[1]?.code).toBe("ocn");
    expect(slots[2]?.code).toBe("oL2");
    expect(slots[3]?.code).toBe("Lv");
    // The two oldest (ocA, OV) must have been dropped.
    expect(h.codes()).toEqual(["OL2", "ocn", "oL2", "Lv"]);
  });

  it("slot addresses map newest-first to 06-17..06-20", () => {
    expect(FaultHistory.SLOT_ADDRESSES).toEqual(["06-17", "06-18", "06-19", "06-20"]);
    expect(FaultHistory.SLOT_ADDRESSES.length).toBe(FaultHistory.SLOT_COUNT);
  });

  it("clear() empties all slots", () => {
    const h = new FaultHistory();
    h.push(record("ocA", 1));
    h.clear();
    expect(h.size).toBe(0);
    expect(h.codes()).toEqual([]);
  });
});

describe("FaultManager", () => {
  it("raises a fault and exposes it as active", () => {
    const fm = new FaultManager();
    const active = fm.raiseFault(FaultCodes.ACCEL_OVER_CURRENT.code, 12.5);
    expect(fm.hasHardFault()).toBe(true);
    expect(fm.getActiveFault()?.code).toBe("ocA");
    expect(active.simulationTime).toBe(12.5);
    expect(fm.getFaultHistory()[0]?.code).toBe("ocA");
  });

  it("does not overwrite the latched fault with a second one", () => {
    const fm = new FaultManager();
    fm.raiseFault("ocA", 1);
    fm.raiseFault("OV", 2);
    expect(fm.getActiveFault()?.code).toBe("ocA");
    // History must not have the second (blocked) fault either.
    expect(fm.getFaultCodes()).toEqual(["ocA"]);
  });

  it("clearFault() clears active but preserves history", () => {
    const fm = new FaultManager();
    fm.raiseFault("ocA", 1);
    expect(fm.clearFault()).toBe(true);
    expect(fm.hasHardFault()).toBe(false);
    expect(fm.getActiveFault()).toBeNull();
    expect(fm.getFaultCodes()).toEqual(["ocA"]);
    // A later fault rotates the old one down without losing it.
    fm.raiseFault("OV", 2);
    expect(fm.getFaultCodes()).toEqual(["OV", "ocA"]);
  });

  it("clearFault() is a no-op when no fault is latched", () => {
    const fm = new FaultManager();
    expect(fm.clearFault()).toBe(false);
  });

  it("acknowledgeFault() marks the active fault as acknowledged", () => {
    const fm = new FaultManager();
    expect(fm.acknowledged).toBe(false);
    fm.raiseFault("Lv", 3);
    expect(fm.acknowledged).toBe(false);
    fm.acknowledgeFault();
    expect(fm.acknowledged).toBe(true);
  });

  it("rejects unknown fault codes", () => {
    const fm = new FaultManager();
    expect(() => fm.raiseFault("XX9", 1)).toThrow(/Unknown VFD-V fault code/);
  });

  it("maps fault history codes newest-first for the 06-17..06-20 monitor values", () => {
    const fm = new FaultManager();
    fm.raiseFault("ocA", 1);
    fm.clearFault();
    fm.raiseFault("OV", 2);
    fm.clearFault();
    fm.raiseFault("Lv", 3);
    const codes = fm.getFaultCodes();
    expect(codes).toEqual(["Lv", "OV", "ocA"]);
  });
});

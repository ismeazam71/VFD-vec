import { describe, expect, it } from "vitest";
import { ParameterAccess, ParameterDatatype } from "../../src/parameters/types.js";
import type { ParameterDefinition } from "../../src/parameters/types.js";
import { ParameterRegistry } from "../../src/parameters/ParameterRegistry.js";

/**
 * Minimal test schema (NOT the real EVC schema — just enough structure
 * to exercise the registry's validation rules).
 */
function testSchema(): ParameterDefinition[] {
  return [
    {
      id: "01-00",
      name: "Test max frequency",
      datatype: ParameterDatatype.REAL,
      unit: "Hz",
      default: 60,
      min: 1,
      max: 400,
      step: 0.1,
      enum: undefined,
      runtimeEffect: undefined,
      access: ParameterAccess.READ_WRITE
    },
    {
      id: "00-22",
      name: "Test stop method",
      datatype: ParameterDatatype.ENUM,
      unit: undefined,
      default: 0,
      min: 0,
      max: 1,
      step: 1,
      enum: [
        { value: 0, label: "Ramp" },
        { value: 1, label: "Coast" }
      ],
      runtimeEffect: undefined,
      access: ParameterAccess.READ_WRITE
    },
    {
      id: "06-17",
      name: "Test fault history 1",
      datatype: ParameterDatatype.INT16,
      unit: undefined,
      default: 0,
      min: -100,
      max: 100,
      step: 1,
      enum: undefined,
      runtimeEffect: undefined,
      access: ParameterAccess.READ_ONLY
    },
    {
      id: "05-05",
      name: "Test poles",
      datatype: ParameterDatatype.INT16,
      unit: undefined,
      default: 4,
      min: 2,
      max: 12,
      step: 2,
      enum: undefined,
      runtimeEffect: undefined,
      access: ParameterAccess.READ_WRITE
    },
    {
      id: "00-99",
      name: "Test enum with gap",
      datatype: ParameterDatatype.ENUM,
      unit: undefined,
      default: 0,
      min: 0,
      max: 2,
      step: 1,
      enum: [
        { value: 0, label: "Off" },
        { value: 2, label: "On" }
      ],
      runtimeEffect: undefined,
      access: ParameterAccess.READ_WRITE
    }
  ];
}

describe("ParameterRegistry", () => {
  it("loads a schema and initializes values to factory defaults", () => {
    const reg = new ParameterRegistry();
    const result = reg.load(testSchema());
    expect(result.ok).toBe(true);
    expect(reg.get("01-00")).toBe(60);
    expect(reg.get("00-22")).toBe(0);
    expect(reg.get("06-17")).toBe(0);
  });

  it("rejects duplicate parameter ids", () => {
    const defs = testSchema();
    defs.push(defs[0]!);
    const reg = new ParameterRegistry();
    const result = reg.load(defs);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/duplicate/i);
    // Schema must be unchanged after a failed load.
    expect(() => reg.get("01-00")).toThrow(/not in the loaded schema/);
  });

  it("rejects a schema whose default is out of range", () => {
    const defs = testSchema().map((d) => (d.id === "01-00" ? { ...d, default: 401 } : d));
    const reg = new ParameterRegistry();
    const result = reg.load(defs);
    expect(result.ok).toBe(false);
  });

  it("rejects unknown parameter ids on read and write", () => {
    const reg = new ParameterRegistry();
    reg.load(testSchema());
    expect(() => reg.get("99-99")).toThrow(/not in the loaded schema/);
    const result = reg.set("99-99", 1);
    expect(result.ok).toBe(false);
  });

  it("accepts values inside range and aligned to step", () => {
    const reg = new ParameterRegistry();
    reg.load(testSchema());
    expect(reg.set("01-00", 50.5).ok).toBe(true);
    expect(reg.get("01-00")).toBe(50.5);
  });

  it("rejects values outside min/max", () => {
    const reg = new ParameterRegistry();
    reg.load(testSchema());
    const tooHigh = reg.set("01-00", 400.5);
    expect(tooHigh.ok).toBe(false);
    expect(tooHigh.ok === false ? tooHigh.reason : "").toMatch(/out of range/);
    const tooLow = reg.set("01-00", 0.9);
    expect(tooLow.ok).toBe(false);
    // Previous value must survive a rejected write.
    expect(reg.get("01-00")).toBe(60);
  });

  it("rejects non-step-aligned values", () => {
    const reg = new ParameterRegistry();
    reg.load(testSchema());
    const result = reg.set("01-00", 60.25);
    expect(result.ok).toBe(false);
    expect(result.ok === false ? result.reason : "").toMatch(/step/);
  });

  it("rejects fractional values for integer datatypes", () => {
    const reg = new ParameterRegistry();
    reg.load(testSchema());
    const result = reg.set("05-05", 3);
    expect(result.ok).toBe(false); // step is 2, 3 not aligned
    const frac = reg.set("05-05", 4.5);
    expect(frac.ok).toBe(false);
    expect(frac.ok === false ? frac.reason : "").toMatch(/integer/);
    expect(reg.set("05-05", 6).ok).toBe(true);
  });

  it("rejects values not in the enum set", () => {
    const reg = new ParameterRegistry();
    reg.load(testSchema());
    // "00-99" has enum {0, 2} with step 1 over [0, 2] — so 1 is in range
    // and step-aligned but NOT an allowed enum value.
    const result = reg.set("00-99", 1);
    expect(result.ok).toBe(false);
    expect(result.ok === false ? result.reason : "").toMatch(/enum/);
    expect(reg.set("00-22", 1).ok).toBe(true);
    expect(reg.get("00-22")).toBe(1);
  });

  it("rejects writes to read-only parameters", () => {
    const reg = new ParameterRegistry();
    reg.load(testSchema());
    const result = reg.set("06-17", 5);
    expect(result.ok).toBe(false);
    expect(result.ok === false ? result.reason : "").toMatch(/read-only/);
    expect(reg.get("06-17")).toBe(0);
  });

  it("resets one parameter and then all parameters to defaults", () => {
    const reg = new ParameterRegistry();
    reg.load(testSchema());
    reg.set("01-00", 45);
    reg.reset("01-00");
    expect(reg.get("01-00")).toBe(60);

    reg.set("01-00", 45);
    reg.set("00-22", 1);
    reg.reset();
    expect(reg.get("01-00")).toBe(60);
    expect(reg.get("00-22")).toBe(0);
  });
});

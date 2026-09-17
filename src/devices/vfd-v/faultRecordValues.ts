import { FaultCodes, type FaultCodeKey } from "./faultCodes.js";

/**
 * Numeric encoding of fault codes for the READ_ONLY fault-record
 * monitor parameters 06-17..06-20.
 *
 * SOURCE GAP: the exact numeric encoding the physical VFD-V stores in
 * its fault records is not established by the available source
 * material. This table is a documented SIMULATOR CONVENTION: a stable
 * positive integer per fault code (0 = no fault recorded). The mapping
 * is deterministic and versioned here so UI/PLC tooling can translate
 * monitor values back to codes.
 */
const FAULT_CODE_VALUES: Readonly<Record<FaultCodeKey, number>> = {
  ACCEL_OVER_CURRENT: 1, // ocA
  DECEL_OVER_CURRENT: 2, // ocd
  CONST_SPEED_OVER_CURRENT: 3, // ocn
  OVER_VOLTAGE: 10, // OV
  UNDER_VOLTAGE: 11, // Lv
  OVER_TORQUE: 20, // oL2
  MOTOR_OVERLOAD: 21, // OL2
  EXTERNAL_FAULT: 30 // PF
};

export const NO_FAULT_RECORDED = 0;

/** Encodes a fault code string to its 06-17..06-20 numeric value. */
export function encodeFaultRecord(code: string | null): number {
  if (code === null) return NO_FAULT_RECORDED;
  for (const [key, value] of Object.entries(FAULT_CODE_VALUES) as Array<
    [FaultCodeKey, number]
  >) {
    if (FaultCodes[key].code === code) return value;
  }
  throw new Error(`encodeFaultRecord: unknown fault code "${code}"`);
}

/** Decodes a 06-17..06-20 numeric value back to a fault code (or null). */
export function decodeFaultRecord(value: number): string | null {
  if (value === NO_FAULT_RECORDED) return null;
  for (const [key, encoded] of Object.entries(FAULT_CODE_VALUES) as Array<
    [FaultCodeKey, number]
  >) {
    if (encoded === value) return FaultCodes[key].code;
  }
  return null;
}

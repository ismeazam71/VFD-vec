/**
 * VFD-V fault code table (core set).
 *
 * Terminology follows the Delta VFD-V manual as referenced by the core
 * specification:
 *   ocA  — over-current during acceleration   (06-03)
 *   ocd  — over-current during deceleration   (06-04)
 *   ocn  — over-current at constant speed     (06-05)
 *   OC   — over-current family label
 *   OV   — DC bus / input over-voltage        (06-01)
 *   Lv   — AC input under-voltage             (06-00)
 *   oL2  — over-torque                        (06-06..06-08)
 *   OL2  — motor overload, electronic thermal relay (06-13..06-15)
 *   PF   — external / user-triggered fault
 *
 * VERIFY ON MANUAL UPLOAD: the uploaded Delta-VFD-V-User-Manual.pdf may
 * refine these codes (e.g. distinguishing OV1/OV2/OV3). Until then the
 * core uses the codes named in the specification.
 */

export const FaultSeverity = {
  /** Latches the drive into the FAULT state and disables the output. */
  HARD: "HARD",
  /** Logged and reported but does not stop the drive on its own. */
  SOFT: "SOFT"
} as const;

export type FaultSeverity = (typeof FaultSeverity)[keyof typeof FaultSeverity];

export interface FaultCodeDefinition {
  /** Fault code string as reported by the drive (e.g. "ocA"). */
  readonly code: string;
  readonly description: string;
  readonly severity: FaultSeverity;
  /** Parameter that governs this fault (documentation aid). */
  readonly governedBy: string | undefined;
}

export const FaultCodes = {
  ACCEL_OVER_CURRENT: {
    code: "ocA",
    description: "Over-current during acceleration",
    severity: FaultSeverity.HARD,
    governedBy: "06-03"
  },
  DECEL_OVER_CURRENT: {
    code: "ocd",
    description: "Over-current during deceleration",
    severity: FaultSeverity.HARD,
    governedBy: "06-04"
  },
  CONST_SPEED_OVER_CURRENT: {
    code: "ocn",
    description: "Over-current at constant speed",
    severity: FaultSeverity.HARD,
    governedBy: "06-05"
  },
  OVER_VOLTAGE: {
    code: "OV",
    description: "Over-voltage (DC bus)",
    severity: FaultSeverity.HARD,
    governedBy: "06-01"
  },
  UNDER_VOLTAGE: {
    code: "Lv",
    description: "Low voltage (AC input)",
    severity: FaultSeverity.HARD,
    governedBy: "06-00"
  },
  OVER_TORQUE: {
    code: "oL2",
    description: "Over-torque",
    severity: FaultSeverity.HARD,
    governedBy: "06-06"
  },
  MOTOR_OVERLOAD: {
    code: "OL2",
    description: "Motor overload (electronic thermal relay)",
    severity: FaultSeverity.HARD,
    governedBy: "06-13"
  },
  EXTERNAL_FAULT: {
    code: "PF",
    description: "External fault (user / communication triggered)",
    severity: FaultSeverity.HARD,
    governedBy: undefined
  }
} as const;

export type FaultCodeKey = keyof typeof FaultCodes;

/**
 * Looks up a fault code definition.
 *
 * @throws Error for unknown codes so a typo in a protection module fails
 *         loudly instead of recording a garbage code in the history.
 */
export function getFaultCode(code: string): FaultCodeDefinition {
  for (const def of Object.values(FaultCodes)) {
    if (def.code === code) return def;
  }
  throw new Error(`Unknown VFD-V fault code "${code}"`);
}

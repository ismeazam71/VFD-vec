/**
 * VFD-V drive states (core set).
 *
 * DC_BRAKING is part of the state space required by the specification;
 * its activation (DC braking feature parameters) is not part of the core
 * EVC parameter set, so the core engine never emits the DC_BRAKE event
 * itself — the state exists for future drive capability modules.
 */
export const VfdVState = {
  POWER_OFF: "POWER_OFF",
  READY: "READY",
  ACCELERATING: "ACCELERATING",
  RUNNING: "RUNNING",
  DECELERATING: "DECELERATING",
  COASTING: "COASTING",
  DC_BRAKING: "DC_BRAKING",
  FAULT: "FAULT"
} as const;

export type VfdVState = (typeof VfdVState)[keyof typeof VfdVState];

export const ALL_VFD_V_STATES: readonly VfdVState[] = Object.values(VfdVState);

/**
 * Events that may move the state machine.
 *
 * The simulation engine decides WHICH event to emit (guards based on
 * physics); the state machine decides WHERE the event leads. Any
 * (state, event) pair not present in the transition table is a
 * programming error and throws.
 */
export const VfdVEvent = {
  /** Mains power applied: POWER_OFF -> READY. */
  POWER_ON: "POWER_ON",
  /** Mains power removed: any state -> POWER_OFF. */
  POWER_OFF: "POWER_OFF",
  /** Run command accepted: READY/COASTING -> ACCELERATING. */
  RUN: "RUN",
  /** Output frequency reached the target: ACCELERATING -> RUNNING. */
  TARGET_REACHED: "TARGET_REACHED",
  /** New target is above the output frequency: RUNNING -> ACCELERATING. */
  TARGET_RISE: "TARGET_RISE",
  /** New target is below the output frequency, or stop: -> DECELERATING. */
  TARGET_FALL: "TARGET_FALL",
  /** Ramp to 0 Hz complete: DECELERATING -> READY. */
  RAMP_DONE: "RAMP_DONE",
  /** Coast stop engaged: inverter output disabled. */
  COAST: "COAST",
  /** Motor at standstill after coasting: COASTING -> READY. */
  SPEED_ZERO: "SPEED_ZERO",
  /** Hard fault latched: any energized state -> FAULT. */
  FAULT: "FAULT",
  /** Fault cleared and reset acknowledged: FAULT -> READY. */
  FAULT_RESET: "FAULT_RESET",
  /** Reserved: DC braking engaged (not emitted by the core engine). */
  DC_BRAKE: "DC_BRAKE",
  /** Reserved: DC braking complete: DC_BRAKING -> READY. */
  BRAKE_DONE: "BRAKE_DONE"
} as const;

export type VfdVEvent = (typeof VfdVEvent)[keyof typeof VfdVEvent];

export const ALL_VFD_V_EVENTS: readonly VfdVEvent[] = Object.values(VfdVEvent);

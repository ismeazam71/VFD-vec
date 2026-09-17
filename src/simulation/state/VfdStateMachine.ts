import {
  VfdVEvent,
  VfdVState,
  type VfdVState as State,
  type VfdVEvent as Event
} from "./VfdVState.js";

/**
 * Deterministic VFD-V state machine.
 *
 * The transition table is the single source of truth for reachability.
 * Every reachable (state, event) pair is listed explicitly; a pair that
 * is not listed is a programming error and `advance()` throws, which
 * keeps simulation runs deterministic and catches logic bugs at test
 * time instead of producing silently wrong states.
 *
 * Transition overview:
 *
 *   POWER_OFF --POWER_ON--> READY
 *   READY --RUN--> ACCELERATING
 *   ACCELERATING --TARGET_REACHED--> RUNNING
 *   ACCELERATING --TARGET_FALL / COAST--> DECELERATING / COASTING
 *   RUNNING --TARGET_FALL / COAST--> DECELERATING / COASTING
 *   RUNNING --TARGET_RISE--> ACCELERATING
 *   DECELERATING --RAMP_DONE--> READY
 *   DECELERATING --TARGET_RISE--> ACCELERATING
 *   DECELERATING --COAST--> COASTING
 *   COASTING --SPEED_ZERO--> READY
 *   COASTING --RUN--> ACCELERATING        (re-energize; speed model keeps
 *                                          actual motor speed continuous)
 *   DC_BRAKING --BRAKE_DONE--> READY
 *   any energized state --FAULT--> FAULT
 *   FAULT --FAULT_RESET--> READY
 *   any --POWER_OFF--> POWER_OFF
 *
 * Events that are valid but leave the state unchanged (e.g. RUN while
 * already ACCELERATING) are listed as self-transitions.
 */

type TransitionTable = Readonly<Record<State, Readonly<Partial<Record<Event, State>>>>>;

/**
 * The engine's event-emission contract (what the table encodes):
 *
 *   POWER_ON / POWER_OFF  — always evaluated (input-derived).
 *   RUN                   — always evaluated (command-source derived;
 *                           a no-op where the command has no effect).
 *   TARGET_RISE / TARGET_FALL / TARGET_REACHED — only evaluated while
 *                           the state is a ramp state (ACCELERATING,
 *                           DECELERATING) or RUNNING; TARGET_REACHED
 *                           means the output reached a non-zero target,
 *                           RAMP_DONE means the ramp reached 0 Hz.
 *   RAMP_DONE             — only evaluated in DECELERATING.
 *   COAST                 — only evaluated when the inverter output is
 *                           currently enabled (READY, ACCELERATING,
 *                           RUNNING, DECELERATING).
 *   SPEED_ZERO            — only evaluated in COASTING.
 *   FAULT                 — only evaluated when a new hard fault latches
 *                           and the drive is energized.
 *   FAULT_RESET           — only evaluated in FAULT (emitted only after
 *                           a successful fault clear).
 *   DC_BRAKE / BRAKE_DONE — reserved for the DC braking capability
 *                           module; the core engine never emits them.
 *
 * Any other (state, event) pair is a programming error: advance()
 * throws and the state is left unchanged.
 */
const TRANSITIONS: TransitionTable = {
  [VfdVState.POWER_OFF]: {
    [VfdVEvent.POWER_ON]: VfdVState.READY,
    [VfdVEvent.POWER_OFF]: VfdVState.POWER_OFF,
    [VfdVEvent.RUN]: VfdVState.POWER_OFF
    // Not listed (advance() throws):
    //   FAULT        — a hard fault requires the drive to be energized;
    //                  the FaultManager may still record the event
    //                  without moving the state.
    //   FAULT_RESET  — fault clearing on power loss happens through the
    //                  POWER_OFF -> POWER_ON path, never a reset event.
    //   TARGET_*, RAMP_DONE, COAST, SPEED_ZERO — the ramp/output logic
    //                  is inactive without power.
    //   DC_BRAKE, BRAKE_DONE — no DC_BRAKING reachable here.
  },
  [VfdVState.READY]: {
    [VfdVEvent.RUN]: VfdVState.ACCELERATING,
    [VfdVEvent.FAULT]: VfdVState.FAULT,
    [VfdVEvent.POWER_OFF]: VfdVState.POWER_OFF,
    [VfdVEvent.DC_BRAKE]: VfdVState.DC_BRAKING
    // Not listed: the output is not enabled in READY, so no ramp or
    // coast events can be emitted; FAULT_RESET is only legal in FAULT.
  },
  [VfdVState.ACCELERATING]: {
    [VfdVEvent.TARGET_REACHED]: VfdVState.RUNNING,
    [VfdVEvent.TARGET_FALL]: VfdVState.DECELERATING,
    [VfdVEvent.TARGET_RISE]: VfdVState.ACCELERATING,
    [VfdVEvent.RUN]: VfdVState.ACCELERATING,
    [VfdVEvent.COAST]: VfdVState.COASTING,
    [VfdVEvent.FAULT]: VfdVState.FAULT,
    [VfdVEvent.POWER_OFF]: VfdVState.POWER_OFF,
    [VfdVEvent.DC_BRAKE]: VfdVState.DC_BRAKING
  },
  [VfdVState.RUNNING]: {
    [VfdVEvent.TARGET_RISE]: VfdVState.ACCELERATING,
    [VfdVEvent.TARGET_FALL]: VfdVState.DECELERATING,
    [VfdVEvent.TARGET_REACHED]: VfdVState.RUNNING,
    [VfdVEvent.RUN]: VfdVState.RUNNING,
    [VfdVEvent.COAST]: VfdVState.COASTING,
    [VfdVEvent.FAULT]: VfdVState.FAULT,
    [VfdVEvent.POWER_OFF]: VfdVState.POWER_OFF,
    [VfdVEvent.DC_BRAKE]: VfdVState.DC_BRAKING
  },
  [VfdVState.DECELERATING]: {
    [VfdVEvent.RAMP_DONE]: VfdVState.READY,
    [VfdVEvent.TARGET_REACHED]: VfdVState.RUNNING,
    [VfdVEvent.TARGET_RISE]: VfdVState.ACCELERATING,
    [VfdVEvent.TARGET_FALL]: VfdVState.DECELERATING,
    [VfdVEvent.RUN]: VfdVState.DECELERATING,
    [VfdVEvent.COAST]: VfdVState.COASTING,
    [VfdVEvent.FAULT]: VfdVState.FAULT,
    [VfdVEvent.POWER_OFF]: VfdVState.POWER_OFF,
    [VfdVEvent.DC_BRAKE]: VfdVState.DC_BRAKING
  },
  [VfdVState.COASTING]: {
    [VfdVEvent.SPEED_ZERO]: VfdVState.READY,
    [VfdVEvent.RUN]: VfdVState.ACCELERATING,
    [VfdVEvent.FAULT]: VfdVState.FAULT,
    [VfdVEvent.POWER_OFF]: VfdVState.POWER_OFF,
    [VfdVEvent.DC_BRAKE]: VfdVState.DC_BRAKING
    // Not listed: the output is disabled while coasting, so no ramp or
    // coast events can be emitted.
  },
  [VfdVState.DC_BRAKING]: {
    [VfdVEvent.BRAKE_DONE]: VfdVState.READY,
    [VfdVEvent.FAULT]: VfdVState.FAULT,
    [VfdVEvent.POWER_OFF]: VfdVState.POWER_OFF
  },
  [VfdVState.FAULT]: {
    [VfdVEvent.FAULT_RESET]: VfdVState.READY,
    [VfdVEvent.FAULT]: VfdVState.FAULT,
    [VfdVEvent.RUN]: VfdVState.FAULT,
    [VfdVEvent.POWER_OFF]: VfdVState.POWER_OFF
    // A fault cannot be cleared by running a new command; ramp/coast
    // events are impossible because the output is disabled.
  }
};

export class VfdStateMachine {
  private current: State;

  constructor(initial: State = VfdVState.POWER_OFF) {
    this.current = initial;
  }

  get state(): State {
    return this.current;
  }

  /**
   * Advances the machine by one event.
   *
   * @throws Error when the (state, event) pair is not part of the
   *         transition table — i.e. the engine emitted an event that is
   *         not legal in the current state.
   */
  advance(event: Event): State {
    const row = TRANSITIONS[this.current];
    const next = row?.[event];
    if (next === undefined) {
      throw new Error(
        `VfdStateMachine: invalid transition for event ${event} in state ${this.current}`
      );
    }
    this.current = next;
    return this.current;
  }

  /** Pure query: what state would this event lead to from the given state? */
  static next(state: State, event: Event): State | undefined {
    return TRANSITIONS[state]?.[event];
  }

  /** All events legal from the given state (for UI/test tooling). */
  static legalEvents(state: State): readonly Event[] {
    return Object.keys(TRANSITIONS[state] ?? {}) as Event[];
  }
}

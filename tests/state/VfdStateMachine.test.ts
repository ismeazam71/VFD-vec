import { describe, expect, it } from "vitest";
import { VfdVEvent, VfdVState } from "../../src/simulation/state/VfdVState.js";
import { VfdStateMachine } from "../../src/simulation/state/VfdStateMachine.js";

describe("VfdStateMachine — happy paths", () => {
  it("power on: POWER_OFF -> READY", () => {
    const sm = new VfdStateMachine();
    expect(sm.state).toBe(VfdVState.POWER_OFF);
    sm.advance(VfdVEvent.POWER_ON);
    expect(sm.state).toBe(VfdVState.READY);
  });

  it("full forward run cycle: READY -> ACCELERATING -> RUNNING -> DECELERATING -> READY", () => {
    const sm = new VfdStateMachine(VfdVState.READY);
    sm.advance(VfdVEvent.RUN);
    expect(sm.state).toBe(VfdVState.ACCELERATING);
    sm.advance(VfdVEvent.TARGET_REACHED);
    expect(sm.state).toBe(VfdVState.RUNNING);
    sm.advance(VfdVEvent.TARGET_FALL);
    expect(sm.state).toBe(VfdVState.DECELERATING);
    sm.advance(VfdVEvent.RAMP_DONE);
    expect(sm.state).toBe(VfdVState.READY);
  });

  it("target rise while running re-enters ACCELERATING", () => {
    const sm = new VfdStateMachine(VfdVState.RUNNING);
    sm.advance(VfdVEvent.TARGET_RISE);
    expect(sm.state).toBe(VfdVState.ACCELERATING);
  });

  it("target fall while accelerating re-enters DECELERATING", () => {
    const sm = new VfdStateMachine(VfdVState.ACCELERATING);
    sm.advance(VfdVEvent.TARGET_FALL);
    expect(sm.state).toBe(VfdVState.DECELERATING);
  });

  it("coast stop: RUNNING -> COASTING -> READY at standstill", () => {
    const sm = new VfdStateMachine(VfdVState.RUNNING);
    sm.advance(VfdVEvent.COAST);
    expect(sm.state).toBe(VfdVState.COASTING);
    sm.advance(VfdVEvent.SPEED_ZERO);
    expect(sm.state).toBe(VfdVState.READY);
  });

  it("re-energize while coasting returns to ACCELERATING", () => {
    const sm = new VfdStateMachine(VfdVState.COASTING);
    sm.advance(VfdVEvent.RUN);
    expect(sm.state).toBe(VfdVState.ACCELERATING);
  });

  it("power off from any state goes to POWER_OFF", () => {
    for (const start of [
      VfdVState.POWER_OFF,
      VfdVState.READY,
      VfdVState.ACCELERATING,
      VfdVState.RUNNING,
      VfdVState.DECELERATING,
      VfdVState.COASTING,
      VfdVState.DC_BRAKING,
      VfdVState.FAULT
    ]) {
      const sm = new VfdStateMachine(start);
      sm.advance(VfdVEvent.POWER_OFF);
      expect(sm.state).toBe(VfdVState.POWER_OFF);
    }
  });
});

describe("VfdStateMachine — faults", () => {
  it("fault from every energized state latches FAULT", () => {
    for (const start of [
      VfdVState.READY,
      VfdVState.ACCELERATING,
      VfdVState.RUNNING,
      VfdVState.DECELERATING,
      VfdVState.COASTING,
      VfdVState.DC_BRAKING,
      VfdVState.FAULT
    ]) {
      const sm = new VfdStateMachine(start);
      sm.advance(VfdVEvent.FAULT);
      expect(sm.state).toBe(VfdVState.FAULT);
    }
  });

  it("fault reset: FAULT -> READY", () => {
    const sm = new VfdStateMachine(VfdVState.FAULT);
    sm.advance(VfdVEvent.FAULT_RESET);
    expect(sm.state).toBe(VfdVState.READY);
  });

  it("run command does not clear a fault", () => {
    const sm = new VfdStateMachine(VfdVState.FAULT);
    sm.advance(VfdVEvent.RUN);
    expect(sm.state).toBe(VfdVState.FAULT);
  });

  it("fault while un-energized does not move the state (not a legal transition)", () => {
    const sm = new VfdStateMachine(VfdVState.POWER_OFF);
    expect(() => sm.advance(VfdVEvent.FAULT)).toThrow(/invalid transition/);
  });
});

describe("VfdStateMachine — invalid transitions", () => {
  it("RUN while POWER_OFF is a no-op (stays POWER_OFF)", () => {
    const sm = new VfdStateMachine(VfdVState.POWER_OFF);
    sm.advance(VfdVEvent.RUN);
    expect(sm.state).toBe(VfdVState.POWER_OFF);
  });

  it("FAULT_RESET is only legal from FAULT — it throws elsewhere", () => {
    const sm = new VfdStateMachine(VfdVState.READY);
    expect(() => sm.advance(VfdVEvent.FAULT_RESET)).toThrow(/invalid transition/);
    expect(sm.state).toBe(VfdVState.READY);
  });

  it("unlisted (state, event) pairs throw deterministically", () => {
    const sm = new VfdStateMachine(VfdVState.POWER_OFF);
    // BRAKE_DONE makes no sense in POWER_OFF.
    expect(() => sm.advance(VfdVEvent.BRAKE_DONE)).toThrow(/invalid transition/);
    // State unchanged after a failed advance.
    expect(sm.state).toBe(VfdVState.POWER_OFF);
  });

  it("pure next() query matches advance()", () => {
    expect(VfdStateMachine.next(VfdVState.READY, VfdVEvent.RUN)).toBe(VfdVState.ACCELERATING);
    expect(VfdStateMachine.next(VfdVState.READY, VfdVEvent.BRAKE_DONE)).toBeUndefined();
  });
});

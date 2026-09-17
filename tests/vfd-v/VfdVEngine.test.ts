import { describe, it, expect } from "vitest";
import {
  createEngine,
  POWER_ON,
  powerOn,
  tick,
  tickN,
  startForwardRun,
  holdForwardRun,
  stopForwardRun,
  RUN_PARAMS
} from "./helpers.js";
import { VfdVState } from "../../src/simulation/state/VfdVState.js";
import { MONITOR_IDS } from "../../src/simulation/monitoring/VfdMonitorValues.js";

const DT = 0.01;
const KEYPAD_60 = 60;

// ---------------------------------------------------------------------------
// Test A — Power on
// ---------------------------------------------------------------------------
describe("A. power on", () => {
  it("stays POWER_OFF without mains, then READY with dc bus charged", () => {
    const { engine } = createEngine();
    const off = tick(engine, DT, { phaseR: false, phaseS: false, phaseT: false });
    expect(off.state).toBe(VfdVState.POWER_OFF);
    expect(off.powerOn).toBe(false);
    expect(off.dcBusVoltage).toBe(0);

    const ready = powerOn(engine, DT);
    expect(ready.state).toBe(VfdVState.READY);
    expect(ready.powerOn).toBe(true);
    // Bus = 1.35 * 400 V (2-phase factor 1.0, 3 phases present).
    expect(ready.dcBusVoltage).toBeCloseTo(540, 6);
    expect(ready.outputEnabled).toBe(false);
    expect(ready.outputFrequency).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Test B — Forward run
// ---------------------------------------------------------------------------
describe("B. forward run", () => {
  it("ramps up to the keypad frequency and reaches RUNNING", () => {
    const { engine } = createEngine({ params: RUN_PARAMS });
    powerOn(engine, DT);
    // 01-12 default 10 s accel: 60 Hz / 10 s = 6 Hz/s.
    const accelerating = startForwardRun(engine, DT, KEYPAD_60);
    expect(accelerating.state).toBe(VfdVState.ACCELERATING);
    expect(accelerating.direction).toBe(1);
    expect(accelerating.outputEnabled).toBe(true);
    expect(accelerating.outputFrequency).toBeGreaterThan(0);

    // Mid-ramp at exactly 5 s (500 ticks total incl. the start tick): 30 Hz.
    const mid = holdForwardRun(engine, 499, DT, KEYPAD_60);
    expect(mid.state).toBe(VfdVState.ACCELERATING);
    expect(mid.outputFrequency).toBeCloseTo(30, 5);

    // End of ramp: RUNNING at 60 Hz, motor near synchronous (4-pole, 60 Hz).
    const running = holdForwardRun(engine, 500, DT, KEYPAD_60);
    expect(running.state).toBe(VfdVState.RUNNING);
    expect(running.outputFrequency).toBeCloseTo(60, 6);
    expect(running.actualSpeedRPM).toBeGreaterThan(1700);
    expect(running.actualSpeedRPM).toBeLessThan(1800);
    expect(running.outputVoltage).toBeGreaterThan(400); // near 480 V at 60 Hz
    expect(running.outputCurrent).toBeGreaterThan(0); // no-load current ~1.5 A
    expect(running.elapsedRunTime).toBeGreaterThan(9);
  });
});

// ---------------------------------------------------------------------------
// Test C — Reverse run
// ---------------------------------------------------------------------------
describe("C. reverse run", () => {
  it("runs in reverse with negative speed and negative slip", () => {
    const { engine } = createEngine({ params: { ...RUN_PARAMS, "00-23": 1, "01-12": 10 } });
    powerOn(engine, DT);
    const reversing = tick(engine, DT, { ...POWER_ON, reverseCommand: true, keypadFrequency: 60 });
    expect(reversing.direction).toBe(-1);
    expect(reversing.state).toBe(VfdVState.ACCELERATING);
    // No FWD/REV held: the reverse latch (mode 2) keeps the run going
    // (the keypad setpoint stays at 60 Hz).
    const running = tickN(engine, 1200, DT, { ...POWER_ON, keypadFrequency: 60 });
    expect(running.state).toBe(VfdVState.RUNNING);
    expect(running.direction).toBe(-1);
    expect(running.outputFrequency).toBeCloseTo(60, 6);
    expect(running.actualSpeedRPM).toBeLessThan(-1700);
    // Small slip in magnitude (motoring), reported as
    // direction * synchronous - actual (negative here).
    expect(Math.abs(running.slipRPM)).toBeLessThan(30);
  });
});

// ---------------------------------------------------------------------------
// Test D — AVI frequency control
// ---------------------------------------------------------------------------
describe("D. AVI (0-10 V) frequency control", () => {
  it("maps 0 V -> 0 Hz, 5 V -> mid, 10 V -> max (01-00)", () => {
    const { engine } = createEngine({ params: { ...RUN_PARAMS, "00-20": 1, "01-12": 0.5 } });
    powerOn(engine, DT);
    // FWD latched (mode 2); target follows AVI.
    let s = tick(engine, DT, { ...POWER_ON, forwardCommand: true, aviVoltage: 0 });
    expect(s.targetFrequency).toBeCloseTo(0, 6);
    // A zero target does not start the drive (inverter deadband).
    expect(s.state).toBe(VfdVState.READY);

    s = tick(engine, DT, { ...POWER_ON, forwardCommand: true, aviVoltage: 5 });
    expect(s.targetFrequency).toBeCloseTo(30, 6);
    expect(s.state).toBe(VfdVState.ACCELERATING);
    s = holdForwardRunAvi(engine, 400, DT, 5);
    expect(s.state).toBe(VfdVState.RUNNING);
    expect(s.outputFrequency).toBeCloseTo(30, 6);

    // Raise AVI -> re-accelerate to 60 Hz.
    s = tick(engine, DT, { ...POWER_ON, forwardCommand: true, aviVoltage: 10 });
    expect(s.targetFrequency).toBeCloseTo(60, 6);
    s = holdForwardRunAvi(engine, 400, DT, 10);
    expect(s.state).toBe(VfdVState.RUNNING);
    expect(s.outputFrequency).toBeCloseTo(60, 6);
  });

  it("applies bias (03-03) and gain (03-09) with clamping", () => {
    const { engine } = createEngine({
      params: {
        ...RUN_PARAMS,
        "00-20": 1,
        "03-03": 50,
        "03-09": 100
      }
    });
    powerOn(engine, DT);
    let s = tick(engine, DT, { ...POWER_ON, forwardCommand: true, aviVoltage: 0 });
    expect(s.targetFrequency).toBeCloseTo(30, 6); // bias only
    s = tick(engine, DT, { ...POWER_ON, forwardCommand: true, aviVoltage: 10 });
    expect(s.targetFrequency).toBeCloseTo(60, 6); // full scale = max

    // 200% gain saturates at the maximum.
    const { engine: eng2 } = createEngine({
      params: { ...RUN_PARAMS, "00-20": 1, "03-09": 200 }
    });
    powerOn(eng2, DT);
    const s2 = tick(eng2, DT, { ...POWER_ON, forwardCommand: true, aviVoltage: 5 });
    expect(s2.targetFrequency).toBeCloseTo(60, 6); // 5 V x 2.0 = 60 Hz (10 V would clamp)
  });
});

function holdForwardRunAvi(
  engine: import("../../src/simulation/VfdVRuntimeEngine.js").VfdVRuntimeEngine,
  n: number,
  dt: number,
  aviVoltage: number
): import("../../src/simulation/state/VfdRuntimeState.js").VfdVRuntimeState {
  return tickN(engine, n, dt, { ...POWER_ON, forwardCommand: true, aviVoltage });
}

// ---------------------------------------------------------------------------
// Test E — Acceleration
// ---------------------------------------------------------------------------
describe("E. acceleration", () => {
  it("follows the 01-12 ramp rate", () => {
    const { engine } = createEngine({ params: { ...RUN_PARAMS, "01-12": 10 } });
    powerOn(engine, DT);
    startForwardRun(engine, DT, 60);
    // 5 s into a 10 s ramp (500 ticks total incl. start tick) -> 30 Hz.
    const s = holdForwardRun(engine, 499, DT, 60);
    expect(s.outputFrequency).toBeCloseTo(30, 5);

    // Faster accel: 01-12 = 2 s -> 30 Hz/s.
    const { engine: eng2 } = createEngine({ params: { ...RUN_PARAMS, "01-12": 2 } });
    powerOn(eng2, DT);
    startForwardRun(eng2, DT, 60);
    const s2 = holdForwardRun(eng2, 99, DT, 60); // 100 ticks total = exactly 1 s
    expect(s2.outputFrequency).toBeCloseTo(30, 5);
  });
});

// ---------------------------------------------------------------------------
// Tests F + G — Deceleration and ramp stop
// ---------------------------------------------------------------------------
describe("F/G. ramp stop (deceleration)", () => {
  it("decelerates at the 01-13 rate to zero, then READY", () => {
    const { engine } = createEngine({ params: { ...RUN_PARAMS, "01-12": 1, "01-13": 10 } });
    powerOn(engine, DT);
    startForwardRun(engine, DT, 60);
    holdForwardRun(engine, 100, DT, 60); // ~1 s: at 60 Hz
    const running = tick(engine, DT, { ...POWER_ON, forwardCommand: true, keypadFrequency: 60 });
    expect(running.outputFrequency).toBeCloseTo(60, 4);

    // Mode-2 momentary stop (FWD release + re-press) -> ramp stop
    // (00-22 = 0 default). FWD then stays held with no new edge.
    const stopping = stopForwardRun(engine, DT, 60);
    expect(stopping.state).toBe(VfdVState.DECELERATING);

    // ~4.9 s of deceleration at 6 Hz/s from 59.94 Hz.
    const mid = tickN(engine, 490, DT, { ...POWER_ON, forwardCommand: true, keypadFrequency: 60 });
    expect(mid.outputFrequency).toBeGreaterThan(29);
    expect(mid.outputFrequency).toBeLessThan(32);

    const done = tickN(engine, 510, DT, { ...POWER_ON, forwardCommand: true, keypadFrequency: 60 });
    expect(done.state).toBe(VfdVState.READY);
    expect(done.outputFrequency).toBe(0);
    expect(done.outputEnabled).toBe(false);
  });

  it("ramp stop is gradual (no instantaneous jumps)", () => {
    const { engine } = createEngine({ params: { ...RUN_PARAMS, "01-12": 0.5, "01-13": 5 } });
    powerOn(engine, DT);
    startForwardRun(engine, DT, 60);
    holdForwardRun(engine, 60, DT, 60);
    stopForwardRun(engine, DT, 60);

    // 12 Hz/s max step: no single tick may drop more than 0.15 Hz.
    const samples: number[] = [];
    for (let i = 0; i < 600; i++) {
      const s = tick(engine, DT, { ...POWER_ON, forwardCommand: true, keypadFrequency: 60 });
      samples.push(s.outputFrequency);
      if (i > 0) {
        const prev = samples[i - 1]!;
        const cur = samples[i]!;
        expect(cur - prev).toBeGreaterThanOrEqual(-0.15);
        expect(cur).toBeLessThanOrEqual(prev + 1e-9);
      }
      if (s.state === VfdVState.READY) break;
    }
    expect(samples[samples.length - 1]).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Test H — Coast stop
// ---------------------------------------------------------------------------
describe("H. coast stop", () => {
  it("disables the inverter immediately; the motor coasts down", () => {
    const { engine } = createEngine({
      params: { ...RUN_PARAMS, "00-22": 1, "01-12": 10 }
    });
    powerOn(engine, DT);
    startForwardRun(engine, DT, 60);
    holdForwardRun(engine, 1200, DT, 60); // ~12 s: running at 60 Hz

    const coasting = stopForwardRun(engine, DT, 60);
    expect(coasting.state).toBe(VfdVState.COASTING);
    expect(coasting.outputFrequency).toBe(0); // inverter output off immediately
    expect(coasting.outputEnabled).toBe(false);
    expect(coasting.actualSpeedRPM).toBeGreaterThan(1600); // motor still spinning

    // Coasting with load: speed decays toward zero.
    engine.setLoadPercent(50);
    const s2 = tickN(engine, 1000, DT, { ...POWER_ON, forwardCommand: true, keypadFrequency: 60 });
    expect(s2.actualSpeedRPM).toBeLessThan(coasting.actualSpeedRPM);
    expect(s2.state).toBe(VfdVState.COASTING);
  });
});

// ---------------------------------------------------------------------------
// Test I — Reverse disabled
// ---------------------------------------------------------------------------
describe("I. reverse disabled (00-23 = 0)", () => {
  it("REV does not run the drive in reverse; FWD still works", () => {
    const { engine } = createEngine({ params: { ...RUN_PARAMS, "01-12": 1 } });
    powerOn(engine, DT);
    const rev = tick(engine, DT, { ...POWER_ON, reverseCommand: true, keypadFrequency: 60 });
    expect(rev.state).toBe(VfdVState.READY);
    expect(rev.direction).toBe(0);
    const stillStopped = tickN(engine, 100, DT, { ...POWER_ON, reverseCommand: true, keypadFrequency: 60 });
    expect(stillStopped.state).toBe(VfdVState.READY);
    expect(stillStopped.outputFrequency).toBe(0);

    // Forward is unaffected.
    const fwd = startForwardRun(engine, DT, 60);
    expect(fwd.state).toBe(VfdVState.ACCELERATING);
    expect(fwd.direction).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Test J — Overcurrent (acceleration + running)
// ---------------------------------------------------------------------------
describe("J. overcurrent protection", () => {
  it("ocA during acceleration under heavy load", () => {
    const { engine, registry } = createEngine({
      params: { ...RUN_PARAMS, "01-12": 2, "06-03": 125 }
    });
    powerOn(engine, DT);
    engine.setLoadPercent(200); // overload cannot be met -> breakdown current
    const running = startForwardRun(engine, DT, 60);
    let s = running;
    for (let i = 0; i < 500 && s.state !== VfdVState.FAULT; i++) {
      s = holdForwardRun(engine, 1, DT, 60);
    }
    expect(s.state).toBe(VfdVState.FAULT);
    expect(s.activeFault).toBe("ocA");
    expect(s.outputEnabled).toBe(false);
    expect(s.outputFrequency).toBe(0);
    expect(s.faultHistory[0]).toBe("ocA");
    expect(registry.get("06-17")).toBe(1); // first fault in the history window
  });

  it("ocn (constant-speed overcurrent) when load rises while running", () => {
    const { engine } = createEngine({
      params: { ...RUN_PARAMS, "01-12": 10, "06-05": 125 }
    });
    powerOn(engine, DT);
    startForwardRun(engine, DT, 60);
    holdForwardRun(engine, 1200, DT, 60); // running, light load
    expect(engine.getState().state).toBe(VfdVState.RUNNING);

    engine.setLoadPercent(200); // overload -> sustained breakdown current
    let s = engine.getState();
    for (let i = 0; i < 200 && s.state !== VfdVState.FAULT; i++) {
      s = holdForwardRun(engine, 1, DT, 60);
    }
    expect(s.state).toBe(VfdVState.FAULT);
    expect(s.activeFault).toBe("ocn");
  });
});

// ---------------------------------------------------------------------------
// Test K — Overvoltage (regenerative braking)
// ---------------------------------------------------------------------------
describe("K. overvoltage", () => {
  it("aggressive deceleration raises the bus into OV", () => {
    const { engine } = createEngine({
      params: {
        ...RUN_PARAMS,
        "01-12": 10,
        "01-13": 0.5,
        "06-01": 115 // 115% of 540 V = 621 V trip
      }
    });
    powerOn(engine, DT);
    engine.setLoadPercent(100);
    startForwardRun(engine, DT, 60);
    holdForwardRun(engine, 1200, DT, 60);
    expect(engine.getState().state).toBe(VfdVState.RUNNING);

    // Aggressive stop: the bus rises over one or two ticks into the trip.
    stopForwardRun(engine, DT, 60);
    let stop = engine.getState();
    for (let i = 0; i < 10 && stop.state !== VfdVState.FAULT; i++) {
      stop = tick(engine, DT, { ...POWER_ON, forwardCommand: true, keypadFrequency: 60 });
    }
    expect(stop.state).toBe(VfdVState.FAULT);
    expect(stop.activeFault).toBe("OV");
    expect(stop.dcBusVoltage).toBeGreaterThanOrEqual(621);
    expect(stop.outputEnabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test L — Low voltage and phase-loss response (06-02)
// ---------------------------------------------------------------------------
describe("L. low voltage / phase loss", () => {
  it("Lv fault when the bus drops below 06-00", () => {
    const { engine } = createEngine({
      params: { ...RUN_PARAMS, "01-12": 0.5, "06-00": 90 }
    });
    powerOn(engine, DT);
    engine.setLoadPercent(50);
    startForwardRun(engine, DT, 60);
    holdForwardRun(engine, 200, DT, 60);
    expect(engine.getState().state).toBe(VfdVState.RUNNING);

    // Drop one phase: bus sags to 81.6% of base = 440.6 V < 486 V trip.
    const lv = tick(engine, DT, { ...POWER_ON, phaseR: false, forwardCommand: true, keypadFrequency: 60 });
    expect(lv.state).toBe(VfdVState.FAULT);
    expect(lv.activeFault).toBe("Lv");
  });

  it("06-02 = 1: phase loss warns and the drive continues", () => {
    const { engine } = createEngine({
      params: { ...RUN_PARAMS, "01-12": 0.5, "06-02": 1, "06-00": 0 }
    });
    powerOn(engine, DT);
    engine.setLoadPercent(50);
    startForwardRun(engine, DT, 60);
    holdForwardRun(engine, 200, DT, 60);

    const s = tick(engine, DT, { ...POWER_ON, phaseR: false, forwardCommand: true, keypadFrequency: 60 });
    expect(s.phaseLossWarning).toBe(true);
    expect(s.activeFault).toBeNull();
    expect(s.state).toBe(VfdVState.RUNNING); // continues on two phases
  });

  it("06-02 = 2: phase loss stops with a ramp", () => {
    const { engine } = createEngine({
      params: { ...RUN_PARAMS, "01-12": 0.5, "01-13": 5, "06-02": 2, "06-00": 0 }
    });
    powerOn(engine, DT);
    engine.setLoadPercent(50);
    startForwardRun(engine, DT, 60);
    holdForwardRun(engine, 200, DT, 60);

    const s = tick(engine, DT, { ...POWER_ON, phaseR: false, forwardCommand: true, keypadFrequency: 60 });
    expect(s.phaseLossWarning).toBe(true);
    expect(s.state).toBe(VfdVState.DECELERATING);
    expect(s.activeFault).toBeNull();
  });

  it("06-02 = 3: phase loss stops on the coast", () => {
    const { engine } = createEngine({
      params: { ...RUN_PARAMS, "01-12": 0.5, "06-02": 3, "06-00": 0 }
    });
    powerOn(engine, DT);
    engine.setLoadPercent(50);
    startForwardRun(engine, DT, 60);
    holdForwardRun(engine, 200, DT, 60);

    const s = tick(engine, DT, { ...POWER_ON, phaseR: false, forwardCommand: true, keypadFrequency: 60 });
    expect(s.phaseLossWarning).toBe(true);
    expect(s.state).toBe(VfdVState.COASTING);
    expect(s.activeFault).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test M — Over-torque (oL2)
// ---------------------------------------------------------------------------
describe("M. over-torque", () => {
  it("sustained torque above 06-06 for 06-07 s faults oL2 (06-08 = 1)", () => {
    const { engine } = createEngine({
      params: {
        ...RUN_PARAMS,
        "01-12": 10,
        "06-06": 150,
        "06-07": 1.0,
        "06-08": 1
      }
    });
    powerOn(engine, DT);
    startForwardRun(engine, DT, 60);
    holdForwardRun(engine, 1200, DT, 60);
    expect(engine.getState().state).toBe(VfdVState.RUNNING);

    engine.setLoadPercent(200); // torque ~180% > 150%
    let s = engine.getState();
    for (let i = 0; i < 300 && s.state !== VfdVState.FAULT; i++) {
      s = holdForwardRun(engine, 1, DT, 60);
    }
    expect(s.state).toBe(VfdVState.FAULT);
    expect(s.activeFault).toBe("oL2");
  });

  it("short over-torque under 06-07 does not fault", () => {
    const { engine } = createEngine({
      params: {
        ...RUN_PARAMS,
        "01-12": 10,
        "06-06": 150,
        "06-07": 5.0,
        "06-08": 1
      }
    });
    powerOn(engine, DT);
    startForwardRun(engine, DT, 60);
    holdForwardRun(engine, 1200, DT, 60);

    engine.setLoadPercent(200);
    const s = holdForwardRun(engine, 200, DT, 60); // 2 s < 5 s
    expect(s.state).toBe(VfdVState.RUNNING);
    expect(s.activeFault).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test N — I^2t motor thermal
// ---------------------------------------------------------------------------
describe("N. I^2t thermal (OL2)", () => {
  it("sustained overload heats the motor to OL2; a short spike does not", () => {
    const { engine } = createEngine({
      params: {
        ...RUN_PARAMS,
        "01-12": 10,
        "06-13": 100 // 100% of rated current heats at 100%/300 s baseline
      },
      model: { motorThermalTimeConstantS: 30 }
    });
    powerOn(engine, DT);
    startForwardRun(engine, DT, 60);
    holdForwardRun(engine, 1200, DT, 60);
    expect(engine.getState().state).toBe(VfdVState.RUNNING);

    engine.setLoadPercent(150); // ~22 A vs 15 A rated -> sustained overload
    const early = holdForwardRun(engine, 500, DT, 60); // +5 s
    expect(early.state).toBe(VfdVState.RUNNING);
    const earlyHeat = engine.getMonitor().provider(MONITOR_IDS.THERMAL_HEAT_PERCENT);
    expect(earlyHeat).toBeGreaterThan(10);
    expect(early.activeFault).toBeNull();

    let s = early;
    for (let i = 0; i < 5000 && s.state !== VfdVState.FAULT; i++) {
      s = holdForwardRun(engine, 1, DT, 60);
    }
    expect(s.state).toBe(VfdVState.FAULT);
    expect(s.activeFault).toBe("OL2");
    expect(s.motorTemperature).toBeGreaterThan(70);
  });
});

// ---------------------------------------------------------------------------
// Test O — Fault history (06-17..06-20, most recent first)
// ---------------------------------------------------------------------------
describe("O. fault history", () => {
  it("keeps the four most recent faults across power cycles", () => {
    const { engine, registry } = createEngine({
      params: {
        ...RUN_PARAMS,
        "06-03": 125,
        "06-01": 115,
        "06-00": 90,
        "06-06": 150,
        "06-07": 0.2,
        "06-08": 1
      }
    });
    powerOn(engine, DT);

    const powerCycle = () => {
      tick(engine, DT, { phaseR: false, phaseS: false, phaseT: false });
      powerOn(engine, DT);
    };
    /** Runs to 60 Hz and waits for RUNNING. */
    const runTo60 = (ticks: number) => {
      startForwardRun(engine, DT, 60);
      return holdForwardRun(engine, ticks, DT, 60);
    };
    const untilFault = (maxTicks: number) => {
      let s = engine.getState();
      for (let i = 0; i < maxTicks && s.state !== VfdVState.FAULT; i++) {
        s = holdForwardRun(engine, 1, DT, 60);
      }
      return s;
    };

    // 1) ocA: heavy-load start (fast ramp + 125% level).
    registry.set("01-12", 2);
    engine.setLoadPercent(200);
    let s = untilFault(500);
    expect(s.activeFault).toBe("ocA");
    powerCycle();
    expect(engine.getState().activeFault).toBeNull();

    // 2) OV: full run, then stop (regen into a 115% trip).
    registry.set("01-12", 10);
    registry.set("06-03", 180); // restore the default OC level
    engine.setLoadPercent(0);
    runTo60(1200);
    stopForwardRun(engine, DT, 60);
    // With the default 10 s decel and no load, regeneration builds over
    // a few tenths of a second before the bus reaches the trip.
    s = engine.getState();
    for (let i = 0; i < 100 && s.state !== VfdVState.FAULT; i++) {
      s = tick(engine, DT, { ...POWER_ON, forwardCommand: true, keypadFrequency: 60 });
    }
    expect(s.activeFault).toBe("OV");
    powerCycle();

    // 3) Lv: phase drop while running (bus < 90% of nominal).
    runTo60(1200);
    tick(engine, DT, { ...POWER_ON, phaseR: false, forwardCommand: true, keypadFrequency: 60 });
    s = engine.getState();
    for (let i = 0; i < 100 && s.state !== VfdVState.FAULT; i++) {
      s = tick(engine, DT, { ...POWER_ON, phaseR: false, forwardCommand: true, keypadFrequency: 60 });
    }
    expect(s.activeFault).toBe("Lv");
    powerCycle();

    // 4) oL2: overload at speed (torque ~180% > 150%).
    runTo60(1200);
    engine.setLoadPercent(200);
    s = untilFault(500);
    expect(s.activeFault).toBe("oL2");

    expect(engine.getState().faultHistory).toEqual(["oL2", "Lv", "OV", "ocA"]);
    // 06-17 (newest) .. 06-20 (oldest), Delta code values.
    expect(registry.get("06-17")).toBe(20); // oL2
    expect(registry.get("06-18")).toBe(11); // Lv
    expect(registry.get("06-19")).toBe(10); // OV
    expect(registry.get("06-20")).toBe(1); // ocA
  });
});

// ---------------------------------------------------------------------------
// Test P — Relay outputs (02-11 / 02-12 / 02-13)
// ---------------------------------------------------------------------------
describe("P. relay outputs", () => {
  it("RA=running, RB=ready, RC=error follow the state", () => {
    const { engine } = createEngine({
      params: { ...RUN_PARAMS, "02-11": 1, "02-12": 4, "02-13": 5, "01-12": 1 }
    });
    const ready = powerOn(engine, DT);
    expect(ready.relayRA).toBe(false);
    expect(ready.relayRB).toBe(true); // ready
    expect(ready.relayRC).toBe(false);

    const running = tickN(
      engine,
      200,
      DT,
      { ...POWER_ON, forwardCommand: true, keypadFrequency: 60 }
    );
    expect(running.state).toBe(VfdVState.RUNNING);
    expect(running.relayRA).toBe(true);
    expect(running.relayRB).toBe(false);
    expect(running.relayRC).toBe(false);

    const fault = tick(engine, DT, { ...POWER_ON, forwardCommand: true, keypadFrequency: 60, externalFault: true });
    expect(fault.state).toBe(VfdVState.FAULT);
    expect(fault.relayRC).toBe(true);
    expect(fault.relayRA).toBe(false);
  });

  it("speed-attained function (02-11 = 2) closes only at the target", () => {
    const { engine } = createEngine({
      params: { ...RUN_PARAMS, "02-11": 2, "01-12": 5 }
    });
    powerOn(engine, DT);
    const accel = startForwardRun(engine, DT, 60);
    expect(accel.relayRA).toBe(false); // not at target yet
    const running = holdForwardRun(engine, 700, DT, 60);
    expect(running.state).toBe(VfdVState.RUNNING);
    expect(running.relayRA).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test Q — RS-485 abstraction
// ---------------------------------------------------------------------------
describe("Q. RS-485", () => {
  it("serves parameter read/write with address checking and read-only guards", () => {
    const { engine, registry } = createEngine();
    const rs485 = engine.rs485;
    expect(rs485.getAddress()).toBe(1); // 09-00 default
    expect(rs485.getBaudRate()).toBe(9600); // 09-01 = 0 -> 9600

    const read = rs485.readParameter(1, "01-00");
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.value).toBe(60);

    const wrongAddress = rs485.readParameter(2, "01-00");
    expect(wrongAddress.ok).toBe(false);

    const write = rs485.writeParameter(1, "01-12", 5);
    expect(write.ok).toBe(true);
    const readBack = rs485.readParameter(1, "01-12");
    expect(readBack.ok).toBe(true);
    if (readBack.ok) expect(readBack.value).toBe(5);

    const readOnly = rs485.writeParameter(1, "06-17", 3);
    expect(readOnly.ok).toBe(false);

    const outOfRange = rs485.writeParameter(1, "01-00", 999);
    expect(outOfRange.ok).toBe(false);

    registry.set("09-01", 1);
    expect(rs485.getBaudRate()).toBe(19200);
  });

  it("can be the operation and frequency command source (00-20/00-21 = 0)", () => {
    const { engine } = createEngine({
      params: { "00-20": 0, "00-21": 0, "01-12": 0.5 }
    });
    powerOn(engine, DT);
    const sent = engine.rs485.writeCommand(1, { forward: true, frequencySetpointHz: 30 });
    expect(sent.ok).toBe(true);
    const s = tickN(engine, 200, DT, POWER_ON);
    expect(s.state).toBe(VfdVState.RUNNING);
    expect(s.outputFrequency).toBeCloseTo(30, 6);

    const mon = engine.rs485.readMonitor(1, MONITOR_IDS.OUTPUT_FREQUENCY_HZ_X10);
    expect(mon.ok).toBe(true);
    if (mon.ok) expect(mon.value).toBe(300);

    const monWrong = engine.rs485.readMonitor(9, MONITOR_IDS.OUTPUT_FREQUENCY_HZ_X10);
    expect(monWrong.ok).toBe(false);

    // Communication stop.
    engine.rs485.writeCommand(1, { forward: false, reverse: false });
    const stopped = tickN(engine, 1000, DT, POWER_ON);
    expect(stopped.state).toBe(VfdVState.READY);
  });
});

// ---------------------------------------------------------------------------
// Determinism and step-size independence
// ---------------------------------------------------------------------------
describe("determinism", () => {
  function scenario(engine: import("../../src/simulation/VfdVRuntimeEngine.js").VfdVRuntimeEngine): Record<string, number | string | null | boolean> {
    // Mixed-dt run: power on, start at 5 s, frequency step at 10 s,
    // load step at 15 s (external load set through the engine API).
    engine.setLoadPercent(20);
    const dts = [
      ...new Array(100).fill(0.001),
      ...new Array(500).fill(0.01),
      ...new Array(100).fill(0.0167),
      ...new Array(50).fill(0.1)
    ];
    let t = 0;
    let state = engine.getState();
    for (const dt of dts) {
      if (t >= 15) engine.setLoadPercent(60);
      const started = t >= 5;
      const inputs = {
        ...POWER_ON,
        forwardCommand: started,
        keypadFrequency: t < 10 ? 30 : 45
      };
      state = engine.update(dt, inputs);
      t += dt;
    }
    return {
      state: state.state,
      outputFrequency: state.outputFrequency,
      targetFrequency: state.targetFrequency,
      actualSpeedRPM: state.actualSpeedRPM,
      outputCurrent: state.outputCurrent,
      torquePercent: state.torquePercent,
      dcBusVoltage: state.dcBusVoltage,
      motorTemperature: state.motorTemperature,
      thermalHeatPercent: engine.getMonitor().provider(MONITOR_IDS.THERMAL_HEAT_PERCENT),
      direction: state.direction
    };
  }

  it("same inputs and dt sequence -> identical final state (bit for bit)", () => {
    const a = createEngine({ params: { "00-20": 2, "00-21": 1 } });
    const b = createEngine({ params: { "00-20": 2, "00-21": 1 } });
    expect(JSON.stringify(scenario(a.engine))).toBe(JSON.stringify(scenario(b.engine)));
  });

  it("output frequency is dt-invariant for a pure ramp (0.001 vs 0.01 vs 0.1)", () => {
    const freqs: number[] = [];
    for (const dt of [0.001, 0.01, 0.1]) {
      const { engine } = createEngine({ params: { ...RUN_PARAMS, "01-12": 2 } });
      powerOn(engine, dt);
      startForwardRun(engine, dt, 60);
      const n = Math.round(5 / dt); // well past the 2 s ramp
      const s = holdForwardRun(engine, n, dt, 60);
      freqs.push(s.outputFrequency);
    }
    // 5 s > 2 s ramp: output clamped at the 60 Hz target in all cases.
    const first = freqs[0]!;
    expect(first).toBeCloseTo(60, 6);
    expect(freqs[1]!).toBeCloseTo(first, 6);
    expect(freqs[2]!).toBeCloseTo(first, 6);
  });
});

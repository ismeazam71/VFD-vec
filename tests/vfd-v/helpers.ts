import { ParameterRegistry } from "../../src/parameters/ParameterRegistry.js";
import { VFD_V_CORE_PARAMETERS } from "../../src/devices/vfd-v/schema/index.js";
import { VfdVRuntimeEngine } from "../../src/simulation/VfdVRuntimeEngine.js";
import type { VfdVMotorModelConfig } from "../../src/simulation/modelConstants.js";
import type {
  VfdVPhysicalInputs,
  VfdVRuntimeState
} from "../../src/simulation/state/VfdRuntimeState.js";

export interface EngineFixture {
  readonly engine: VfdVRuntimeEngine;
  readonly registry: ParameterRegistry;
}

export interface CreateEngineOptions {
  /** Parameter overrides applied after loading the core schema. */
  params?: Record<string, number>;
  /** Model constant overrides (physics, not parameters). */
  model?: Partial<VfdVMotorModelConfig>;
}

/** Creates a VFD-V engine with the core schema loaded. */
export function createEngine(options: CreateEngineOptions = {}): EngineFixture {
  const registry = new ParameterRegistry();
  const load = registry.load(VFD_V_CORE_PARAMETERS);
  if (!load.ok) throw new Error(`schema load failed: ${load.reason}`);
  for (const [id, value] of Object.entries(options.params ?? {})) {
    const result = registry.set(id, value);
    if (!result.ok) throw new Error(`test setup param ${id}=${value}: ${result.reason}`);
  }
  const engine = new VfdVRuntimeEngine({ parameters: registry, model: options.model });
  return { engine, registry };
}

/** All three mains phases present. */
export const POWER_ON: VfdVPhysicalInputs = {
  phaseR: true,
  phaseS: true,
  phaseT: true,
  forwardCommand: false,
  reverseCommand: false,
  keypadForward: false,
  keypadReverse: false,
  keypadFrequency: 0,
  aviVoltage: 0,
  externalFault: false
};

export function tick(
  engine: VfdVRuntimeEngine,
  dt: number,
  inputs?: Partial<VfdVPhysicalInputs>
): VfdVRuntimeState {
  return engine.update(dt, inputs);
}

/** Runs n ticks and returns the last state. */
export function tickN(
  engine: VfdVRuntimeEngine,
  n: number,
  dt: number,
  inputs?: Partial<VfdVPhysicalInputs>
): VfdVRuntimeState {
  let state: VfdVRuntimeState | null = null;
  for (let i = 0; i < n; i++) {
    state = tick(engine, dt, inputs);
  }
  return state!;
}

/** Powers the drive on (one tick with all phases). */
export function powerOn(engine: VfdVRuntimeEngine, dt = 0.01): VfdVRuntimeState {
  return tick(engine, dt, POWER_ON);
}

/**
 * Standard run setup: external terminals for the operation command
 * (00-21 = 1), keypad for the frequency command (00-20 = 2), and the
 * virtual keypad frequency set.
 */
export const RUN_PARAMS: Record<string, number> = {
  "00-20": 2,
  "00-21": 1
};

/** Starts a forward run via the FWD terminal (mode 2: latch). */
export function startForwardRun(
  engine: VfdVRuntimeEngine,
  dt: number,
  frequencyHz: number
): VfdVRuntimeState {
  return tick(engine, dt, { ...POWER_ON, forwardCommand: true, keypadFrequency: frequencyHz });
}

/** Holds the forward run for n ticks (FWD stays ON in mode 2). */
export function holdForwardRun(
  engine: VfdVRuntimeEngine,
  n: number,
  dt: number,
  frequencyHz: number
): VfdVRuntimeState {
  return tickN(engine, n, dt, { ...POWER_ON, forwardCommand: true, keypadFrequency: frequencyHz });
}

/**
 * Stops a latched forward run with the mode-2 momentary button:
 * release FWD (no effect while latched), then press it again
 * (toggle stop). Two ticks; returns the post-stop state.
 */
export function stopForwardRun(
  engine: VfdVRuntimeEngine,
  dt: number,
  frequencyHz: number
): VfdVRuntimeState {
  tick(engine, dt, { ...POWER_ON, forwardCommand: false, keypadFrequency: frequencyHz });
  return tick(engine, dt, { ...POWER_ON, forwardCommand: true, keypadFrequency: frequencyHz });
}

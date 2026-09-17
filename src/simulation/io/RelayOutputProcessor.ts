import { ParamId } from "../../devices/vfd-v/paramIds.js";
import type { ParameterRegistry } from "../../parameters/ParameterRegistry.js";
import { VfdVState } from "../state/VfdVState.js";
import type { VfdVState as State } from "../state/VfdVState.js";

/**
 * RA/RB/RC relay output processor (core specification §23).
 *
 * Each relay follows its multifunction output parameter:
 *
 *   RA <- 02-11
 *   RB <- 02-12
 *   RC <- 02-13
 *
 * Supported functions (core option set):
 *
 *   0 = No function        -> off
 *   1 = AC Drive Running   -> on while the inverter is driving the motor
 *                             (ACCELERATING or RUNNING)
 *   2 = Speed Attained     -> on while RUNNING and the output frequency
 *                             has reached the target (within 1% of the
 *                             maximum operation frequency band)
 *   3 = Zero Speed         -> on while powered and the motor speed is ~0
 *   4 = Drive Ready        -> on in the READY state
 *   5 = Error indication   -> on while a fault is latched
 *
 * The relay states are produced HERE (the engine), not faked in the UI:
 * the PLC simulator reads them from the runtime state.
 */
export interface RelayContext {
  readonly state: State;
  readonly outputFrequencyHz: number;
  readonly targetFrequencyHz: number;
  readonly maxFrequencyHz: number;
  readonly actualSpeedRPM: number;
  readonly activeFault: string | null;
  readonly powered: boolean;
}

export interface RelayStates {
  readonly relayRA: boolean;
  readonly relayRB: boolean;
  readonly relayRC: boolean;
}

export class RelayOutputProcessor {
  /**
   * Computes the three relay states for one tick.
   */
  update(registry: ParameterRegistry, ctx: RelayContext): RelayStates {
    return {
      relayRA: this.evaluate(registry.get(ParamId.relayFunctionRA), ctx),
      relayRB: this.evaluate(registry.get(ParamId.relayFunctionRB), ctx),
      relayRC: this.evaluate(registry.get(ParamId.relayFunctionRC), ctx)
    };
  }

  /**
   * Evaluates one multifunction output against the drive context.
   * Unknown option values (outside the core set) produce OFF — a safe,
   * deterministic default (see provenance for the option lists).
   */
  evaluate(functionCode: number, ctx: RelayContext): boolean {
    switch (functionCode) {
      case 0:
        return false;
      case 1:
        return (
          ctx.state === VfdVState.ACCELERATING || ctx.state === VfdVState.RUNNING
        );
      case 2:
        return (
          ctx.state === VfdVState.RUNNING &&
          Math.abs(ctx.outputFrequencyHz - ctx.targetFrequencyHz) <=
            Math.max(ctx.maxFrequencyHz * 0.01, 0.05)
        );
      case 3:
        return ctx.powered && Math.abs(ctx.actualSpeedRPM) < 1;
      case 4:
        return ctx.state === VfdVState.READY;
      case 5:
        return ctx.activeFault !== null;
      default:
        return false;
    }
  }
}

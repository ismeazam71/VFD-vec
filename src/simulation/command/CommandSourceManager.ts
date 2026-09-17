import { ParamId } from "../../devices/vfd-v/paramIds.js";
import type { ParameterRegistry } from "../../parameters/ParameterRegistry.js";
import {
  DigitalCommandEngine,
  type ResolvedTerminalCommand,
  type ConflictRule
} from "./DigitalCommandEngine.js";
import type { CommunicationCommandEngine } from "./CommunicationCommandEngine.js";
import { NO_COMM_FREQUENCY } from "./CommunicationCommandEngine.js";
import type { DigitalInputSignal } from "../io/DigitalInputProcessor.js";

/**
 * Command source manager: selects and resolves the OPERATION command
 * (run/stop + direction) and the FREQUENCY command according to:
 *
 *   00-21 Source of operation command
 *     0 = RS-485 (communication)
 *     1 = External terminals (FWD/REV, per 02-00)
 *     2 = Digital keypad (virtual keypad)
 *
 *   00-20 Source of frequency command
 *     0 = RS-485 (communication setpoint)
 *     1 = External terminal (AVI analog, through 03-xx scaling)
 *     2 = Digital keypad (virtual keypad setpoint)
 *
 * Level sources (RS-485, keypad) behave like 2-wire FWD/REV levels:
 * the source signal IS the command each tick. Only external terminals
 * in mode 2 use latching (DigitalCommandEngine).
 */
export interface ResolvedCommands {
  readonly runCommand: boolean;
  readonly direction: 1 | -1 | 0;
  /** Raw frequency command from the active source, Hz (pre-limiting). */
  readonly frequencyCommand: number;
}

export class CommandSourceManager {
  private readonly terminalEngine: DigitalCommandEngine;
  private readonly commEngine: CommunicationCommandEngine;

  constructor(commEngine: CommunicationCommandEngine, conflictRule?: ConflictRule) {
    this.terminalEngine = new DigitalCommandEngine(conflictRule);
    this.commEngine = commEngine;
  }

  /** Exposes the terminal engine (the engine calls it every tick). */
  get terminals(): DigitalCommandEngine {
    return this.terminalEngine;
  }

  /**
   * Resolves commands for one tick.
   *
   * @param registry        parameters (00-20, 00-21, 02-00, 00-23)
   * @param signal          digital inputs for this tick
   * @param powered         mains power present
   * @param aviFrequencyHz  AVI-scaled frequency command (Hz) — computed
   *                        by the engine through the AnalogCommandEngine
   *                        so the 03-xx scaling is evaluated once/tick
   */
  /** Clears mode-2 terminal latches (engine calls on power loss). */
  clearLatches(): void {
    this.terminalEngine.clearLatches();
  }

  update(
    registry: ParameterRegistry,
    signal: DigitalInputSignal,
    powered: boolean,
    aviFrequencyHz: number
  ): ResolvedCommands {
    const operationSource = registry.get(ParamId.operationCommandSource);
    const frequencySource = registry.get(ParamId.frequencyCommandSource);
    const terminalMode = registry.get(ParamId.externalTerminalControlMode);
    const reverseEnabled = registry.get(ParamId.reverseOperation) === 1;

    // --- Operation command ------------------------------------------------
    let runCommand: boolean;
    let direction: 1 | -1 | 0;

    const terminal: ResolvedTerminalCommand = this.terminalEngine.update(
      signal,
      terminalMode,
      reverseEnabled,
      powered
    );

    if (operationSource === 1) {
      runCommand = terminal.runCommand;
      direction = terminal.direction;
    } else if (operationSource === 2) {
      // Virtual keypad: level signals, same semantics as 2-wire FWD/REV.
      const fwd = signal.keypadForward;
      const rev = reverseEnabled ? signal.keypadReverse : false;
      if (fwd && rev) {
        // Conflict rule applies to the keypad as well (deterministic).
        runCommand = true;
        direction = 1;
      } else if (fwd) {
        runCommand = true;
        direction = 1;
      } else if (rev) {
        runCommand = true;
        direction = -1;
      } else {
        runCommand = false;
        direction = 0;
      }
    } else if (operationSource === 0) {
      // RS-485: level signals from the communication bus.
      const comm = this.commEngine.state;
      const fwd = comm.forward;
      const rev = reverseEnabled ? comm.reverse : false;
      if (fwd && rev) {
        runCommand = true;
        direction = 1;
      } else if (fwd) {
        runCommand = true;
        direction = 1;
      } else if (rev) {
        runCommand = true;
        direction = -1;
      } else {
        runCommand = false;
        direction = 0;
      }
    } else {
      throw new Error(
        `CommandSourceManager: unsupported operation command source ${operationSource} (00-21)`
      );
    }

    // --- Frequency command --------------------------------------------------
    let frequencyCommand = 0;
    if (frequencySource === 1) {
      // External terminal: the AVI analog input (scaled by 03-xx).
      frequencyCommand = aviFrequencyHz;
    } else if (frequencySource === 2) {
      frequencyCommand = signal.keypadFrequency;
    } else if (frequencySource === 0) {
      const comm = this.commEngine.state;
      frequencyCommand =
        comm.frequencySetpointHz === NO_COMM_FREQUENCY ? 0 : comm.frequencySetpointHz;
    } else {
      throw new Error(
        `CommandSourceManager: unsupported frequency command source ${frequencySource} (00-20)`
      );
    }

    return { runCommand, direction, frequencyCommand };
  }
}

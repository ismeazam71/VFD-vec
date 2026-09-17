/**
 * Communication command engine: holds the operation/frequency command
 * state delivered by the RS-485 interface (Modbus master commands).
 *
 * The protocol stack lives in `VfdRs485Interface`; this engine is the
 * engine-side holder that the CommandSourceManager reads when 00-20 /
 * 00-21 select the RS-485 source. Keeping the holder separate keeps
 * RS-485 parsing decoupled from the motor model.
 */
export interface CommunicationCommandState {
  readonly forward: boolean;
  readonly reverse: boolean;
  /** Frequency setpoint, Hz (NaN = not set by communication). */
  readonly frequencySetpointHz: number;
}

export const NO_COMM_FREQUENCY: number = NaN;

export class CommunicationCommandEngine {
  private forward = false;
  private reverse = false;
  private frequencySetpointHz: number = NO_COMM_FREQUENCY;

  /** Applies a command received on the RS-485 bus (from the interface). */
  applyCommand(command: {
    forward?: boolean;
    reverse?: boolean;
    frequencySetpointHz?: number;
  }): void {
    if (command.forward !== undefined) this.forward = command.forward;
    if (command.reverse !== undefined) this.reverse = command.reverse;
    if (command.frequencySetpointHz !== undefined) {
      this.frequencySetpointHz = command.frequencySetpointHz;
    }
  }

  /** Current communication command state (level signals). */
  get state(): CommunicationCommandState {
    return {
      forward: this.forward,
      reverse: this.reverse,
      frequencySetpointHz: this.frequencySetpointHz
    };
  }

  /** Clears all communication commands (power cycle). */
  clear(): void {
    this.forward = false;
    this.reverse = false;
    this.frequencySetpointHz = NO_COMM_FREQUENCY;
  }
}

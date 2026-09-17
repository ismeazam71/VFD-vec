import { ParamId } from "../../devices/vfd-v/paramIds.js";
import type { ParameterRegistry } from "../../parameters/ParameterRegistry.js";
import type { ParameterWriteResult } from "../../parameters/results.js";
import type { CommunicationCommandEngine } from "../command/CommunicationCommandEngine.js";

/**
 * RS-485 interface (core specification §24).
 *
 * A clean, in-memory abstraction of the drive's two-wire RS-485 (Modbus)
 * port. The protocol layer is ISOLATED from the motor model: this class
 * only moves parameter values, monitor values, and command words
 * between the (virtual) master and the engine.
 *
 * Configuration (parameters):
 *   09-00 Communication address
 *   09-01 Transmission speed (baud)
 *
 * API (per specification §24):
 *   readParameter(address, parameterId)
 *   writeParameter(address, parameterId, value)
 *   readMonitor(address, monitorId)
 *   writeCommand(address, command)
 *
 * SOURCE GAP: the physical VFD-V Modbus register map (register
 * addresses for monitors) is not established by the available source
 * material; the monitor map below is a documented simulator
 * convention (stable ids, see VfdMonitorValues.MONITOR_IDS).
 */

export interface Rs485Command {
  /** Forward run command (level). */
  readonly forward?: boolean;
  /** Reverse run command (level). */
  readonly reverse?: boolean;
  /** Frequency setpoint, Hz (applied when 00-20 selects RS-485). */
  readonly frequencySetpointHz?: number;
}

export type Rs485ReadResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: string };

/** Baud rates for the 09-01 enum values. */
const BAUD_RATES = [9600, 19200, 38400, 57600, 115200] as const;

/** Monitor value provider (set by the engine each tick). */
export type MonitorProvider = (monitorId: number) => number;

export class VfdRs485Interface {
  private readonly registry: ParameterRegistry;
  private readonly commands: CommunicationCommandEngine;
  private monitorProvider: MonitorProvider | null = null;

  constructor(registry: ParameterRegistry, commands: CommunicationCommandEngine) {
    this.registry = registry;
    this.commands = commands;
  }

  /** Configured station address (09-00). */
  getAddress(): number {
    return this.registry.get(ParamId.communicationAddress);
  }

  /** Configured baud rate (09-01). */
  getBaudRate(): number {
    const code = this.registry.get(ParamId.transmissionSpeed);
    return BAUD_RATES[code] ?? BAUD_RATES[0]!;
  }

  /** Binds the per-tick monitor provider (engine integration). */
  setMonitorProvider(provider: MonitorProvider): void {
    this.monitorProvider = provider;
  }

  private addressMatches(address: number): boolean {
    if (!Number.isInteger(address) || address < 1 || address > 247) {
      return false;
    }
    return address === this.getAddress();
  }

  /** Reads a parameter from the drive (Modbus read). */
  readParameter(address: number, parameterId: string): Rs485ReadResult<number> {
    if (!this.addressMatches(address)) {
      return { ok: false, reason: `address mismatch: drive is 09-00=${this.getAddress()}` };
    }
    const def = this.registry.getDefinition(parameterId);
    if (def === undefined) {
      return { ok: false, reason: `unknown parameter "${parameterId}"` };
    }
    return { ok: true, value: this.registry.get(parameterId) };
  }

  /**
   * Writes a parameter to the drive (Modbus write). Goes through the
   * full registry validation (read-only parameters are rejected).
   */
  writeParameter(address: number, parameterId: string, value: number): ParameterWriteResult {
    if (!this.addressMatches(address)) {
      return { ok: false, reason: `address mismatch: drive is 09-00=${this.getAddress()}` };
    }
    return this.registry.set(parameterId, value);
  }

  /** Reads a monitor value (output frequency, current, fault code, ...). */
  readMonitor(address: number, monitorId: number): Rs485ReadResult<number> {
    if (!this.addressMatches(address)) {
      return { ok: false, reason: `address mismatch: drive is 09-00=${this.getAddress()}` };
    }
    if (this.monitorProvider === null) {
      return { ok: false, reason: "monitor provider not bound" };
    }
    const value = this.monitorProvider(monitorId);
    if (!Number.isFinite(value)) {
      return { ok: false, reason: `unknown monitor id ${monitorId}` };
    }
    return { ok: true, value };
  }

  /**
   * Applies a command word from the master (run/stop, setpoint).
   * Only accepted from the configured address.
   */
  writeCommand(address: number, command: Rs485Command): ParameterWriteResult {
    if (!this.addressMatches(address)) {
      return { ok: false, reason: `address mismatch: drive is 09-00=${this.getAddress()}` };
    }
    this.commands.applyCommand(command);
    return { ok: true };
  }
}

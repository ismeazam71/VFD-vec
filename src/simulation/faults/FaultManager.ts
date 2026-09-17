import type { FaultRecord } from "./FaultHistory.js";
import { FaultHistory } from "./FaultHistory.js";
import { FaultSeverity, getFaultCode } from "./FaultCodes.js";

/**
 * Central fault manager for one drive instance.
 *
 * Responsibilities:
 *   - latch the active hard fault
 *   - maintain the four-slot fault history (06-17..06-20)
 *   - track acknowledgement
 *
 * Fault *detection* lives in the protection modules; this class only
 * manages the fault lifecycle:
 *
 *   raiseFault()      — latch a fault, record it in the history
 *   clearFault()      — clear the active fault (history is preserved)
 *   acknowledgeFault()— acknowledge the active fault for UI/reporting
 *   getActiveFault()  — currently latched fault, if any
 *   getFaultHistory() — the four most recent records, newest first
 *
 * While a hard fault is latched the drive output is disabled by the
 * engine; no further faults can be raised until the fault is cleared.
 *
 * This class never decides on its own whether a fault may be cleared —
 * the engine applies the configured reset behavior (command reset vs.
 * power-cycle reset) before calling `clearFault()`.
 */
export class FaultManager {
  private readonly history = new FaultHistory();
  private active: FaultRecord | null = null;
  private acknowledgedFlag = false;

  /**
   * Raises a fault.
   *
   * @param code           Fault code from the fault table (e.g. "ocA").
   * @param simulationTime Engine simulated clock, seconds.
   * @returns the recorded fault.
   *
   * If a hard fault is already latched, the new fault is ignored — the
   * first fault wins and stays latched (deterministic, matches real
   * drive behavior where a stopped drive cannot accumulate new faults).
   */
  raiseFault(code: string, simulationTime: number): FaultRecord {
    const def = getFaultCode(code);
    if (this.active !== null) {
      return this.active;
    }
    const record: FaultRecord = {
      code: def.code,
      description: def.description,
      simulationTime
    };
    this.active = record;
    this.acknowledgedFlag = false;
    this.history.push(record);
    return record;
  }

  /**
   * Clears the active fault (does NOT touch the history).
   *
   * Called by the engine only when the configured reset behavior
   * permits (command reset or power cycle). Returns true if a fault was
   * actually cleared.
   */
  clearFault(): boolean {
    if (this.active === null) return false;
    this.active = null;
    this.acknowledgedFlag = false;
    return true;
  }

  /** Acknowledges the active fault (UI: user saw it). */
  acknowledgeFault(): void {
    if (this.active !== null) {
      this.acknowledgedFlag = true;
    }
  }

  /** Currently latched fault, or null. */
  getActiveFault(): FaultRecord | null {
    return this.active;
  }

  /** Whether the active fault has been acknowledged. */
  get acknowledged(): boolean {
    return this.acknowledgedFlag;
  }

  /** The four most recent fault records, newest first (nulls for empty slots). */
  getFaultHistory(): readonly (FaultRecord | null)[] {
    return this.history.readonlySlots();
  }

  /** Fault codes, newest first, empty slots skipped. */
  getFaultCodes(): string[] {
    return this.history.codes();
  }

  /** Clears the history (factory reset only). */
  resetHistory(): void {
    this.history.clear();
  }

  /** Convenience: whether a hard fault (not just a soft warning) is latched. */
  hasHardFault(): boolean {
    return this.active !== null;
  }

  /** Severity of a fault code (for UI display). */
  static severityOf(code: string): FaultSeverity {
    return getFaultCode(code).severity;
  }
}

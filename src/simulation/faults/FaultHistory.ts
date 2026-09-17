/**
 * One recorded fault event.
 */
export interface FaultRecord {
  /** Fault code (e.g. "ocA"). */
  readonly code: string;
  readonly description: string;
  /**
   * Simulation time (seconds) when the fault was raised.
   * Deterministic: derived from the engine's simulated clock, never from
   * wall-clock time.
   */
  readonly simulationTime: number;
}

/**
 * Rotating fault history holding the four most recent fault records.
 *
 * Slot mapping (newest first), as exposed by the drive's monitor values:
 *   slot 0 -> 06-17 (newest)
 *   slot 1 -> 06-18
 *   slot 2 -> 06-19
 *   slot 3 -> 06-20 (oldest)
 *
 * Pushing a new record shifts older records toward the end; the oldest
 * record beyond the four slots is dropped. This is the ONLY place the
 * rotation logic lives, so the history can never be overwritten out of
 * order.
 */
export class FaultHistory {
  static readonly SLOT_COUNT = 4;

  /** Slot addresses matching the monitor parameter order. */
  static readonly SLOT_ADDRESSES = ["06-17", "06-18", "06-19", "06-20"] as const;

  private readonly slots: Array<FaultRecord | null> = new Array(FaultHistory.SLOT_COUNT).fill(null);

  /** Records the newest fault and shifts older records down. */
  push(record: FaultRecord): void {
    for (let i = FaultHistory.SLOT_COUNT - 1; i > 0; i--) {
      this.slots[i] = this.slots[i - 1] ?? null;
    }
    this.slots[0] = record;
  }

  /** Slot contents, newest first. Nulls mark empty (older) slots. */
  readonlySlots(): readonly (FaultRecord | null)[] {
    return [...this.slots];
  }

  /** Codes only, newest first, empty slots skipped. */
  codes(): string[] {
    return this.slots.filter((r): r is FaultRecord => r !== null).map((r) => r.code);
  }

  /** Number of records currently held. */
  get size(): number {
    return this.slots.filter((r) => r !== null).length;
  }

  /** Clears all slots (e.g. on factory reset of the history). */
  clear(): void {
    for (let i = 0; i < FaultHistory.SLOT_COUNT; i++) {
      this.slots[i] = null;
    }
  }
}

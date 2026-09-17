import { FaultCodes } from "../../devices/vfd-v/faultCodes.js";

/**
 * External fault protection.
 *
 * The runtime model exposes an external-fault input (driven by the PLC
 * simulator or UI — e.g. an external safety circuit). While the input
 * is asserted, the PF fault is raised (edge-triggered: the fault
 * latches on the rising edge; the input must be de-asserted AND the
 * fault reset before the drive can run again).
 */
export class ExternalFaultProtection {
  private prevInput = false;

  /**
   * Evaluates the protection for one tick.
   *
   * @param externalFault  the external fault input for this tick
   * @param faultActive    whether a PF fault is already latched
   * @returns the fault code to raise, or null
   */
  update(externalFault: boolean, faultActive: boolean): string | null {
    const rising = externalFault && !this.prevInput;
    this.prevInput = externalFault;
    if (rising && !faultActive) {
      return FaultCodes.EXTERNAL_FAULT.code;
    }
    return null;
  }

  /** Resets the edge state (power cycle). */
  reset(): void {
    this.prevInput = false;
  }
}

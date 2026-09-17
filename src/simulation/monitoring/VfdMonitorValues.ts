import type { VfdVRuntimeState } from "../state/VfdRuntimeState.js";
import { encodeFaultRecord } from "../../devices/vfd-v/faultRecordValues.js";
import { VfdVState } from "../state/VfdVState.js";

/**
 * Runtime monitoring values (core specification: "Runtime monitoring
 * values" and the RS-485 readMonitor API).
 *
 * Monitor IDs are a documented simulator convention (see the RS-485
 * source-gap note). Values are scaled integers where a physical drive
 * would report scaled values (frequency x10, current x10).
 */
export const MONITOR_IDS = {
  OUTPUT_FREQUENCY_HZ_X10: 1,
  ACTUAL_SPEED_RPM: 2,
  OUTPUT_CURRENT_A_X10: 3,
  OUTPUT_VOLTAGE_V: 4,
  DC_BUS_VOLTAGE_V: 5,
  LOAD_PERCENT: 6,
  TORQUE_PERCENT: 7,
  MOTOR_TEMPERATURE_C: 8,
  ACTIVE_FAULT_CODE: 9,
  RELAY_RA: 10,
  RELAY_RB: 11,
  RELAY_RC: 12,
  DRIVE_STATE: 13,
  THERMAL_HEAT_PERCENT: 14
} as const;

export type MonitorId = (typeof MONITOR_IDS)[keyof typeof MONITOR_IDS];

const STATE_VALUES: Readonly<Record<VfdVState, number>> = {
  [VfdVState.POWER_OFF]: 0,
  [VfdVState.READY]: 1,
  [VfdVState.ACCELERATING]: 2,
  [VfdVState.RUNNING]: 3,
  [VfdVState.DECELERATING]: 4,
  [VfdVState.COASTING]: 5,
  [VfdVState.DC_BRAKING]: 6,
  [VfdVState.FAULT]: 7
};

export class VfdMonitorValues {
  private state: VfdVRuntimeState | null = null;
  private thermalHeatPercent = 0;

  /** Updates the monitored snapshot (engine calls once per tick). */
  publish(state: VfdVRuntimeState, thermalHeatPercent: number): void {
    this.state = state;
    this.thermalHeatPercent = thermalHeatPercent;
  }

  /** Latest snapshot, or null before the first tick. */
  get latest(): VfdVRuntimeState | null {
    return this.state;
  }

  /**
   * Monitor value provider for the RS-485 interface.
   * Unknown ids return NaN (the interface reports the error).
   */
  readonly provider = (monitorId: number): number => {
    const s = this.state;
    if (s === null) return NaN;
    switch (monitorId) {
      case MONITOR_IDS.OUTPUT_FREQUENCY_HZ_X10:
        return Math.round(s.outputFrequency * 10);
      case MONITOR_IDS.ACTUAL_SPEED_RPM:
        return Math.round(s.actualSpeedRPM);
      case MONITOR_IDS.OUTPUT_CURRENT_A_X10:
        return Math.round(s.outputCurrent * 10);
      case MONITOR_IDS.OUTPUT_VOLTAGE_V:
        return Math.round(s.outputVoltage);
      case MONITOR_IDS.DC_BUS_VOLTAGE_V:
        return Math.round(s.dcBusVoltage);
      case MONITOR_IDS.LOAD_PERCENT:
        return Math.round(s.loadPercent);
      case MONITOR_IDS.TORQUE_PERCENT:
        return Math.round(s.torquePercent);
      case MONITOR_IDS.MOTOR_TEMPERATURE_C:
        return Math.round(s.motorTemperature);
      case MONITOR_IDS.ACTIVE_FAULT_CODE:
        return encodeFaultRecord(s.activeFault);
      case MONITOR_IDS.RELAY_RA:
        return s.relayRA ? 1 : 0;
      case MONITOR_IDS.RELAY_RB:
        return s.relayRB ? 1 : 0;
      case MONITOR_IDS.RELAY_RC:
        return s.relayRC ? 1 : 0;
      case MONITOR_IDS.DRIVE_STATE:
        return STATE_VALUES[s.state];
      case MONITOR_IDS.THERMAL_HEAT_PERCENT:
        return Math.round(this.thermalHeatPercent);
      default:
        return NaN;
    }
  };
}

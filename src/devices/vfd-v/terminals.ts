import { TerminalType, type TerminalDefinition } from "../../terminals/types.js";

/**
 * VFD-V core hardware profile: the ONLY terminals exposed on the
 * simulated front panel.
 *
 * Deliberately excluded (future capability modules): MI1-MI6, ACI, AUI,
 * AFM, MO1-MO3, MCM, DFM, MRA/MRC, PG encoder terminals.
 *
 * Terminal list per the core specification:
 *   MAIN INPUT:    R/L1, S/L2, T/L3, E
 *   MOTOR OUTPUT:  U/T1, V/T2, W/T3, E
 *   CONTROL:       +24V, DCM, FWD, REV
 *   ANALOG:        +10V, AVI, ACM
 *   RELAY:         RA, RB, RC
 *   COMMUNICATION: RS-485
 */
export const VFD_V_CORE_TERMINALS: readonly TerminalDefinition[] = [
  // --- Main power input -------------------------------------------------
  {
    id: "R/L1",
    label: "R/L1",
    type: TerminalType.POWER_INPUT,
    direction: "input",
    electricalRole: "Three-phase main power input, phase R (L1)",
    runtimeMapping: "phaseR"
  },
  {
    id: "S/L2",
    label: "S/L2",
    type: TerminalType.POWER_INPUT,
    direction: "input",
    electricalRole: "Three-phase main power input, phase S (L2)",
    runtimeMapping: "phaseS"
  },
  {
    id: "T/L3",
    label: "T/L3",
    type: TerminalType.POWER_INPUT,
    direction: "input",
    electricalRole: "Three-phase main power input, phase T (L3)",
    runtimeMapping: "phaseT"
  },
  {
    id: "E",
    label: "E",
    type: TerminalType.GROUND,
    direction: "power",
    electricalRole: "Protective earth (shared by main input and motor output)",
    runtimeMapping: "ground"
  },

  // --- Motor output ------------------------------------------------------
  {
    id: "U/T1",
    label: "U/T1",
    type: TerminalType.POWER_OUTPUT,
    direction: "output",
    electricalRole: "Inverter output phase U (T1) to motor",
    runtimeMapping: "outputEnabled"
  },
  {
    id: "V/T2",
    label: "V/T2",
    type: TerminalType.POWER_OUTPUT,
    direction: "output",
    electricalRole: "Inverter output phase V (T2) to motor",
    runtimeMapping: "outputEnabled"
  },
  {
    id: "W/T3",
    label: "W/T3",
    type: TerminalType.POWER_OUTPUT,
    direction: "output",
    electricalRole: "Inverter output phase W (T3) to motor",
    runtimeMapping: "outputEnabled"
  },

  // --- Control circuit ----------------------------------------------------
  {
    id: "+24V",
    label: "+24V",
    type: TerminalType.CONTROL_SUPPLY,
    direction: "power",
    electricalRole: "24V DC control power supply",
    runtimeMapping: "supply24v"
  },
  {
    id: "DCM",
    label: "DCM",
    type: TerminalType.DIGITAL_COMMON,
    direction: "power",
    electricalRole: "Digital input common (reference for FWD/REV)",
    runtimeMapping: "supply24v"
  },
  {
    id: "FWD",
    label: "FWD",
    type: TerminalType.DIGITAL_INPUT,
    direction: "input",
    electricalRole: "Forward command digital input (24V to DCM)",
    runtimeMapping: "forwardCommand"
  },
  {
    id: "REV",
    label: "REV",
    type: TerminalType.DIGITAL_INPUT,
    direction: "input",
    electricalRole: "Reverse command digital input (24V to DCM)",
    runtimeMapping: "reverseCommand"
  },

  // --- Analog -------------------------------------------------------------
  {
    id: "+10V",
    label: "+10V",
    type: TerminalType.ANALOG_SUPPLY,
    direction: "power",
    electricalRole: "10V DC analog supply",
    runtimeMapping: "supply10v"
  },
  {
    id: "AVI",
    label: "AVI",
    type: TerminalType.ANALOG_INPUT,
    direction: "input",
    electricalRole: "0-10V analog frequency input (referenced to ACM)",
    runtimeMapping: "aviVoltage"
  },
  {
    id: "ACM",
    label: "ACM",
    type: TerminalType.ANALOG_COMMON,
    direction: "power",
    electricalRole: "Analog input common (reference for AVI)",
    runtimeMapping: "supply10v"
  },

  // --- Relays --------------------------------------------------------------
  {
    id: "RA",
    label: "RA",
    type: TerminalType.DIGITAL_OUTPUT,
    direction: "output",
    electricalRole: "Multifunction relay output A (function 02-11)",
    runtimeMapping: "relayRA"
  },
  {
    id: "RB",
    label: "RB",
    type: TerminalType.DIGITAL_OUTPUT,
    direction: "output",
    electricalRole: "Multifunction relay output B",
    runtimeMapping: "relayRB"
  },
  {
    id: "RC",
    label: "RC",
    type: TerminalType.DIGITAL_OUTPUT,
    direction: "output",
    electricalRole: "Multifunction relay output C",
    runtimeMapping: "relayRC"
  },

  // --- Communication ---------------------------------------------------------
  {
    id: "RS-485",
    label: "RS-485",
    type: TerminalType.COMMUNICATION,
    direction: "bidirectional",
    electricalRole: "Two-wire RS-485 serial port (Modbus)",
    runtimeMapping: "rs485"
  }
];

/**
 * Lookup helper: terminal definition by id.
 *
 * @throws Error when the terminal id is not part of the core profile —
 *         catching UI/PLC references to terminals that do not exist on
 *         this hardware profile.
 */
export function getVfdVTerminal(id: string): TerminalDefinition {
  const terminal = VFD_V_CORE_TERMINALS.find((t) => t.id === id);
  if (terminal === undefined) {
    throw new Error(`Unknown VFD-V core terminal "${id}"`);
  }
  return terminal;
}

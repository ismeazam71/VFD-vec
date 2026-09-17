# VFD-vec

**PLC Simulator with a modular VFD/drive engine — Delta VFD-V runtime
simulation (core).**

This repository implements the drive core of a PLC simulator: a
deterministic, headless TypeScript runtime engine that simulates a
**Delta VFD-V 10HP (7.5 kW) variable-frequency drive** and its motor
load, so PLC logic can be tested against realistic drive behavior.

- **Stack:** pure TypeScript (strict) + Vitest. No React, no DOM, no
  timers — the engine is fully headless and framework-independent.
- **Deterministic:** same initial state + parameters + inputs + dt
  sequence ⇒ bit-identical results. Variable `dt` (0.001–0.100 s) is
  supported and numerically stable.
- **Source-protocol compliant:** official Delta parameter numbers and
  terminology are preserved; no undocumented Delta behavior is
  invented; every assumption and source gap is documented
  ([`docs/PROVENANCE.md`](docs/PROVENANCE.md)).

## Architecture

```
src/
├── index.ts                     # public API (single entry point)
├── parameters/                  # generic parameter layer (drive-agnostic)
│   ├── ParameterRegistry.ts     #   typed registry: load/set/get/validate
│   ├── types.ts                 #   ParameterDefinition / datatypes / access
│   └── validate.ts              #   range/step validation, provenance checks
└── simulation/
    ├── VfdVRuntimeEngine.ts     # THE ENGINE: update(dt, inputs) → state
    ├── modelConstants.ts        # physics constants (overridable config)
    ├── command/                 # operation/frequency command sources
    │   ├── CommandSourceManager.ts   # 00-20/00-21 source selection
    │   ├── DigitalCommandEngine.ts   # FWD/REV, 02-00 modes (0 & 2)
    │   ├── AnalogCommandEngine.ts    # AVI 0-10 V → Hz (03-00/03-03/03-06/03-09)
    │   └── CommunicationCommandEngine.ts  # RS-485 command source
    ├── frequency/               # limits pipeline + accel/decel ramps
    │   ├── FrequencyCommandEngine.ts     # 01-00/01-09/01-10/01-11 limits
    │   ├── AccelerationController.ts     # 01-12 (multi-pattern aware)
    │   └── DecelerationController.ts     # 01-13 + OV stall-prevention scale
    ├── voltage/
    │   ├── VFController.ts      # piecewise V/F (01-00..01-08), 05-03 boost
    │   └── DcBusModel.ts        # 1.35×V×phaseFactor, regen, bleed, phase loss
    ├── motor/
    │   ├── TorqueModel.ts       # slip characteristic, breakdown clamp
    │   ├── SpeedModel.ts        # J·dω/dt with substepping + stiction
    │   ├── CurrentModel.ts      # torque→current
    │   └── MotorModel.ts        # façade composing the three
    ├── io/                      # digital/analog input processors, relays (02-11..13)
    ├── protection/              # OC (ocA/ocd/ocn), OV, Lv, phase loss (06-02),
    │   ...                      #   oL2, I²t thermal (OL2), external fault
    ├── communication/           # RS-485 abstraction (09-00/09-01)
    ├── monitoring/              # monitored values (RS-485 monitor readout)
    ├── faults/                  # fault manager + 4-slot history (06-17..20)
    └── state/                   # state machine, runtime state, inputs
src/devices/vfd-v/               # the VFD-V drive plugin
├── VfdVDriveProfile.ts          # DriveProfile (plugin entry point)
├── schema/                      # 85-parameter core schema + provenance
├── paramIds.ts                  # central ParamId binding layer
├── terminals.ts                 # the 18-terminal profile (exactly as listed)
├── faultCodes.ts                # Delta fault codes (ocA, ocd, ocn, OV, Lv, …)
└── faultRecordValues.ts         # fault-code numeric encoding convention
```

**Drive-agnostic core:** the parameter layer, state machine, and
simulation modules are generic; a drive model plugs in through a
`DriveProfile` (see `VfdVDriveProfile`). Other drive models can register
their own profiles without touching the core. The terminal profile
contains **exactly** the 18 listed terminals — no extra physical
terminals are modeled (parameter definitions for MIx/MOx etc. exist in
the schema but are not terminals).

## Quick start

```ts
import { VfdVDriveProfile } from "vfd-vec";

// 1) Load the drive profile (schema + registry + engine factory).
const profile = VfdVDriveProfile;
const engine = profile.createEngine();

// 2) (Optional) configure parameters / model / load.
engine.parameters.set("01-12", 10);          // 10 s acceleration
engine.setLoadPercent(50);                    // 50 % of rated torque

// 3) Step the simulation with variable dt.
const state = engine.update(0.01, {
  phaseR: true, phaseS: true, phaseT: true,   // mains power
  forwardCommand: true,                       // FWD terminal (mode 2: press)
  keypadFrequency: 60                         // keypad setpoint (00-20 = 2)
});

console.log(state.state);              // "ACCELERATING" … "RUNNING"
console.log(state.outputFrequency);    // Hz
console.log(state.actualSpeedRPM);
console.log(state.dcBusVoltage);
console.log(state.activeFault);        // null | "ocA" | "OV" | "Lv" | …

// 4) Faults: history, reset, monitor.
engine.getFaultManager().getFaultCodes();
engine.resetFault();
engine.getMonitor().latest;

// 5) RS-485 abstraction (09-00 address / 09-01 baud).
engine.rs485.readParameter(1, "01-00");
engine.rs485.writeParameter(1, "01-12", 5);
engine.rs485.writeCommand(1, { forward: true, frequencySetpointHz: 30 });
```

The engine's per-tick update order follows the core specification's 16
steps (documented in `VfdVRuntimeEngine.ts`): inputs → power
transitions → commands → frequency limits → ramps → V/F → torque →
speed → current → bus → thermal → protections → faults → relays →
publish.

## Terminal profile (exactly these 18)

`R/L1, S/L2, T/L3, E, U/T1, V/T2, W/T3, +24V, DCM, FWD, REV, +10V,
AVI, ACM, RA, RB, RC, RS-485`

No MI1–MI6, ACI, AUI, AFM, MO1–MO3, MCM, DFM, MRA/MRC terminals — the
specification requires exactly the listed set (their *parameter*
definitions remain in the schema).

## Tests

`npm test` (Vitest). The engine test suite
(`tests/vfd-v/VfdVEngine.test.ts`) covers the specification's test
matrix A–Q:

| # | Scenario | Coverage |
|---|---|---|
| A | Power on | POWER_OFF → READY, bus charge, quiescent values |
| B | Forward run | FWD latch (mode 2), ramp to keypad setpoint, RUNNING |
| C | Reverse run | REV latch, negative speed/slip |
| D | AVI control | 0 V→0 Hz, 5 V→mid, 10 V→max; bias (03-03) & gain (03-09) clamping |
| E | Acceleration | 01-12 ramp rate (10 s and 2 s) |
| F | Deceleration | 01-13 ramp rate to zero, then READY |
| G | Ramp stop | gradual (no jump) stop, 00-22 = 0 |
| H | Coast stop | inverter off immediately, motor coasts down, 00-22 = 1 |
| I | Reverse disabled | 00-23 = 0: REV = stop only, FWD unaffected |
| J | Overcurrent | ocA (acceleration) + ocn (constant speed, load rise) |
| K | Overvoltage | regenerative decel → bus → OV trip (06-01) |
| L | Low voltage / phase loss | Lv (06-00) + 06-02 responses 1/2/3 |
| M | Over-torque | oL2 (06-06/06-07/06-08) incl. "no fault under threshold" |
| N | I²t thermal | OL2 after sustained overload; short spike does not trip |
| O | Fault history | 4-slot rotation across power cycles, 06-17..06-20 encoding |
| P | Relays | RA/RB/RC functions (running/ready/error/speed-attained) |
| Q | RS-485 | address/baud, parameter read/write guards, command source, monitors |

plus determinism (bit-identical reruns) and dt-invariance of the
frequency pipeline. Unit suites cover the parameter registry, state
machine, fault manager, and terminal model.

## Scripts

| Command | Purpose |
|---|---|
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint` | ESLint |
| `npm test` | Vitest (all suites) |
| `npm run check` | typecheck + lint + test |
| `npm run build` | emit `dist/` |

## Documentation

- [`docs/PROVENANCE.md`](docs/PROVENANCE.md) — provenance of every
  parameter and model constant, documented simplifications, and the
  explicit source-gap list.
- `src/devices/vfd-v/schema/provenance.ts` — machine-readable
  per-parameter provenance (enforced by `assertSchemaProvenanceComplete`).
- Module docstrings carry the per-behavior specification references
  (e.g. "core specification §26").

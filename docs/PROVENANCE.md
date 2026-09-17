# VFD-V Runtime Simulation — Provenance & Source Gaps

This document records **where every value and behavior in the simulation
comes from**, what is a documented engineering assumption, and what is a
genuine source gap. It is the companion to the machine-readable schema
provenance in [`src/devices/vfd-v/schema/provenance.ts`](../src/devices/vfd-v/schema/provenance.ts)
(one entry per parameter address; that file is the source of truth for
parameter-level status).

## 1. Source material and reconstruction context

The authoritative sources for the real drive are:

- the Delta **VFD-V user manual** (hardware source of truth for parameter
  numbers, names, options and fault codes), and
- the **VFD-V EVC parameter file** (85-parameter core schema).

Neither file was available in the workspace. Per the project's source
protocol, the schema and engine were reconstructed from the VFD-V
technical information available in the project conversation:

- **Official Delta parameter numbers and terminology are preserved and
  never renamed.**
- **No parameter value was invented.** Where a value could not be
  established it is `null` in the schema (status `gap`) and listed in
  §5 below.
- Values used for the **10HP (7.5 kW) reference configuration** are
  model-dependent (status `reference`) and **must be re-set per actual
  drive/motor** before production use. They are exposed through the
  typed parameter registry and the model-config object — never
  hard-coded in logic.
- Anything labeled **"standard"** is consistent with the VFD-V
  reference as available in the conversation and should be diffed
  against the official EVC/manual when those become available.

## 2. Parameter provenance (summary)

The per-address table lives in
[`src/devices/vfd-v/schema/provenance.ts`](../src/devices/vfd-v/schema/provenance.ts)
(statuses: `standard`, `reference`, `gap`). Highlights:

| Address | Item | Status | Note |
|---|---|---|---|
| 00-00 | drive selection | gap | other options not established |
| 00-02 | parameter reset | gap | option labels best-effort |
| 00-20 / 00-21 | frequency / operation command source | standard | RS485 / external / keypad / AVI selection |
| 00-22 | stop method (ramp/coast) | standard | |
| 00-23 | reverse operation enable | standard | |
| 01-00 / 01-01 | max frequency / max voltage | standard / reference | 60 Hz / 480 V (400 V class) |
| 01-02..01-08 | V/F curve points | **gap (null)** | engine falls back to the 2-point linear curve |
| 01-09..01-11 | min output freq / lower limit / upper limit | standard | |
| 01-12..01-19 | accel/decel times (4 patterns) | standard | core engine uses pattern 1 |
| 02-00 | external terminal control mode | standard (mode labels best-effort) | modes 0 and 2 supported; mode 1 (3-wire) rejected — no STOP terminal in the profile |
| 02-11..02-13 | RA/RB/RC relay functions | standard | |
| 03-00..03-15 | AVI scaling (bias/gain) + analog input config | standard | 4-20 mA mode not implemented |
| 05-01..05-07 | motor data | reference | 7.5 kW / 19.5 A / 4-pole reference set |
| 06-00..06-08 | protection setpoints | reference | see §5 |
| 06-13..06-15 | I²t thermal relay | reference | |
| 06-17..06-20 | fault records | convention | numeric code map in `faultRecordValues.ts` |
| 07-00..07-10 | multi-step speeds | schema only | not wired into the core engine |
| 09-00 / 09-01 | comm address / baud | standard | |

**Discrepancy note (01-07):** the core specification lists 01-07 among
frequency-limiting parameters, while the VFD-V reference treats 01-07 as
the 3rd V/F point voltage. The frequency pipeline uses 01-00/01-09/01-10/
01-11 for limiting. The discrepancy is recorded here instead of being
silently resolved.

## 3. Simulation model constants

All physics constants live in
[`src/simulation/modelConstants.ts`](../src/simulation/modelConstants.ts)
(`VfdVMotorModelConfig`, overridable at engine construction). Every value
is a **documented engineering assumption** for the 7.5 kW / 3-phase 400 V
reference configuration — none is a Delta parameter.

| Constant | Value | Rationale |
|---|---|---|
| `lineVoltageV` | 400 V | 400 V class reference (**reference** — set per drive) |
| `driveRatedCurrentA` | 19.5 A | 7.5 kW class drive rated current (**reference**) |
| `motorInertiaTimeConstantS` | 5 s | time to reach rated speed at rated torque; no EVC parameter exists (**source gap**, typical value) |
| `busCapacitanceF` | 1500 µF | typical drive DC-link capacitance (assumption) |
| `busBleedTimeConstantS` | 5 s | bus bleed resistor above nominal (assumption) |
| `motorThermalTimeConstantS` | 300 s | I²t electronic relay heating baseline (assumption) |
| `heatsinkThermalTimeConstantS` | 180 s | power-stage cooling (assumption) |
| `motorTempRiseAtFullHeatC` / `heatsinkTempRiseAtFullHeatC` | 40 / 30 °C | temperature rise at 100 % heat (assumption) |
| `ocTripDelayS` | 0.01 s | hardware OC integration delay (assumption) |
| `ovStallPreventionFraction` | 0.93 | OV stall-prevention zone (assumption) |
| `frictionTorqueFraction` | 0.02 | mechanical friction, % of rated torque (assumption) |
| `ratedSlipFraction` | 0.03 | typical 4-pole induction motor (**source gap** — no EVC parameter) |
| `vfStartingBoostPercent` | 15 % | built-in low-frequency V/F starting boost, falling linearly to 0 at max frequency (see §4.3) |
| `maxMechanicalSubstepS` | 0.05 s | internal substep for Euler stability at variable dt |

**Model-dependent values remain model-dependent:** `lineVoltageV` and
`driveRatedCurrentA` are marked REFERENCE in the constants file and must
be supplied per actual drive model before production use.

## 4. Documented behavioral simplifications

The core specification permits documented simplifications (§34). The
following behaviors are implemented, deterministic, and deliberately
simplified; each is noted where it affects test expectations.

### 4.1 Terminal control, mode 2 ("2-wire FWD/STOP + REV/STOP")

FWD and REV are **momentary start/stop buttons** (standard Delta
2-wire operation):

- press while stopped → start in that direction (latched);
- press while running → stop;
- press on the *other* terminal while running → stop (never
  auto-reverse);
- **releasing a button never stops the drive**;
- simultaneous press resolves through the configurable conflict rule
  (default: forward preferred).

Mode 0 ("2-wire FWD/REV") uses pure level commands. Mode 1 (3-wire) is
rejected at engine construction because the core terminal profile has no
STOP terminal (specification: do not add unused terminals).

The mode-2 latch clears on power loss; the drive never auto-restarts
after a power restore.

### 4.2 Inverter output deadband (01-09 / zero-target rule)

A run command with a **zero frequency target does not start the drive**,
and a setpoint that drops to zero while running **ramps the output to
zero** (the drive then returns to READY). The drive runs at ≥ 01-09 or
not at all. When 01-09 > 0, the lower bound keeps the drive running at
the minimum output frequency, matching the VFD-V minimum-output-frequency
behavior.

### 4.3 V/F curve and starting boost

With all 01-02..01-08 points `null` (source gap), the V/F controller
uses the standard 2-point linear curve (0 Hz / 0 V → 01-00 / 01-01)
plus:

- **torque compensation (05-03)** — user-settable low-frequency lift; and
- **a built-in 15 % starting boost** (`vfStartingBoostPercent`, model
  constant) falling linearly to 0 at the maximum frequency.

The boost exists because developed torque scales with V²; a purely
linear curve from 0 V produces no starting torque, so the model would be
unable to start a loaded motor. It models the drive's inherent
low-frequency voltage lift and is separate from (and additive with) 05-03.

Consequence: available torque at low frequency is small (V²), so very
fast ramps (e.g. 0.5 s to 60 Hz) exceed the motor's capability and the
speed model shows the motor lagging the field — that is the model
working as documented, not a defect.

### 4.4 Motor torque/speed/current

- Induction torque characteristic `T(s) = T_avail · 2s/(s² + 2·s_rated)`,
  clamped to the breakdown torque `1.8 × T_avail`; `T_avail =
  T_rated · (V(f)/V_rated)²` (constant-flux approximation).
- `J·dω/dt = T_dev − T_load − T_fric` with internal substepping
  (≤ 0.05 s) so variable dt (0.001–0.1 s) stays numerically stable.
- **Stiction:** a nearly-stationary rotor does not move unless the
  developed torque exceeds the static friction limit (static = kinetic
  magnitude). Without this, friction chatters the speed through zero.
- Load torque is proportional to |speed| (capped at 2×), opposing
  motion; load is settable at runtime (0–200 % of rated torque).
- Output current: `I = I_no-load + (I_rated − I_no-load)·|T_dev|/T_rated`
  (linear torque-current approximation).

### 4.5 DC bus

- Nominal bus `V = 1.35 × V_line × phaseFactor` with phaseFactor
  1.0 / √(2⁄3) / 0.5 for 3 / 2 / 1 phase(s).
- While energized the grid is a stiff source **holding the bus at the
  current phase count's base** (no load-sag modeling).
- **Phase loss:** the base drops with the phase count; while the bus sits
  above the new base the capacitor discharges at the net consumption
  rate (dominant) or the idle bleed rate, floored at the new base —
  this is what makes the Lv protection observable after a phase loss.
- Regeneration (motor braking / coasting under load) charges the bus;
  the bleed resistor discharges above base.

### 4.6 OV and Lv references

06-01 (OV) and 06-00 (Lv) thresholds are percentages of the **nominal
full 3-phase** bus (540 V in the reference configuration), not of the
degraded phase count's base. A phase loss dropping the bus below
90 % nominal is exactly what Lv is meant to detect.

### 4.7 Direction persistence during ramp deceleration

While the inverter output stage is enabled the field keeps rotating in
the driven direction — including during a ramp deceleration, when the
run command (and thus the commanded direction) is already gone. The
engine persists the last driven direction so the slip reference and
regenerative braking remain intact (a coast stop disables the output
immediately and loses the field, as intended).

### 4.8 Faults

- Faults apply **immediately on the faulting tick**: output/voltage/
  current/torque publish 0, direction 0, output disabled. The motor
  keeps integrating mechanically (regen decays it).
- Faults are **never cleared automatically** except (a) an explicit
  reset command, (b) a power cycle, and (c) OL2 auto-reset after
  cool-down when 06-15 = 0 (explicitly permitted by the parameter).
- Fault history keeps the **four most recent** faults (06-17 newest …
  06-20), encoded with the numeric code map in
  `faultRecordValues.ts` (a documented simulator convention — the
  drive stores faults as numbers; the map is reconstructed, see §5).
- ocA/ocd/ocn select the trip level by state (accelerating /
  decelerating / constant speed); each level integrates for
  `ocTripDelayS` before latching.

### 4.9 Determinism contract

Same initial state + parameters + inputs + dt sequence ⇒ bit-identical
results. There is no randomness anywhere in the engine (no uncontrolled
randomness, no `setInterval`, no wall-clock reads). The frequency
pipeline is exactly dt-invariant for pure ramps; the mechanical model is
Euler-integrated with fixed internal substeps, so small dt differences
can produce tiny mechanical differences (bounded and documented) while
the published frequency/state remain identical.

## 5. Source gaps (explicit list)

Things that **cannot be established** from the available source material
and are therefore `null`, model-dependent, or explicitly marked as
assumptions:

1. **01-02..01-08** — V/F curve point values and per-point torque boost
   (null; linear fallback used).
2. **00-02** — parameter-reset option semantics (labels best-effort).
3. **02-00 option numbering** — best-effort; mode labels reconstructed.
4. **02-01..02-09** — MIx/MOx function option lists beyond the core
   relay/MO subset (02-11..02-13).
5. **03-00 / 03-06 / 04-00 / 04-01** — option lists beyond the core
   subset; 4-20 mA analog input not implemented.
6. **05-01 / 05-02 / 05-06 / 05-07** — motor rated current / voltage /
   speed / output: reference values for 7.5 kW (model-dependent).
7. **06-00 / 06-01 / 06-06 / 06-07 / 06-13 / 06-14 / 06-15** —
   protection setpoints and defaults: reference or best-effort.
8. **06-17..06-20 numeric fault-code map** — `faultRecordValues.ts` is a
   documented simulator convention, not an extracted table.
9. **07-00..07-10** — multi-step speed function: schema only, not wired.
10. **09-02 / 09-03** — comm format/timeout details.
11. **02-12 / 02-13 addresses** — follow the 02-11 pattern; the
    specification names only 02-11 explicitly.
12. **Motor inertia, rated slip, DC-link capacitance, thermal time
    constants** — no EVC parameter exists; documented assumptions (§3).
13. **10 HP/7.5 kW drive rated current** — reference value; set per
    actual drive.

When the official EVC/manual become available, the schema provenance
file and this document must be diffed against them (status `standard` →
confirmed, `reference` → validated, `gap` → filled or re-confirmed).

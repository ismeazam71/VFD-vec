/**
 * VFD-V live simulation driver (browser, real-clock).
 *
 * The engine itself is headless and deterministic — this module is a
 * thin host loop: it steps the engine once per animation frame with the
 * real elapsed time (clamped to the engine's documented stable range,
 * 0.001–0.100 s) and renders the published runtime state.
 *
 * Integration notes for embedding in your own software:
 *   - `engine.update(dt, inputs)` is the ONLY way to advance time.
 *   - `inputs` mirrors the physical terminals every tick; button
 *     presses are modeled as short multi-tick pulses (a real operator
 *     press lasts longer than one frame).
 *   - Parameter changes go through `engine.parameters.set(id, value)`
 *     (validated; rejected writes are reported, never applied).
 *   - `engine.setLoadPercent(0..200)` sets the external motor load.
 */
import {
  VfdVDriveProfile,
  VfdVState,
  MONITOR_IDS,
  getFaultCode
} from "/dist/index.js";

// ---------------------------------------------------------------------------
// Engine setup (fresh registry + core schema, reference 7.5 kW model)
// ---------------------------------------------------------------------------
const engine = VfdVDriveProfile.createEngine({});
const p = engine.parameters;

// Demo defaults (all are live-changeable in the UI).
p.set("00-20", 2); // frequency source: keypad
p.set("00-21", 1); // operation source: external terminals (2-wire)
p.set("01-12", 5); // 5 s acceleration
p.set("01-13", 5); // 5 s deceleration

// ---------------------------------------------------------------------------
// UI state (this is what a real PLC/HMI would supply each tick)
// ---------------------------------------------------------------------------
const ui = {
  phaseR: true,
  phaseS: true,
  phaseT: true,
  keypadHz: 60,
  freqSource: 2,
  opSource: 1,
  aviV: 0,
  load: 0,
  extFault: false,
  fwdPulse: 0, // remaining pulse ticks (momentary button press)
  revPulse: 0
};

const $ = (id) => document.getElementById(id);

function readParamEl(el, id) {
  const v = parseFloat(el.value);
  if (!Number.isFinite(v)) return;
  const r = p.set(id, v);
  if (!r.ok) alert(`Parameter ${id} = ${v} rejected: ${r.reason}`);
}

// --- power phases -----------------------------------------------------------
for (const [key, id] of [["phaseR", "phaseR"], ["phaseS", "phaseS"], ["phaseT", "phaseT"]]) {
  $(id).addEventListener("click", () => {
    ui[key] = !ui[key];
    $(id).classList.toggle("on", ui[key]);
  });
}

// --- momentary buttons (press = short pulse, ~4 frames) ---------------------
function pulse(which) {
  ui[which] = 4;
}
$("fwdBtn").addEventListener("click", () => pulse("fwdPulse"));
$("revBtn").addEventListener("click", () => pulse("revPulse"));

// --- frequency command -------------------------------------------------------
$("keypadHz").addEventListener("input", (e) => {
  ui.keypadHz = parseFloat(e.target.value);
  $("keypadVal").textContent = ui.keypadHz.toFixed(1);
});
$("aviV").addEventListener("input", (e) => {
  ui.aviV = parseFloat(e.target.value);
  $("aviVal").textContent = ui.aviV.toFixed(1);
});
$("freqSource").addEventListener("change", (e) => {
  ui.freqSource = parseInt(e.target.value, 10);
  p.set("00-20", ui.freqSource);
  const isAvi = ui.freqSource === 1;
  $("aviField").classList.toggle("hidden", !isAvi);
  $("keypadField").classList.toggle("hidden", isAvi);
});
$("pRev").addEventListener("change", (e) => p.set("00-23", parseInt(e.target.value, 10)));

// --- load ---------------------------------------------------------------------
$("loadPct").addEventListener("input", (e) => {
  ui.load = parseFloat(e.target.value);
  $("loadVal").textContent = ui.load.toFixed(0);
  engine.setLoadPercent(ui.load);
});

// --- fault controls -------------------------------------------------------------
$("extFaultBtn").addEventListener("click", () => {
  ui.extFault = !ui.extFault;
  $("extFaultBtn").classList.toggle("on", ui.extFault);
});
$("resetBtn").addEventListener("click", () => engine.resetFault());
$("ackBtn").addEventListener("click", () => engine.acknowledgeFault());

// --- live parameters ----------------------------------------------------------------
for (const [el, id] of [
  ["pAccel", "01-12"],
  ["pDecel", "01-13"],
  ["pStop", "00-22"],
  ["pOv", "06-01"],
  ["pLv", "06-00"],
  ["pOl2", "06-06"],
  ["pOl2t", "06-07"]
]) {
  $(el).addEventListener("change", (e) => readParamEl(e.target, id));
}
// 01-12/01-13 also update on input for immediate effect.
for (const el of ["pAccel", "pDecel"]) {
  $(el).addEventListener("input", (e) => readParamEl(e.target, el === "pAccel" ? "01-12" : "01-13"));
}

// ---------------------------------------------------------------------------
// Sparkline charts (rolling 10 s buffers, plain canvas)
// ---------------------------------------------------------------------------
const N_SAMPLES = 600;
const freqBuf = new Float32Array(N_SAMPLES);
const busBuf = new Float32Array(N_SAMPLES);
let bufIdx = 0;

function drawChart(canvas, buf, min, max, color) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  // grid line at 0
  ctx.strokeStyle = "#1d2c45";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, h - ((0 - min) / (max - min)) * h);
  ctx.lineTo(w, h - ((0 - min) / (max - min)) * h);
  ctx.stroke();

  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < N_SAMPLES; i++) {
    const v = buf[(bufIdx + i) % N_SAMPLES];
    const x = (i / (N_SAMPLES - 1)) * w;
    const y = h - ((Math.min(Math.max(v, min), max) - min) / (max - min)) * h;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

// canvas internal resolution
function sizeCanvas(c) {
  c.width = c.clientWidth * (window.devicePixelRatio || 1);
  c.height = 72 * (window.devicePixelRatio || 1);
}
const chartFreq = $("chartFreq");
const chartBus = $("chartBus");
function sizeCharts() {
  sizeCanvas(chartFreq);
  sizeCanvas(chartBus);
}
window.addEventListener("resize", sizeCharts);

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
const faultCodeCache = new Map();
function faultDescription(code) {
  if (faultCodeCache.has(code)) return faultCodeCache.get(code);
  const def = getFaultCode ? getFaultCode(code) : null;
  const d = (def && def.description) || code;
  faultCodeCache.set(code, d);
  return d;
}

function render(s, dt) {
  $("simClock").textContent = `t = ${s.simulationTime.toFixed(2)} s`;
  $("dtRead").textContent = `${(dt * 1000).toFixed(1)} ms`;

  const badge = $("stateBadge");
  badge.textContent = s.state;
  badge.className = `state ${s.state}`;

  $("roFreq").textContent = s.outputFrequency.toFixed(1);
  $("roTarget").textContent = s.targetFrequency.toFixed(1);
  $("roSpeed").textContent = s.actualSpeedRPM.toFixed(0);
  $("roSlip").textContent = s.slipRPM.toFixed(0);
  $("roDir").textContent = s.direction === 1 ? "FWD" : s.direction === -1 ? "REV" : "—";
  $("roCurr").textContent = s.outputCurrent.toFixed(1);
  $("roVolt").textContent = s.outputVoltage.toFixed(0);
  $("roBus").textContent = s.dcBusVoltage.toFixed(0);
  $("roTemp").textContent = s.motorTemperature.toFixed(1);
  $("roTorque").textContent = s.torquePercent.toFixed(0);
  $("roRunTime").textContent = s.elapsedRunTime.toFixed(1);
  $("roLoad").textContent = s.loadPercent.toFixed(0);

  const heat = engine.getMonitor().provider(MONITOR_IDS.THERMAL_HEAT_PERCENT);
  $("roHeat").textContent = Number.isFinite(heat) ? heat.toFixed(0) : "0";

  $("lampRA").classList.toggle("on", s.relayRA);
  $("lampRB").classList.toggle("on", s.relayRB);
  $("lampRC").classList.toggle("on", s.relayRC);

  const banner = $("faultBanner");
  if (s.activeFault) {
    banner.textContent = `⚠ ${s.activeFault} — ${faultDescription(s.activeFault)}`;
    banner.classList.remove("hidden");
  } else {
    banner.classList.add("hidden");
  }

  // fault history (only re-render when it changes: cheap string compare)
  const fm = engine.getFaultManager();
  const recs = fm.getFaultHistory();
  const key = recs.map((r) => (r ? `${r.code}@${r.simulationTime.toFixed(2)}` : "-")).join("|");
  if (key !== render.lastFaultKey) {
    render.lastFaultKey = key;
    const list = $("faultList");
    list.innerHTML = "";
    const any = recs.some(Boolean);
    if (!any) {
      const li = document.createElement("li");
      li.className = "none";
      li.textContent = "— no faults —";
      list.appendChild(li);
    }
    for (const r of recs) {
      if (!r) continue;
      const li = document.createElement("li");
      li.innerHTML = `<b>${r.code}</b> <span class="t">t=${r.simulationTime.toFixed(1)} s</span>`;
      li.title = r.description;
      list.appendChild(li);
    }
  }

  // charts
  freqBuf[bufIdx] = s.outputFrequency;
  busBuf[bufIdx] = s.dcBusVoltage;
  bufIdx = (bufIdx + 1) % N_SAMPLES;
  drawChart(chartFreq, freqBuf, 0, 65, "#35d6ff");
  drawChart(chartBus, busBuf, 0, 800, "#ffb454");
}
render.lastFaultKey = "";

// ---------------------------------------------------------------------------
// Real-time host loop (requestAnimationFrame — no setInterval, no engine
// dependency on wall clock: the engine only ever sees our dt values)
// ---------------------------------------------------------------------------
let last = performance.now();
function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (!Number.isFinite(dt) || dt <= 0) dt = 0.016;
  // Engine's documented stable range (also absorbs tab-switch jumps).
  dt = Math.min(0.1, Math.max(0.001, dt));

  // Momentary-button pulses: hold the terminal for a few frames, as a
  // physical press-and-release would.
  const fwd = ui.fwdPulse > 0;
  if (ui.fwdPulse > 0) ui.fwdPulse--;
  const rev = ui.revPulse > 0;
  if (ui.revPulse > 0) ui.revPulse--;

  const state = engine.update(dt, {
    phaseR: ui.phaseR,
    phaseS: ui.phaseS,
    phaseT: ui.phaseT,
    forwardCommand: fwd,
    reverseCommand: rev,
    keypadForward: false,
    keypadReverse: false,
    keypadFrequency: ui.keypadHz,
    aviVoltage: ui.freqSource === 1 ? ui.aviV : 0,
    externalFault: ui.extFault
  });

  render(state, dt);
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
sizeCharts();
engine.setLoadPercent(ui.load);
requestAnimationFrame(frame);

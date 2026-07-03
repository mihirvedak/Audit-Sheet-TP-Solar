// Dashboard data for the "Audit Sheet — TP Solar" board.
//
// The card list below is the authoritative set of cards (replaces the prior
// list). Values are DETERMINISTIC DUMMY DATA derived from the selected time
// window; configured cards (rows 1–23) compute Σ sensors ÷ production and will
// use IOsense getAutoSampled once connected.

import {
  CARD_CONFIGS,
  FORMULA_CONFIGS,
  type CardConfig,
  type FormulaConfig,
} from "./cardConfigs";
import { LIVE_CONFIGS, type LiveConfig } from "./liveConfigs";

export type CardKind = "value" | "status";
export type Health = "ok" | "warn" | "alert";
export type Tone = "yellow" | "green";
export type Category = "consumption" | "live";

export interface CardItem {
  id: string;
  row: number;
  label: string;
  unit?: string;
  kind: CardKind;
  tone?: Tone;
  category: Category;
  config?: CardConfig;
  liveConfig?: LiveConfig;
  formula?: FormulaConfig;
}

export type Reading = { value: string; health: Health };

/* ------------------------------------------------------------------ */
/* Card list (exact, in order)                                         */
/* ------------------------------------------------------------------ */

const RAW: string[] = [
  "SEC Cell",
  "SEC Module",
  "CELL-PROC-HVAC-HT",
  "CELL-PROC-HVAC LT",
  "CELL-PROC-CDA",
  "CELL-PROC-CDA",
  "CELL-PROC-N2O2",
  "CELL-PROC-PEX",
  "CELL-PROC-ZLD",
  "CELL-PROC-UPW",
  "CELL-PROC-ETP",
  "CELL-PROC-Lighting",
  "CELL-PROC-ADMIN",
  "CELL-PROC-PGS",
  "CELL-PROC-PEN",
  "CELL-PROC-CANTEEN",
  "CELL-PROC-Fire",
  "CELL-PROC-Chem",
  "CELL-PROC-STP",
  "CELL-PROC-DG",
  "CELL-PROC-CDA AUXILIARY",
  "CELL-PROC-AMMONIA",
  "CELL-PROC-SERVER ROOM",
  "MODULE-PROC-HVAC",
  "MODULE-PROC-CDA",
  "MODULE-PROC-N2O2",
  "MODULE-PROC-PEX",
  "MODULE-PROC-ZLD",
  "MODULE-PROC-UPW",
  "MODULE-PROC-ETP",
  "MODULE-PROC-Lighting",
  "MODULE-PROC-AandC",
  "MODULE-PROC-SPGas",
  "MODULE-PROC-PEN",
  "MODULE-PROC-Others",
  "MODULE-PROC-Fire",
  "MODULE-PROC-Chem",
  "MODULE-PROC-STP",
  "MODULE-PROC-DG",
  "UPW-SILICA-001",
  "ETP-RO-FEED-001",
  "ETP-RO-FEED-001",
  "rooftop-01",
  "DG-01",
  "GC-01",
  "TOT-ENERGY-01",
  "UPW_IN",
  "UPW_RES",
  "UPW-TOC-001",
  "influent-001",
  "pretreat-001",
  "ETP_IN",
  "ETP_BD",
  "ETP_COND",
  "ETP_PH",
  "BB_IN",
  "BB_COND",
  "BB_NH3_IN",
  "BB_NH3_OUT",
  "BB_PH",
  "STP_CELL_IN",
  "STP_MOD_IN",
  "WTP_PH",
  "WTP_TDS",
  "WTP_NTU",
  "WET_CHEM_LHS",
  "WET_CHEM_RHS",
  "TOP_CON_LHS",
  "TOP_CON_RHS",
  "THERMAL_LHS",
  "THERMAL_RHS",
  "PRINT_LHS",
  "PRINT_RHS",
  "WET_CHEM_LHS",
  "WET_CHEM_RHS",
  "TOP_CON_LHS",
  "TOP_CON_RHS",
  "THERMAL_LHS",
  "THERMAL_RHS",
  "PRINT_LHS",
  "PRINT_RHS",
  "CH_CELL_01",
  "CH_MOD_01",
  "CA_CELL_01",
  "CA_MOD_01",
  "PRES-HF-PL1-001",
  "STS-HF-PL1-001",
  "PRES-HF-PL2-001",
  "STS-HF-PL2-001",
  "PRES-HCL-PL1-001",
  "STS-HCL-PL1-001",
  "PRES-HCL-PL2-001",
  "STS-HCL-PL2-001",
  "PRES-H2O2-PL1-001",
  "STS-H2O2-PL1-001",
  "PRES-H2O2-PL2-001",
  "STS-H2O2-PL2-001",
  "PRES-KOH-PL1-001",
  "STS-KOH-PL1-001",
  "PRES-KOH-PL2-001",
  "STS-KOH-PL2-001",
  "PRES-PLCDTM-PL1-001",
  "STS-PLCDTM-PL1-001",
  "PRES-PLCDTM-PL2-001",
  "STS-PLCDTM-PL2-001",
  "PRES-TXCDTM-PL1-001",
  "STS-TXCDTM-PL1-001",
  "PRES-TXCDTM-PL2-001",
  "STS-TXCDTM-PL2-001",
  "RES_CELL_TA_FR",
  "RES_CELL_TA_AV",
  "RES_CELL_TB_FR",
  "RES_CELL_TB_AV",
  "RES_MOD_TA_FR",
  "RES_MOD_TA_AV",
  "RES_MOD_TB_FR",
  "RES_MOD_TB_AV",
  "WC_CELL_SIPCOT",
  "WC_CELL_RES",
  "WC_MOD_SIPCOT",
  "WC_MOD_RES",
  "UPW_REC",
  "recovery-001",
  "thermal-001",
  "pretreatrecover-001",
  "ETP_BD",
  "BB_REC",
  "STP_CELL_REC",
  "STP_MOD_REC",
  "WTP_TA",
  "WTP_TB",
  "WTP_TREATED",
  "WTP_DOM",
  "TOTAL_REC",
  "TANK-HF-A-003",
  "TANK-HF-B-004",
  "TANK-HCL-A-001",
  "TANK-HCL-B-002",
  "TANK-H2O2-A-001",
  "TANK-H2O2-B-002",
  "TANK-KOH-A-001",
  "TANK-KOH-B-002",
  "TANK-PLCDTM-A-001",
  "TANK-PLCDTM-B-002",
  "TANK-TXCDTM-A-001",
  "TANK-TXCDTM-B-002",
  // Bulk-upload module audit cards (rows 147+): Σ device consumption on D0, kL.
  "HVAC HT",
  "PEX",
  "Canteen",
  "Fire pump house",
  "STP",
  "WTP",
  "EVA POE-1",
  "EVA POE-2",
  "UPS 1& 2",
  "CDA LT",
  "PCW",
  "Reliability lab",
  "RM WH",
  "FG WH",
  "Guest House",
  "IT Server",
  "Prod Phase 1",
  "Prod Phase 2",
];

/* ------------------------------------------------------------------ */
/* Tab categorisation (by tag pattern)                                 */
/* ------------------------------------------------------------------ */

// Live Data cards (explicit, per spec). Everything else is Consumption — this
// also covers the 3 cards in neither list (CELL-PROC-HVAC LT, GC-01, TOTAL_REC),
// which default to Consumption. Duplicate labels share one category.
const LIVE_LABELS = new Set<string>([
  "GC-01",
  "UPW-SILICA-001",
  "ETP-RO-FEED-001",
  "UPW_RES",
  "UPW-TOC-001",
  "ETP_COND",
  "ETP_PH",
  "BB_COND",
  "BB_NH3_IN",
  "BB_NH3_OUT",
  "BB_PH",
  "WTP_PH",
  "WTP_TDS",
  "WTP_NTU",
  "WET_CHEM_LHS",
  "WET_CHEM_RHS",
  "TOP_CON_LHS",
  "TOP_CON_RHS",
  "THERMAL_LHS",
  "THERMAL_RHS",
  "PRINT_LHS",
  "PRINT_RHS",
  "PRES-HF-PL1-001",
  "STS-HF-PL1-001",
  "PRES-HF-PL2-001",
  "STS-HF-PL2-001",
  "PRES-HCL-PL1-001",
  "STS-HCL-PL1-001",
  "PRES-HCL-PL2-001",
  "STS-HCL-PL2-001",
  "PRES-H2O2-PL1-001",
  "STS-H2O2-PL1-001",
  "PRES-H2O2-PL2-001",
  "STS-H2O2-PL2-001",
  "PRES-KOH-PL1-001",
  "STS-KOH-PL1-001",
  "PRES-KOH-PL2-001",
  "STS-KOH-PL2-001",
  "PRES-PLCDTM-PL1-001",
  "STS-PLCDTM-PL1-001",
  "PRES-PLCDTM-PL2-001",
  "STS-PLCDTM-PL2-001",
  "PRES-TXCDTM-PL1-001",
  "STS-TXCDTM-PL1-001",
  "PRES-TXCDTM-PL2-001",
  "STS-TXCDTM-PL2-001",
  "RES_CELL_TA_FR",
  "RES_CELL_TA_AV",
  "RES_CELL_TB_FR",
  "RES_CELL_TB_AV",
  "RES_MOD_TA_FR",
  "RES_MOD_TA_AV",
  "RES_MOD_TB_FR",
  "RES_MOD_TB_AV",
  "WTP_TA",
  "WTP_TB",
  "WTP_DOM",
  "TANK-HF-A-003",
  "TANK-HF-B-004",
  "TANK-HCL-A-001",
  "TANK-HCL-B-002",
  "TANK-H2O2-A-001",
  "TANK-H2O2-B-002",
  "TANK-KOH-A-001",
  "TANK-KOH-B-002",
  "TANK-PLCDTM-A-001",
  "TANK-PLCDTM-B-002",
  "TANK-TXCDTM-A-001",
  "TANK-TXCDTM-B-002",
]);

function categoryFor(label: string): Category {
  return LIVE_LABELS.has(label) ? "live" : "consumption";
}

/* ------------------------------------------------------------------ */
/* Display unit per card (by row). "" = show value with no unit.       */
/* ------------------------------------------------------------------ */

const UNIT_BY_ROW: Record<number, string> = {};
// 1–39: SEC + CELL-PROC + MODULE-PROC energy meters
for (let r = 1; r <= 39; r++) UNIT_BY_ROW[r] = "kWh/kWp";
// 86–109: PRES → bar (even rows), STS → no unit (odd rows)
for (let r = 86; r <= 109; r++) UNIT_BY_ROW[r] = r % 2 === 0 ? "bar" : "";
// 135–146: tank levels
for (let r = 135; r <= 146; r++) UNIT_BY_ROW[r] = "%";
Object.assign(UNIT_BY_ROW, {
  40: "ppm", 41: "ppm", 42: "ppm", 43: "kWh", 44: "kWh", 45: "", 46: "kWh",
  47: "kL", 48: "µΩ", 49: "ppb", 50: "kL", 51: "kL", 52: "kL", 53: "kL",
  54: "µS/cm", 55: "ph", 56: "kL", 57: "µS/cm", 58: "ppm", 59: "ppm", 60: "ph",
  61: "kL", 62: "kL", 63: "", 64: "tds", 65: "NTU",
  66: "°C", 67: "°C", 68: "°C", 69: "°C",
  70: "°C", 71: "°C", 72: "°C", 73: "°C",
  74: "%", 75: "%", 76: "%", 77: "%", 78: "%", 79: "%", 80: "%", 81: "%",
  82: "kW/TR", 83: "kW/TR", 84: "kWh/m3", 85: "kWh/m3",
  110: "ML", 111: "%", 112: "ML", 113: "%", 114: "kL", 115: "%", 116: "kL",
  117: "%", 118: "kL", 119: "kL", 120: "kL", 121: "m³", 122: "kL", 123: "kL",
  124: "kL", 125: "kL", 126: "kL", 127: "kL", 128: "kL", 129: "kL", 130: "%",
  131: "%", 132: "kL", 133: "kL", 134: "kL",
  // 147–164: bulk-upload module audit cards → kL
  147: "kL", 148: "kL", 149: "kL", 150: "kL", 151: "kL", 152: "kL", 153: "kL",
  154: "kL", 155: "kL", 156: "kL", 157: "kL", 158: "kL", 159: "kL", 160: "kL",
  161: "kL", 162: "kL", 163: "kL", 164: "kL",
});

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function classify(label: string): { kind: CardKind; unit?: string } {
  const l = label.toLowerCase();
  // New IOsense tag patterns (take precedence).
  if (l.startsWith("sts-")) return { kind: "status" };
  if (l.startsWith("pres-")) return { kind: "value", unit: "bar" };
  if (l.startsWith("tank-")) return { kind: "value", unit: "%" };
  if (l.startsWith("res_")) return { kind: "value", unit: "m³/h" };
  if (l === "wc_mod_res") return { kind: "value", unit: "kL" };
  if (l.endsWith("_ph")) return { kind: "value", unit: "pH" };
  if (l.endsWith("_tds")) return { kind: "value", unit: "ppm" };
  if (l.endsWith("_ntu")) return { kind: "value", unit: "NTU" };
  if (l.endsWith("_cond")) return { kind: "value", unit: "µS/cm" };
  if (l.endsWith("_res")) return { kind: "value", unit: "MΩ·cm" };
  // Generic keyword rules.
  if (l.includes("status")) return { kind: "status" };
  if (l.includes("pressure")) return { kind: "value", unit: "bar" };
  if (/\bph\b/.test(l)) return { kind: "value", unit: "pH" };
  if (l.includes("conductivity")) return { kind: "value", unit: "µS/cm" };
  if (l.includes("resistivity")) return { kind: "value", unit: "MΩ·cm" };
  if (l.includes("toc")) return { kind: "value", unit: "ppb" };
  if (l.includes("tds")) return { kind: "value", unit: "ppm" };
  if (l === "ntu") return { kind: "value", unit: "NTU" };
  if (l.includes("rec") || l.includes("recovery"))
    return { kind: "value", unit: "%" };
  if (l.includes("weight")) return { kind: "value", unit: "kg" };
  if (l.includes("level")) return { kind: "value", unit: "%" };
  if (
    l.includes("flow") ||
    l.includes("water") ||
    l.includes("_in") ||
    l.includes("influent") ||
    l.includes("effluent") ||
    l.includes("blowdown") ||
    l.includes("sewage") ||
    l.includes("treated") ||
    l.includes("dom")
  )
    return { kind: "value", unit: "m³/h" };
  return { kind: "value", unit: "kWh" };
}

function dummyValue(seed: number, unit: string | undefined, kind: CardKind): string {
  if (kind === "status") return seed % 6 === 0 ? "OFF" : "ON";
  switch (unit) {
    case "pH":
    case "ph":
      return (6 + (seed % 30) / 10).toFixed(2);
    case "tds":
      return (50 + (seed % 450)).toString();
    case "°C":
      return (15 + (seed % 30)).toString();
    case "µΩ":
      return (10 + (seed % 90)).toString();
    case "kWh/kWp":
      return (1 + (seed % 400) / 100).toFixed(2);
    case "kWh/m3":
      return (1 + (seed % 500) / 100).toFixed(2);
    case "lkW/TR":
      return (0.5 + (seed % 80) / 100).toFixed(2);
    case "kL":
      return (10 + (seed % 4990)).toLocaleString("en-US");
    case "ML":
      return ((seed % 500) / 10).toFixed(1);
    case "MLD":
      return (1 + (seed % 90) / 10).toFixed(1);
    case "bar":
      return (1 + (seed % 90) / 10).toFixed(1);
    case "ppm":
      return (50 + (seed % 450)).toString();
    case "µS/cm":
      return (1 + (seed % 120)).toString();
    case "NTU":
      return ((seed % 200) / 10).toFixed(1);
    case "MΩ·cm":
      return (10 + (seed % 80) / 10).toFixed(2);
    case "ppb":
      return (1 + (seed % 20)).toString();
    case "%":
      return (40 + (seed % 60)).toString();
    case "kg":
      return (100 + (seed % 900)).toString();
    case "m³/h":
      return (5 + (seed % 295)).toString();
    default: // kWh
      return (1000 + (seed % 9000)).toLocaleString("en-US");
  }
}

function healthFromSeed(seed: number, kind: CardKind, value: string): Health {
  if (kind === "status") return value === "ON" ? "ok" : "alert";
  const r = seed % 100;
  if (r < 8) return "alert";
  if (r < 26) return "warn";
  return "ok";
}

function makeCard(row: number, label: string): CardItem {
  const id = `row-${String(row).padStart(3, "0")}`;
  const { kind } = classify(label);
  const u = UNIT_BY_ROW[row]; // explicit display unit ("" = none)
  const unit = kind === "status" || !u ? undefined : u;
  return { id, row, label, unit, kind, category: categoryFor(label) };
}

// Reading for a non-configured card within a time window. Values are generated
// from the display unit; for no-unit value cards (e.g. WTP_PH) fall back to the
// keyword-inferred unit so the number still looks sensible.
export function reading(card: CardItem, rangeKey: string): Reading {
  const genUnit = card.unit ?? classify(card.label).unit;
  const seed = hash(card.id + card.label + rangeKey);
  const value = dummyValue(seed, genUnit, card.kind);
  return { value, health: healthFromSeed(seed, card.kind, value) };
}

// Per-sensor energy reading (placeholder until IOsense getAutoSampled is wired).
function sensorReading(device: string, sensor: string, rangeKey: string): number {
  return 50 + (hash(device + sensor + rangeKey) % 9950);
}

// Reading for a CONFIGURED card: Σ(numerator sensors) / divisor.
export function configuredReading(card: CardItem, rangeKey: string): Reading {
  const cfg = card.config!;
  const sum = cfg.numerator.reduce(
    (acc, t) => acc + sensorReading(t.device, t.sensor, rangeKey),
    0,
  );
  let v = sum;
  if (cfg.divisor) {
    const denom =
      1000 + (hash(cfg.divisor.device + cfg.divisor.sensor + rangeKey) % 9000);
    v = sum / denom;
  }
  const value = cfg.divisor
    ? v.toFixed(2)
    : Math.round(v).toLocaleString("en-US");
  const seed = hash(card.id + rangeKey);
  const r = seed % 100;
  const health: Health = r < 8 ? "alert" : r < 26 ? "warn" : "ok";
  return { value, health };
}

/* ------------------------------------------------------------------ */
/* Build                                                               */
/* ------------------------------------------------------------------ */

function build(): CardItem[] {
  return RAW.map((label, i) => {
    const row = i + 1;
    const c = makeCard(row, label);
    const config = CARD_CONFIGS[row];
    const liveConfig = LIVE_CONFIGS[row];
    const formula = FORMULA_CONFIGS[row];
    return {
      ...c,
      ...(config ? { config } : {}),
      ...(liveConfig ? { liveConfig } : {}),
      ...(formula ? { formula } : {}),
    };
  });
}

export const cards: CardItem[] = build();
export const totalCards = cards.length;

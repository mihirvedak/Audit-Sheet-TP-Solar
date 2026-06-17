// Live-data card configuration. A live card shows the LATEST sensor reading
// (not a consumption delta). A few are computed: average of N sensors,
// (average / 6.5) × 100, or a fixed constant.

export type LiveOp = "latest" | "average" | "scalePct" | "constant";

export interface LiveSensor {
  device: string;
  sensor: string;
}

export interface LiveConfig {
  op: LiveOp;
  sensors: LiveSensor[]; // latest: 1; average/scalePct: N; constant: 0
  constant?: number; // for op === "constant"
}

const s = (device: string, sensor: string): LiveSensor => ({ device, sensor });
const latest = (device: string, sensor: string): LiveConfig => ({
  op: "latest",
  sensors: [s(device, sensor)],
});
const average = (...sensors: LiveSensor[]): LiveConfig => ({
  op: "average",
  sensors,
});
// (average of latest values / 6.5) × 100
const scalePct = (...sensors: LiveSensor[]): LiveConfig => ({
  op: "scalePct",
  sensors,
});
const constant = (v: number): LiveConfig => ({ op: "constant", sensors: [], constant: v });

// Keyed by the card's sheet row (1-based) — matches RAW order in dashboardData.
export const LIVE_CONFIGS: Record<number, LiveConfig> = {
  40: latest("TPSGCUPW_A11", "D2"), // UPW-SILICA-001
  41: latest("ENEQTYEF_A1", "D1"), // ETP-RO-FEED-001
  42: latest("ENEQTYEF_A1", "D2"), // ETP-RO-FEED-001
  48: latest("TPSGCUPW_A11", "D0"), // UPW_RES
  49: latest("TPSGCUPW_A9", "D0"), // UPW-TOC-001
  54: latest("ENEQTYIN_A1", "D6"), // ETP_COND
  55: latest("TPSGCETP_A2", "D1"), // ETP_PH
  57: latest("TPSGCETP_B8", "D0"), // BB_COND
  58: latest("TPSGCETP_B1", "D0"), // BB_NH3_IN
  59: latest("TPSGCETP_B1", "D1"), // BB_NH3_OUT
  60: latest("TPSGCETP_B1", "D5"), // BB_PH
  63: latest("WTP_A1", "D44"), // WTP_PH
  64: latest("WTP_A1", "D43"), // WTP_TDS
  65: latest("TPSGMWTP_A1", "D3"), // WTP_NTU

  // Temperatures (°C, D0)
  66: latest("WETCHEMLHS", "D0"), // WET_CHEM_LHS
  67: latest("WETCHEMRHS", "D0"), // WET_CHEM_RHS
  68: latest("TOPCONERHS", "D0"), // TOP_CON_LHS
  69: latest("TOPCONELHS", "D0"), // TOP_CON_RHS
  70: latest("THERMALAREALHS", "D0"), // THERMAL_LHS
  71: latest("THERMALAREARHS", "D0"), // THERMAL_RHS
  72: latest("PRINTINGAREALHS", "D0"), // PRINT_LHS
  73: latest("PRINTINGAREARHS", "D0"), // PRINT_RHS

  // Humidity (%, D1)
  74: latest("WETCHEMLHS", "D1"), // WET_CHEM_LHS
  75: latest("WETCHEMRHS", "D1"), // WET_CHEM_RHS
  76: latest("TOPCONERHS", "D1"), // TOP_CON_LHS
  77: latest("TOPCONELHS", "D1"), // TOP_CON_RHS
  78: latest("THERMALAREALHS", "D1"), // THERMAL_LHS
  79: latest("THERMALAREARHS", "D1"), // THERMAL_RHS
  80: latest("PRINTINGAREALHS", "D1"), // PRINT_LHS
  81: latest("PRINTINGAREARHS", "D1"), // PRINT_RHS

  // Chemical plant — PRES (bar) / STS pairs
  86: latest("TPSGCPCH_A7", "D84"), // PRES-HF-PL1-001
  87: latest("TPSGCPCH_A7", "D37"), // STS-HF-PL1-001
  88: latest("TPSGCPCH_A7", "D85"), // PRES-HF-PL2-001
  89: latest("TPSGCPCH_A7", "D41"), // STS-HF-PL2-001
  90: latest("TPSGCPCH_A6", "D84"), // PRES-HCL-PL1-001
  91: latest("TPSGCPCH_A6", "D37"), // STS-HCL-PL1-001
  92: latest("TPSGCPCH_A6", "D85"), // PRES-HCL-PL2-001
  93: latest("TPSGCPCH_A6", "D41"), // STS-HCL-PL2-001
  94: latest("TPSGCPCH_A5", "D84"), // PRES-H2O2-PL1-001
  95: latest("TPSGCPCH_A5", "D37"), // STS-H2O2-PL1-001
  96: latest("TPSGCPCH_A5", "D85"), // PRES-H2O2-PL2-001
  97: latest("TPSGCPCH_A5", "D41"), // STS-H2O2-PL2-001
  98: latest("TPSGCPCH_A8", "D84"), // PRES-KOH-PL1-001
  99: latest("TPSGCPCH_A8", "D37"), // STS-KOH-PL1-001
  100: latest("TPSGCPCH_A8", "D85"), // PRES-KOH-PL2-001
  101: latest("TPSGCPCH_A8", "D41"), // STS-KOH-PL2-001
  102: latest("TPSGCPCH_A13", "D100"), // PRES-PLCDTM-PL1-001
  103: latest("TPSGCPCH_A13", "D41"), // STS-PLCDTM-PL1-001
  104: latest("TPSGCPCH_A13", "D101"), // PRES-PLCDTM-PL2-001
  105: latest("TPSGCPCH_A13", "D45"), // STS-PLCDTM-PL2-001
  106: latest("TPSGCPCH_A14", "D100"), // PRES-TXCDTM-PL1-001
  107: latest("TPSGCPCH_A14", "D41"), // STS-TXCDTM-PL1-001
  108: latest("TPSGCPCH_A14", "D101"), // PRES-TXCDTM-PL2-001
  109: latest("TPSGCPCH_A14", "D45"), // STS-TXCDTM-PL2-001

  // Reservoir level cards
  110: constant(2.85), // RES_CELL_TA_FR (ML)
  111: average(s("TPSGCUPW_A1", "D8"), s("TPSGCUPW_A1", "D9")), // RES_CELL_TA_AV
  112: constant(2.85), // RES_CELL_TB_FR
  113: average(s("TPSGCUPW_A1", "D10"), s("TPSGCUPW_A1", "D11")), // RES_CELL_TB_AV
  114: constant(300), // RES_MOD_TA_FR (kL)
  115: scalePct(s("TPSGMWTP_A1", "D4"), s("TPSGMWTP_A1", "D5")), // RES_MOD_TA_AV
  116: constant(300), // RES_MOD_TB_FR
  117: scalePct(s("TPSGMWTP_A1", "D6"), s("TPSGMWTP_A1", "D7")), // RES_MOD_TB_AV

  130: scalePct(s("TPSGMWTP_A1", "D13")), // WTP_TA
  131: scalePct(s("TPSGMWTP_A1", "D14")), // WTP_TB
  133: latest("WTP_A1", "D1"), // WTP_DOM (kL)

  // Chemical tank levels (%)
  135: latest("TPSGCPCH_A7", "D56"), // TANK-HF-A-003
  136: latest("TPSGCPCH_A7", "D60"), // TANK-HF-B-004
  137: latest("TPSGCPCH_A6", "D56"), // TANK-HCL-A-001
  138: latest("TPSGCPCH_A6", "D60"), // TANK-HCL-B-002
  139: latest("TPSGCPCH_A5", "D56"), // TANK-H2O2-A-001
  140: latest("TPSGCPCH_A5", "D60"), // TANK-H2O2-B-002
  141: latest("TPSGCPCH_A8", "D56"), // TANK-KOH-A-001
  142: latest("TPSGCPCH_A8", "D60"), // TANK-KOH-B-002
  143: latest("TPSGCPCH_A13", "D60"), // TANK-PLCDTM-A-001
  144: latest("TPSGCPCH_A13", "D64"), // TANK-PLCDTM-B-002
  145: latest("TPSGCPCH_A14", "D60"), // TANK-TXCDTM-A-001
  146: latest("TPSGCPCH_A14", "D64"), // TANK-TXCDTM-B-002
};

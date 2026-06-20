// Device / sensor configuration for the dashboard cards.
//
// Each configured card computes:  Σ(numerator sensors) / divisor sensor
// e.g. SEC = total energy consumption ÷ production.
//
// RULE (per project spec): metric === "consumption" is fetched from IOsense via
// getAutoSampled. This is applied throughout — any consumption card uses it.
//
// A term is written "DEVICE_NAME(Dxxx)" where Dxxx is the sensor id.

export interface SourceTerm {
  device: string;
  sensor: string;
}

export type MetricType = "consumption" | "production";

export interface CardConfig {
  /** consumption → fetched via getAutoSampled */
  metric: MetricType;
  /** IOsense fetch method to use for this card's series. */
  method: "getAutoSampled";
  /** Sensors summed for the numerator (cumulative consumption = last−first). */
  numerator: SourceTerm[];
  /** Single production normaliser → SUMMED (SEC = energy / production). */
  divisor?: SourceTerm;
  /** Ratio denominator → summed consumption deltas (recovery-type cards). */
  denominator?: SourceTerm[];
}

function term(token: string): SourceTerm {
  const m = token.trim().match(/^(.+?)\s*\(\s*(D\d+)\s*\)$/);
  if (!m) throw new Error(`Invalid source term: "${token}"`);
  return { device: m[1].trim(), sensor: m[2] };
}
const terms = (tokens: string[]): SourceTerm[] => tokens.map(term);

/* ------------------------------------------------------------------ */
/* Formula cards — custom arithmetic that the numerator/divisor model   */
/* can't express. Currently: chiller-load sum (CH_CELL_01).             */
/* ------------------------------------------------------------------ */

/** One chiller's contribution = consumption ÷ TR, where TR is derived from the
 *  supply/return temperatures (and, when wired, running hours via the status flag). */
export interface ChillerTerm {
  power: SourceTerm; // consumption meter → last−first delta over the window
  supply: SourceTerm; // TR inlet / supply temperature (averaged)
  ret: SourceTerm; // TR outlet / return temperature (averaged)
  status?: SourceTerm; // running flag (D37 == 1) → enables running-hours-weighted TR
}

export interface ChillerSumConfig {
  kind: "chillerSum";
  /** Multiplier on ΔT in the denominator (810 / 850). */
  powerDiv: number;
  /** Denominator divisor (3.024). */
  deltaDiv: number;
  chillers: ChillerTerm[];
}

/**
 * Compressed-air specific-energy card (kWh/m³):
 *   Σ consumption(numerator) ÷ ( factor × runHours(runGate > runThreshold) × Σ avg(flow) )
 * Numerator = energy meters (Σ boundary delta). Denominator = air volume:
 * each flow sensor's window-average × factor (min/hr) × the running hours where
 * the gate sensor exceeds runThreshold.
 */
export interface CdaSecConfig {
  kind: "cdaSec";
  numerator: SourceTerm[];
  flow: SourceTerm[];
  runGate: SourceTerm;
  runThreshold: number;
  factor: number;
}

export type FormulaConfig = ChillerSumConfig | CdaSecConfig;

const chiller = (
  power: string,
  supply: string,
  ret: string,
  status?: string,
): ChillerTerm => ({
  power: term(power),
  supply: term(supply),
  ret: term(ret),
  ...(status ? { status: term(status) } : {}),
});

// Keyed by sheet row. Each chiller term, summed:
//   consumption ÷ ((powerDiv × (avg supplyT − avg returnT)) ÷ deltaDiv)
// where consumption = the power meter's last−first delta over the window, and
// the supply/return temperatures are averaged.
// CH_CELL_01 powerDiv 810, CH_MOD_01 powerDiv 850; deltaDiv 3.024.
export const FORMULA_CONFIGS: Record<number, FormulaConfig> = {
  // 82 — CH_CELL_01: sum of 7 chillers. TR per chiller is running-hours-weighted
  // (status D37 == 1) off the TPSLCH_* inlet/outlet temps; trBase = powerDiv = 810.
  // chiller(powerMeter, trInlet, trOutlet, statusD37)
  82: {
    kind: "chillerSum",
    powerDiv: 810,
    deltaDiv: 3.024,
    chillers: [
      chiller("TPSGHTCSS_W1(D410)", "TPSLCH_A(D16)", "TPSLCH_A(D22)", "TPSLCH_A(D37)"), // Chiller 1
      chiller("TPSGHTCSS_W1(D462)", "TPSLCH_B(D8)", "TPSLCH_B(D14)", "TPSLCH_B(D37)"), // Chiller 2
      chiller("TPSGHTCSS_X1(D72)", "TPSLCH_C(D9)", "TPSLCH_C(D15)", "TPSLCH_C(D37)"), // Chiller 3
      chiller("TPSGHTCSS_X1(D180)", "TPSLCH_D(D9)", "TPSLCH_D(D15)", "TPSLCH_D(D37)"), // Chiller 4
      chiller("TPSGHTCSS_X1(D447)", "TPSLCH_E(D9)", "TPSLCH_E(D15)", "TPSLCH_E(D37)"), // Chiller 5
      chiller("TPSGHTCSS_Y1(D214)", "TPSLCH_F(D9)", "TPSLCH_F(D15)", "TPSLCH_F(D37)"), // Chiller 6
      chiller("TPSGHTCSS_Y1(D268)", "TPSLCH_G(D9)", "TPSLCH_G(D15)", "TPSLCH_G(D37)"), // Chiller 7
    ],
  },

  // 83 — CH_MOD_01: sum of 4 chillers. trBase = 810 (same as CH_CELL_01). TR is
  // running-hours-weighted off the TPSGMHVAC_* D25/D26 temps; status flag = D0
  // (1 = Running). chiller(powerMeter, trInlet D25, trOutlet D26, statusD0)
  83: {
    kind: "chillerSum",
    powerDiv: 810, // trBase for TR = 810 × ΔT ÷ 3.024
    deltaDiv: 3.024,
    chillers: [
      chiller("TPSGHTCSS_M1(D442)", "TPSGMHVAC_A14(D25)", "TPSGMHVAC_A14(D26)", "TPSGMHVAC_A14(D0)"), // Chiller 1
      chiller("TPSGHTCSS_N1(D2)", "TPSGMHVAC_A15(D25)", "TPSGMHVAC_A15(D26)", "TPSGMHVAC_A15(D0)"), // Chiller 2
      chiller("TPSGHTCSS_N1(D295)", "TPSGMHVAC_A16(D25)", "TPSGMHVAC_A16(D26)", "TPSGMHVAC_A16(D0)"), // Chiller 3
      chiller("TPSGHTCSS_P1(D206)", "TPSGMHVAC_A17(D25)", "TPSGMHVAC_A17(D26)", "TPSGMHVAC_A17(D0)"), // Chiller 4
    ],
  },

  // 84 — CA_CELL_01 (kWh/m³): compressed-air specific energy.
  //   Σ consumption(meters) ÷ ( 60 × runHours(TPSGCCDA_C3 D1 > 1) × (avg D1 + avg D3) )
  84: {
    kind: "cdaSec",
    numerator: terms(["TPSGHTCSS_Y1(D160)", "TPSGHTCSS_Y1(D1)", "TPSGHTCSS_X1(D126)"]),
    flow: terms(["TPSGCCDA_C3(D1)", "TPSGCCDA_C3(D3)"]),
    runGate: term("TPSGCCDA_C3(D1)"),
    runThreshold: 1,
    factor: 60,
  },

  // 85 — CA_MOD_01 (kWh/m³): compressed-air specific energy (module).
  //   Σ consumption(meters) ÷ ( 60 × runHours(TPSGMCDA_C3 D1 > 1) × avg D1 )
  85: {
    kind: "cdaSec",
    numerator: terms(["TPSGHTCSS_N1(D62)", "TPSGHTCSS_P1(D146)", "TPSGHTCSS_N1(D355)"]),
    flow: terms(["TPSGMCDA_C3(D1)"]),
    runGate: term("TPSGMCDA_C3(D1)"),
    runThreshold: 1,
    factor: 60,
  },
};

const CELL = "CELL_PRODUCTION_A1(D0)";
const MODULE = "MODULE_PRODUCTION_A1(D0)";

// Keyed by the card's sheet row (1-based).
export const CARD_CONFIGS: Record<number, CardConfig> = {
  // 1 — SEC Cell
  1: {
    metric: "consumption",
    method: "getAutoSampled",
    numerator: terms([
      "TPSGHTCSS_R1(D161)",
      "TPSGHTCSS_S1(D296)",
      "TPSGHTCSS_S1(D469)",
      "TPSGHTCSS_U1(D102)",
      "TPSGHTCSS_U1(D325)",
      "TPSGHTCSS_V1(D403)",
      "TPSGHTCSS_W1(D356)",
      "TPSGHTCSS_Y1(D106)",
      "TPSGHTCSS_R1(D431)",
      "TPSGHTCSS_T1(D289)",
      "TPSGHTCSS_V1(D196)",
      "TPSGHTCSS_X1(D339)",
      "TPSGHTCSS_R1(D370)",
    ]),
    divisor: term(CELL),
  },

  // 2 — SEC Module
  2: {
    metric: "consumption",
    method: "getAutoSampled",
    numerator: terms([
      "TPSGHTCSS_J1(D389)",
      "TPSGHTCSS_L1(D59)",
      "TPSGHTCSS_M1(D382)",
      "TPSGHTCSS_P1(D86)",
      "TPSGHTCSS_K1(D317)",
      "TPSGHTCSS_N1(D235)",
      "TPSGHTCSS_K1(D247)",
    ]),
    divisor: term(MODULE),
  },

  // 3 — HVAC-HT
  3: {
    metric: "consumption",
    method: "getAutoSampled",
    numerator: terms([
      "TPSGHTCSS_W1(D410)",
      "TPSGHTCSS_W1(D462)",
      "TPSGHTCSS_X1(D72)",
      "TPSGHTCSS_X1(D180)",
      "TPSGHTCSS_X1(D447)",
      "TPSGHTCSS_Y1(D214)",
      "TPSGHTCSS_Y1(D268)",
    ]),
    divisor: term(CELL),
  },

  // 4 — HVAC-LT
  4: {
    metric: "consumption",
    method: "getAutoSampled",
    numerator: terms([
      "South_Panel_Z4_8F4(D0)",
      "S_FFU_Panel_5_8F2(D0)",
      "South_Panel_Z3_7F4(D0)",
      "PCW_Pump_4_SS_4_UPS_O_G_Panel_6F1(D0)",
      "S_FFU_Panel_4_7F2(D0)",
      "PCW_Pump_2_6F3(D0)",
      "S_FFU_Panel_3_6F2(D0)",
      "PCW_Pump_1_5F4(D0)",
      "South_Panel_Z5_5F1(D0)",
      "MCW_Pump_1_3F2(D0)",
      "MCW_Pump_2_3F3(D0)",
      "MCW_Pump_3_3F4(D0)",
      "South_Panel_Z2_7F3(D0)",
      "South_Panel_Z1_7F2(D0)",
      "Fire_Mode_Panel_2_6F3(D0)",
      "S_FFU_Panel_2_6F2(D0)",
      "S_FFU_Panel_1_5F2(D0)",
      "RCU_11APH32_2F2(D0)",
      "SE_Panel_3_2F1(D0)",
      "SE_Panel_4_2F2(D0)",
      "MAU_Panel_5_2F3(D0)",
      "N_FFU_Panel_6_3F2(D0)",
      "MAU_Panel_4_3F4(D0)",
      "N_FFU_Panel_7_4F2(D0)",
      "SE_Panel_9_6F3(D0)",
      "SE_Panel_7_8F2(D0)",
      "North_Panel_Z3_2F2(D0)",
      "11APH40_2F3(D0)",
      "11APH35_2F4(D0)",
      "N_FFU_Panel_1_3F2(D0)",
      "North_Panel_Z1_3F3(D0)",
      "MAU_Panel_1_3F4(D0)",
      "N_FFU_Panel_2_4F2(D0)",
      "North_Panel_Z2_4F3(D0)",
      "MAU_Panel_2_4F4(D0)",
      "N_FFU_Panel_3_5F2(D0)",
      "Fire_Mode_Panel_1_5F3(D0)",
      "MAU_Panel_3_5F4(D0)",
      "N_FFU_Panel_4_6F2(D0)",
      "N_FFU_Panel_5_7F2(D0)",
      "CWP_1_4F(D0)",
      "CWP_2_6F(D0)",
      "CWP_3_7F(D0)",
      "CWP_4_10F5(D0)",
      "CWP_5_11F5(D0)",
      "CWP_7_9F3(D0)",
      "Cond_WP_1_4F3(D0)",
      "Cond_WP_2_3F3(D0)",
      "Cond_WP_3_2F3(D0)",
      "Cond_WP_4_2F2(D0)",
      "Main_Equipment_Panel_6F1(D0)",
      "Cond_WP_5_3F3(D0)",
      "Cond_WP_6_3F2(D0)",
      "Cond_WP_7_2F3(D0)",
      "Heat_Pump_5F1(D0)",
      "PCW_Pump_3_11F4(D0)",
      "RCU_11AH_27_8F2(D0)",
      "North_panel_Z4_2f5(D0)",
      "SFFU_Panel_7_10F2(D0)",
      "SFFU_Panel_6_9F2(D0)",
      "CWP_6_9F4(D0)",
    ]),
    divisor: term(CELL),
  },

  // 5 — CDA-HT
  5: {
    metric: "consumption",
    method: "getAutoSampled",
    numerator: terms([
      "TPSGHTCSS_Y1(D160)",
      "TPSGHTCSS_Y1(D1)",
      "TPSGHTCSS_X1(D126)",
    ]),
    divisor: term(CELL),
  },

  // 6 — CDA-LT
  6: {
    metric: "consumption",
    method: "getAutoSampled",
    numerator: terms(["LT_Compressor_02_4F1(D0)", "LT_Compressor_01_5F1(D0)"]),
    divisor: term(CELL),
  },

  // 7 — N2O2
  7: {
    metric: "consumption",
    method: "getAutoSampled",
    numerator: terms([
      "10KVA_UPS_for_N2O2_block_5F2(D0)",
      "O2N2_Process_Load_2F1(D0)",
    ]),
    divisor: term(CELL),
  },

  // 8 — PEX
  8: {
    metric: "consumption",
    method: "getAutoSampled",
    numerator: terms([
      "Cluster_7_N_S_UPS_O_P_1(D0)",
      "Cluster_3_N_UPS_O_P_1(D0)",
      "Cluster_9_N_S_UPS_O_P_1(D0)",
      "Cluster_13_N_UPS_O_P_1(D0)",
      "Cluster_10_N_S_UPS_O_P_1(D0)",
      "Cluster_5_N_S_UPS_O_P_1(D0)",
      "Cluster_13_S_UPS_O_P_1(D0)",
      "Cluster_1_N_S_UPS_O_P_1(D0)",
      "Cluster_4_S_12_N_S_15_S_UPS_O_P_1(D0)",
      "Cluster_3_S_UPS_O_P_1(D0)",
      "Cluster_4_N_UPS_O_P_1(D0)",
      "Cluster_6_N_S_UPS_O_P_1(D0)",
      "Cluster_11_N_S_UPS_O_P_2(D0)",
      "Cluster_10_N_S(D0)",
      "Cluster_4_S_12_N_S_15_S(D0)",
      "Cluster_9_N_S(D0)",
      "Cluster_13_N(D0)",
      "Cluster_13_S(D0)",
      "Cluster_1_N_S(D0)",
      "Cluster_6_2_N_S(D0)",
      "Cluster_3_N(D0)",
      "Cluster_11_N_S_14N_8_N_S(D0)",
      "Cluster_7_N_S(D0)",
      "Cluster_3_S(D0)",
      "Cluster_5_N_S(D0)",
      "Cluster_4_N(D0)",
      "GAS(D0)",
      "CHEMICAL(D0)",
      "Gas_VFD_Panel_1_Cluster_17(D0)",
      "Chemical_VFD_Panel_2(D0)",
    ]),
    divisor: term(CELL),
  },

  // 9 — ZLD
  9: {
    metric: "consumption",
    method: "getAutoSampled",
    numerator: terms(["ZLD_1(D0)"]),
    divisor: term(CELL),
  },

  // 10 — UPW
  10: {
    metric: "consumption",
    method: "getAutoSampled",
    numerator: terms(["UPW_1(D0)"]),
    divisor: term(CELL),
  },

  // 11 — ETP
  11: {
    metric: "consumption",
    method: "getAutoSampled",
    numerator: terms(["ETP_1(D0)"]),
    divisor: term(CELL),
  },

  // 12 — Lighting
  12: {
    metric: "consumption",
    method: "getAutoSampled",
    numerator: terms(["Lighting_LDB(D0)"]),
    divisor: term(CELL),
  },

  // 13 — Admin
  13: {
    metric: "consumption",
    method: "getAutoSampled",
    numerator: terms(["ADMIN_1(D0)"]),
    divisor: term(CELL),
  },

  // 14 — PGS
  14: {
    metric: "consumption",
    method: "getAutoSampled",
    numerator: terms(["Special_Gas_6F5(D0)"]),
    divisor: term(CELL),
  },

  // 15 — PEN
  15: {
    metric: "consumption",
    method: "getAutoSampled",
    numerator: terms(["PEN_1(D0)"]),
    divisor: term(CELL),
  },

  // 16 — Canteen
  16: {
    metric: "consumption",
    method: "getAutoSampled",
    numerator: terms(["CANTEEN_1(D0)"]),
    divisor: term(CELL),
  },

  // 17 — Fire pump house
  17: {
    metric: "consumption",
    method: "getAutoSampled",
    numerator: terms(["FIRE_PANEL_19F1(D0)"]),
    divisor: term(CELL),
  },

  // 18 — Chemical building
  18: {
    metric: "consumption",
    method: "getAutoSampled",
    numerator: terms(["Chemical_Building_8F4(D0)"]),
    divisor: term(CELL),
  },

  // 19 — STP
  19: {
    metric: "consumption",
    method: "getAutoSampled",
    numerator: terms(["STP_01_16F3(D0)", "STP_02_9F2(D0)"]),
    divisor: term(CELL),
  },

  // 20 — DG AUX and Server Room
  20: {
    metric: "consumption",
    method: "getAutoSampled",
    numerator: terms(["DG_AUXILLARY_A1(D0)"]),
    divisor: term(CELL),
  },

  // 21 — CompressorMain panel (Auxillary: Driyer, CT)
  21: {
    metric: "consumption",
    method: "getAutoSampled",
    numerator: terms(["CompressorMain_panel_Auxillary_Driyer_CT_4F2(D0)"]),
    divisor: term(CELL),
  },

  // 22 — AMMONIA
  22: {
    metric: "consumption",
    method: "getAutoSampled",
    numerator: terms(["Ammonia_8F(D0)"]),
    divisor: term(CELL),
  },

  // 23 — SERVER ROOM
  23: {
    metric: "consumption",
    method: "getAutoSampled",
    numerator: terms(["SERVER_ROOM_A1(D0)"]),
    divisor: term(CELL),
  },

  /* ---- Plain totals: value = Σ consumption (no division) ---- */

  // 43 — rooftop-01 (kWh)
  43: { metric: "consumption", method: "getAutoSampled",
    numerator: terms(["TPSGHTCSS_R1(D370)", "TPSGHTCSS_K1(D247)"]) },

  // 44 — DG-01 (kWh)
  44: { metric: "consumption", method: "getAutoSampled",
    numerator: terms([
      "TPSGHTCSS_R1(D431)", "TPSGHTCSS_T1(D289)", "TPSGHTCSS_V1(D196)",
      "TPSGHTCSS_X1(D339)", "TPSGHTCSS_K1(D317)", "TPSGHTCSS_N1(D235)",
    ]) },

  // 46 — TOT-ENERGY-01 (kWh) — all cell+module+rooftop+DG energy sensors
  46: { metric: "consumption", method: "getAutoSampled",
    numerator: terms([
      "TPSGHTCSS_R1(D161)", "TPSGHTCSS_S1(D296)", "TPSGHTCSS_S1(D469)",
      "TPSGHTCSS_U1(D102)", "TPSGHTCSS_U1(D325)", "TPSGHTCSS_V1(D403)",
      "TPSGHTCSS_W1(D356)", "TPSGHTCSS_Y1(D106)", "TPSGHTCSS_R1(D431)",
      "TPSGHTCSS_T1(D289)", "TPSGHTCSS_V1(D196)", "TPSGHTCSS_X1(D339)",
      "TPSGHTCSS_R1(D370)", "TPSGHTCSS_J1(D389)", "TPSGHTCSS_L1(D59)",
      "TPSGHTCSS_M1(D382)", "TPSGHTCSS_P1(D86)", "TPSGHTCSS_K1(D317)",
      "TPSGHTCSS_N1(D235)", "TPSGHTCSS_K1(D247)",
    ]) },

  // 47 — UPW_IN (kL)
  47: { metric: "consumption", method: "getAutoSampled",
    numerator: terms(["TPSUPWFM_A1(D1)"]) },

  // 50 — influent-001 (kL)
  50: { metric: "consumption", method: "getAutoSampled",
    numerator: terms(["TPSGCZLD_A9(D59)", "TPSGCZLD_A9(D95)"]) },

  // 51 — pretreat-001 (kL)
  51: { metric: "consumption", method: "getAutoSampled",
    numerator: terms(["TPSGCZLD_A5(D55)"]) },

  // 52 — ETP_IN (kL)
  52: { metric: "consumption", method: "getAutoSampled",
    numerator: terms(["TPSETPFM_A1(D1)"]) },

  // 53 — ETP_BD (kL)
  53: { metric: "consumption", method: "getAutoSampled",
    numerator: terms(["TPSETPFM_A1(D29)"]) },

  // 56 — BB_IN (kL)
  56: { metric: "consumption", method: "getAutoSampled",
    numerator: terms(["TPSETPFM_A1(D7)"]) },

  // 61 — STP_CELL_IN (kL)
  61: { metric: "consumption", method: "getAutoSampled",
    numerator: terms(["TPCSTPFM_A1(D1)"]) },

  // 62 — STP_MOD_IN (kL)
  62: { metric: "consumption", method: "getAutoSampled",
    numerator: terms(["TPMSTPFM_A1(D1)"]) },

  // 118 — WC_CELL_SIPCOT (kL)
  118: { metric: "consumption", method: "getAutoSampled",
    numerator: terms(["TPSUPWFM_A1(D1)"]) },

  // 119 — WC_CELL_RES (kL)
  119: { metric: "consumption", method: "getAutoSampled",
    numerator: terms([
      "TPCSTPFM_A1(D5)", "TPSGCZLD_A9(D56)", "TPSGCZLD_A9(D92)",
      "TPSGCZLD_A6(D43)", "TPSETPFM_A1(D3)", "TPSETPFM_A1(D9)",
    ]) },

  // 120 — WC_MOD_SIPCOT (kL)
  120: { metric: "consumption", method: "getAutoSampled",
    numerator: terms(["TPMWTPFM_A1(D1)"]) },

  // 121 — WC_MOD_RES (kL)
  121: { metric: "consumption", method: "getAutoSampled",
    numerator: terms(["TPMSTPFM_A1(D5)", "TPMWTPFM_A1(D3)", "TPMWTPFM_A1(D5)"]) },

  /* ---- Ratio cards: value = Σ numerator / Σ denominator (both deltas) ---- */

  // 122 — UPW_REC
  122: { metric: "consumption", method: "getAutoSampled",
    numerator: terms(["TPSUPWFM_A1(D61)", "TPSUPWFM_A1(D63)", "TPSUPWFM_A1(D65)"]),
    denominator: terms([
      "TPSUPWFM_A1(D37)", "TPSUPWFM_A1(D39)", "TPSUPWFM_A1(D41)",
      "TPSUPWFM_A1(D43)", "TPSUPWFM_A1(D45)", "TPSUPWFM_A1(D47)",
    ]) },

  // 123 — recovery-001
  123: { metric: "consumption", method: "getAutoSampled",
    numerator: terms(["TPSGCZLD_A14(D63)", "TPSGCZLD_A9(D57)", "TPSGCZLD_A9(D93)"]),
    denominator: terms(["TPSGCZLD_A9(D59)", "TPSGCZLD_A9(D95)", "TPSGCZLD_A5(D55)"]) },

  // 124 — thermal-001
  124: { metric: "consumption", method: "getAutoSampled",
    numerator: terms(["TPSGCZLD_A14(D63)"]),
    denominator: terms(["TPSGCZLD_A9(D59)", "TPSGCZLD_A9(D95)"]) },

  // 125 — pretreatrecover-001
  125: { metric: "consumption", method: "getAutoSampled",
    numerator: terms(["TPSGCZLD_A9(D57)", "TPSGCZLD_A9(D93)"]),
    denominator: terms(["TPSGCZLD_A5(D55)"]) },

  // 126 — ETP_BD (recovery ratio)
  126: { metric: "consumption", method: "getAutoSampled",
    numerator: terms(["TPSETPFM_A1(D3)"]),
    denominator: terms(["TPSETPFM_A1(D1)"]) },

  // 127 — BB_REC
  127: { metric: "consumption", method: "getAutoSampled",
    numerator: terms(["TPSETPFM_A1(D9)"]),
    denominator: terms(["TPSETPFM_A1(D7)"]) },

  // 128 — STP_CELL_REC (kL)
  128: { metric: "consumption", method: "getAutoSampled",
    numerator: terms(["TPCSTPFM_A1(D5)"]) },

  // 129 — STP_MOD_REC (kL)
  129: { metric: "consumption", method: "getAutoSampled",
    numerator: terms(["TPMSTPFM_A1(D5)"]) },

  // 132 — WTP_TREATED (kL)
  132: { metric: "consumption", method: "getAutoSampled",
    numerator: terms(["TPMWTPFM_A1(D3)", "TPMWTPFM_A1(D5)"]) },
};

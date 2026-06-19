# IOsense Integration — API / Tag Mapping

Tracks the IOsense device/sensor configuration behind each dashboard card and
the fetch method used.

## Fetch-method rule
- **Consumption** metrics (energy, SEC, HVAC, CDA, etc.) → **`getAutoSampled`**.
  Applied throughout the dashboard for any `metric: "consumption"` card.
- Production normalisers (`*_PRODUCTION_A1`) are used as the divisor for SEC-type
  cards: `value = Σ(consumption sensors) / production`.

## Configured cards
Config lives in [`frontend/src/lib/cardConfigs.ts`](frontend/src/lib/cardConfigs.ts),
keyed by sheet row.

| Row | Card | # numerator sensors | Divisor | Method |
|----:|------|--------------------:|---------|--------|
| 1 | SEC Cell | 13 | CELL_PRODUCTION_A1(D0) | getAutoSampled |
| 2 | SEC Module | 7 | MODULE_PRODUCTION_A1(D0) | getAutoSampled |
| 3 | HVAC-HT | 7 | CELL_PRODUCTION_A1(D0) | getAutoSampled |
| 4 | HVAC-LT | 61 | CELL_PRODUCTION_A1(D0) | getAutoSampled |
| 5 | CDA-HT | 3 | CELL_PRODUCTION_A1(D0) | getAutoSampled |
| 6 | CDA-LT | 2 | CELL_PRODUCTION_A1(D0) | getAutoSampled |
| 7 | N2O2 | 2 | CELL_PRODUCTION_A1(D0) | getAutoSampled |
| 8 | PEX | 30 | CELL_PRODUCTION_A1(D0) | getAutoSampled |
| 9 | ZLD | 1 | CELL_PRODUCTION_A1(D0) | getAutoSampled |
| 10 | UPW | 1 | CELL_PRODUCTION_A1(D0) | getAutoSampled |
| 11 | ETP | 1 | CELL_PRODUCTION_A1(D0) | getAutoSampled |
| 12 | Lighting | 1 | CELL_PRODUCTION_A1(D0) | getAutoSampled |
| 13 | Admin | 1 | CELL_PRODUCTION_A1(D0) | getAutoSampled |
| 14 | PGS | 1 (Special_Gas_6F5) | CELL_PRODUCTION_A1(D0) | getAutoSampled |
| 15 | PEN | 1 | CELL_PRODUCTION_A1(D0) | getAutoSampled |
| 16 | Canteen | 1 | CELL_PRODUCTION_A1(D0) | getAutoSampled |
| 17 | Fire pump house | 1 (FIRE_PANEL_19F1) | CELL_PRODUCTION_A1(D0) | getAutoSampled |
| 18 | Chemical building | 1 | CELL_PRODUCTION_A1(D0) | getAutoSampled |
| 19 | STP | 2 | CELL_PRODUCTION_A1(D0) | getAutoSampled |
| 20 | DG AUX and Server Room | 1 | CELL_PRODUCTION_A1(D0) | getAutoSampled |
| 21 | CompressorMain panel | 1 | CELL_PRODUCTION_A1(D0) | getAutoSampled |
| 22 | AMMONIA | 1 | CELL_PRODUCTION_A1(D0) | getAutoSampled |
| 23 | SERVER ROOM | 1 | CELL_PRODUCTION_A1(D0) | getAutoSampled |

(Full sensor lists are in `cardConfigs.ts`.)

Mapping notes: rows 4–5 were configured earlier; rows 6–23 added from the
second batch. Row 14 (PGS) ← meter `Special_Gas_6F5`; row 17 (Fire pump house)
← `FIRE_PANEL_19F1`; row 8 (PEX) ← Cluster/GAS/CHEMICAL VFD panels.

## Formula cards (custom arithmetic)
Config lives in [`FORMULA_CONFIGS`](frontend/src/lib/cardConfigs.ts); computed by
`computeFormulaValue` in [`frontend/src/lib/iosense.ts`](frontend/src/lib/iosense.ts).

### Row 82 — CH_CELL_01 (kW/TR): Σ of 7 chillers
Per chiller: `contribution = consumption ÷ TR`, summed. **consumption** = the
power meter's last−first delta. **TR** (tons of refrigeration) is
running-hours-weighted, computed by `chillerTR` in
[`iosense.ts`](frontend/src/lib/iosense.ts):

- `instantaneous TR = trBase × (avg inlet − avg outlet) ÷ 3.024` (trBase = 810).
- Bucket the window by the selected period; per bucket `bucketTR = trBase × (bucket-avg inlet − bucket-avg outlet) ÷ 3.024`, weighted by `bucketRunningHours` (time-weighted hours where status D37 == 1).
- `TR = Σ(bucketTR × bucketRunningHours) ÷ Σ runningHours`; falls back to the whole-window instantaneous TR when running hours = 0.
- Temperatures are averaged **then** subtracted (never per-sample ΔT). 3.024 is fixed.

| # | Power meter | TR inlet | TR outlet | Status |
|--:|-------------|----------|-----------|--------|
| 1 | TPSGHTCSS_W1(D410) | TPSLCH_A(D16) | TPSLCH_A(D22) | TPSLCH_A(D37) |
| 2 | TPSGHTCSS_W1(D462) | TPSLCH_B(D8)  | TPSLCH_B(D14) | TPSLCH_B(D37) |
| 3 | TPSGHTCSS_X1(D72)  | TPSLCH_C(D9)  | TPSLCH_C(D15) | TPSLCH_C(D37) |
| 4 | TPSGHTCSS_X1(D180) | TPSLCH_D(D9)  | TPSLCH_D(D15) | TPSLCH_D(D37) |
| 5 | TPSGHTCSS_X1(D447) | TPSLCH_E(D9)  | TPSLCH_E(D15) | TPSLCH_E(D37) |
| 6 | TPSGHTCSS_Y1(D214) | TPSLCH_F(D9)  | TPSLCH_F(D15) | TPSLCH_F(D37) |
| 7 | TPSGHTCSS_Y1(D268) | TPSLCH_G(D9)  | TPSLCH_G(D15) | TPSLCH_G(D37) |

Caveat: running hours are integrated over the downsampled status series
(~240 pts/window). For exact reference-matching, the status sensor may need
finer sampling.

### Row 83 — CH_MOD_01 (kW/TR): Σ of 4 chillers
Per chiller: `consumption ÷ TR`. TR is running-hours-weighted (same algorithm as
CH_CELL_01), `TR = 810 × (avg inlet D25 − avg outlet D26) ÷ 3.024`; trBase = 810,
divisor 3.024 fixed. Status flag = **D0** (1 = Running).

| # | Power meter | Inlet (D25) | Outlet (D26) | Status (D0) |
|--:|--------------|----------|----------|----------|
| 1 | TPSGHTCSS_M1(D442) | TPSGMHVAC_A14(D25) | TPSGMHVAC_A14(D26) | TPSGMHVAC_A14(D0) |
| 2 | TPSGHTCSS_N1(D2)   | TPSGMHVAC_A15(D25) | TPSGMHVAC_A15(D26) | TPSGMHVAC_A15(D0) |
| 3 | TPSGHTCSS_N1(D295) | TPSGMHVAC_A16(D25) | TPSGMHVAC_A16(D26) | TPSGMHVAC_A16(D0) |
| 4 | TPSGHTCSS_P1(D206) | TPSGMHVAC_A17(D25) | TPSGMHVAC_A17(D26) | TPSGMHVAC_A17(D0) |

## Status
- Configuration: **stored** in the cards (demo source replaced).
- Live values: **pending connection** — needs IOsense base URL + credentials
  (see `.env.example`) and/or the `iosense-sdk` MCP reconnected so the exact
  `getAutoSampled` signature can be confirmed. Cards show a **LIVE** badge and a
  "—" placeholder until then.

## TODO to go live
1. Provide IOsense base URL + login credentials in `frontend/.env`.
2. Confirm `getAutoSampled(deviceId, sensorId, startTime, endTime, …)` signature.
3. Implement `src/services/iosense.ts` (login → token → getAutoSampled) and a
   server route to compute `Σ numerator / divisor` per card config.

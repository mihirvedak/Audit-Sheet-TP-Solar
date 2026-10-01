# IOsense Integration — API / Tag Mapping

Tracks the IOsense device/sensor configuration behind each dashboard card and
the fetch method used.

## Fetch-method rule
- **Consumption** metrics (energy, SEC, HVAC, CDA, etc.) → **`getAutoSampled`**.
  Applied throughout the dashboard for any `metric: "consumption"` card.
- Production normalisers (`*_PRODUCTION_A1`) are used as the divisor for SEC-type
  cards: `value = Σ(consumption sensors) / production`.

## Live Data cards — latest data point (not windowed)
- Endpoint: `PUT /account/deviceData/getLastDPsofDevicesAndSensorProcessed`
  body `{ devices: [{ devID, sensor }] }` → `{ devID, sensor, time, value, unit }`
  per pair. A sensor that never reported returns `time`/`value` = `"N/A"` (dropped).
- Called via `POST /api/iosense { pairs, latest: true }` (`fetchLatest` in
  [`iosense.ts`](frontend/src/lib/iosense.ts)); polled every **60 s** and
  independent of the Duration picker. Auth failures return **401** (not empty data).
- Freshness rule (`liveReading`, `LIVE_FRESH_MS`): a reading **≤ 1 hour old** is
  fresh. If a sensor has no fresh reading the card gets a **red border** and
  still shows the **last reading received** with its timestamp (`NA` only if the
  sensor never reported). Multi-sensor cards (average / scalePct) use the fresh
  sensors when any exist, else the last readings of all sensors.
- This endpoint does **not** count toward the device rate limit below (verified
  2026-09-28: 5 × 24-device calls, windowed call still accepted).
- **PGS Live tab** (rows 166–232) uses the same endpoint, configured by label in
  `PGS_LIVE_CONFIGS` ([`liveConfigs.ts`](frontend/src/lib/liveConfigs.ts)):
  47 cards on devices `TPSGCPGS_A1…A9` (SIL→A3, NH3→A1, NO2→A2, TMA→A8,
  CH4→A4, H2→A5, PH3→A6, AR→A7, BCL3→A9). Units follow the sheet row-for-row
  (`PGS_LIVE_UNIT` in dashboardData.ts): **psi** by default, **Online/Standby**
  on 21 cards, **bar** on CH4_P2_STS/IN. Pump-status cards have no sensor in the sheet → NA, except
  `TMA_P2_STS` = A8·D3 (same pair as `TMA_P2_IN`). `NO2_P2_STS` (D3) and
  `NO2_P3_STS` (D4) list a sensor but no device → left unconfigured.
- **PGS Consumption tab** (rows 233–247) is windowed (`getAutoDownSampledData`),
  configured by label in `PGS_CONSUMPTION_CONFIGS`
  ([`cardConfigs.ts`](frontend/src/lib/cardConfigs.ts)), `op: "latest"` = latest
  weight in the window: TMA_WT_01/02 = A8·D2/D5, BCL3_WT_01–04 = A9·D2–D5 (kg).
  The 9 `*_CONS_01` cards have no sensor yet → NA. Units kg, PH3/AR_CONS_01 m³.

## IOsense device rate limit (windowed data)
- `getAutoDownSampledData` allows **100 devices per 30-second window** per
  account. Over the limit it answers **HTTP 200** with `success: false` and
  `"Device rate limit exceeded … Retry after N seconds"` — i.e. empty data.
- The consumption tab needs **253 pairs / 189 devices**, so a single page load
  cannot fetch them all within one window; rejected chunks show as `NA`.
- **Fixed 2026-10-01** (`iosenseServer.ts`): every chunk passes a server-wide
  budget of **90 devices / 30 s** (`acquireDevices`); a rate-limit refusal still
  slipping through waits the advised "Retry after N" and retries (≤ 4×). A full
  consumption load now completes in ~70 s instead of leaving most cards NA.
- **Token order:** `IOSENSE_TOKEN` (.env) is tried first; once it 401s it is
  marked dead and the portal-exchanged Bearer in `frontend/.iosense-auth-token`
  is used. Shrinking retries are skipped on a 401 so a dead token doesn't burn
  the rate budget.

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

### Row 84 — CA_CELL_01 (kWh/m³): compressed-air specific energy
`Σ consumption(meters) ÷ ( 60 × runHours(TPSGCCDA_C3 D1 > 1) × (avg D1 + avg D3) )`.
Numerator = boundary-anchored consumption of the energy meters; denominator =
air volume (avg flow × 60 min/hr × hours the flow gate D1 exceeds 1).

| Part | Sensors |
|------|---------|
| Numerator (Σ consumption) | TPSGHTCSS_Y1(D160), TPSGHTCSS_Y1(D1), TPSGHTCSS_X1(D126) |
| Flow (avg × 60 × hrs) | TPSGCCDA_C3(D1), TPSGCCDA_C3(D3) |
| Running-hours gate | TPSGCCDA_C3(D1) > 1 |

### Row 85 — CA_MOD_01 (kWh/m³): compressed-air specific energy (module)
`Σ consumption(meters) ÷ ( 60 × runHours(TPSGMCDA_C3 D1 > 1) × avg D1 )`.

| Part | Sensors |
|------|---------|
| Numerator (Σ consumption) | TPSGHTCSS_N1(D62), TPSGHTCSS_P1(D146), TPSGHTCSS_N1(D355) |
| Flow (avg × 60 × hrs) | TPSGMCDA_C3(D1) |
| Running-hours gate | TPSGMCDA_C3(D1) > 1 |

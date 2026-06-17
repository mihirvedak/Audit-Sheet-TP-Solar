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

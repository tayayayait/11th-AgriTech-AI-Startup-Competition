# Phase 10 API Connection

## Scope

This phase connects the public API layer through Supabase Edge Function proxies and keeps service keys out of browser code.

## Environment Variables

Local development uses `.env`. Committable examples use `.env.example`.

Server-only variables:

- `NONGSARO_API_KEY`
- `NONGSARO_CROP_EBOOK_API_KEY` (optional, used for `cropEbook` when the key is service-specific)
- `NONGSARO_BASE_URL`
- `NCPMS_API_KEY`
- `NCPMS_BASE_URL`
- `PSIS_API_KEY`
- `PSIS_BASE_URL`
- `KMA_SERVICE_KEY`
- `KMA_BASE_URL`
- `STANDARD_REGION_API_KEY`
- `STANDARD_REGION_BASE_URL`
- `FARMMAP_API_KEY`
- `FARMMAP_DOMAIN`
- `FARMMAP_BASE_URL`
- `FARMMAP_WFS_URL`
- `FARMMAP_TEST_PNU`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `GEMINI_BASE_URL`

Do not add `VITE_` prefixes to external API keys. Browser code must call the existing service clients, which invoke Supabase Edge Function proxies.

Current Farmmap issued domain:

```text
FARMMAP_DOMAIN=http://10.98.195.97:8080/
```

The app must be opened through the issued host/port when testing browser-side Farmmap map SDK behavior. Opening the same Vite app through `localhost` does not match the issued Farmmap domain.

## Edge Function Policy

- `nongsaro-proxy` allows only approved Nongsaro services and operation names.
- `npms-proxy` allows only approved NCPMS service codes and injects `NCPMS_API_KEY` server-side.
- `psis-proxy` allows only PSIS pesticide registration service codes `SVC01` and `SVC02`, injects `PSIS_API_KEY` server-side, and normalizes XML responses to JSON.
- `kma-proxy`, `standard-region-proxy`, `farmmap-proxy`, and `gemini-proxy` read keys from server environment variables.
- `standard-region-proxy` calls the Ministry of the Interior and Safety standard legal-dong code API and returns active legal district rows for `bjdCd` selection.
- `farmmap-proxy` supports the `sdkScript` POST operation and returns the Farmmap browser SDK script without exposing `FARMMAP_API_KEY` to source code. It also supports `searchRegionExtent` for server-side Farmmap WFS extent lookup because the GeoServer endpoint does not expose browser CORS headers.
- `gemini-proxy` defaults to `gemini-3-flash-preview`.

## Field Map Region Filters

The field map region filter uses:

1. `standard-region-proxy` POST body `{ "operation": "list" }` to load active legal district codes.
2. The selected final legal district code as the Farmmap `bjdCd` 10-digit parameter.
3. `farmmap-proxy` POST body `{ "operation": "searchBjdAndLandCode", "params": { "bjdCd": "...", "landCd": "01", "mapType": "farmmap", "columnType": "KOR", "apiVersion": "v3" } }`.

`STANDARD_REGION_BASE_URL` follows the official public data portal request address: `http://apis.data.go.kr/1741000/StanReginCd`.

Farmmap land classification codes used in the UI:

- `01`: 논
- `02`: 밭
- `03`: 과수
- `04`: 시설
- `06`: 비경지

The UI `전체(논, 밭, 과수, 시설)` option calls Farmmap once per code for `01`, `02`, `03`, and `04`, then merges the results. It excludes `06` unless the user explicitly selects `비경지`.

## Farmmap Map SDK

The field map screen loads:

1. `https://agis.epis.or.kr/ASD/pub2/js/jquery-3.4.1.js`
2. `https://agis.epis.or.kr/ASD/js/lib/openlayers/OpenLayers.js`
3. `https://agis.epis.or.kr/ASD/js/lib/proj4js/proj4.js`
4. `farmmap-proxy` POST body `{ "operation": "sdkScript" }`, executed as an inline script after the proxy returns it.

After these scripts load, `FarmmapView` calls `farmmapObj.init(mapDivId)`, adds the Farmmap base layer, and renders Farmmap search results as `EPSG:4326` markers.

On the field map screen, the land classification filter is applied to both the map layer and the listed fields. `FarmmapView` renders the Farmmap GeoServer WMS layer with a `CQL_FILTER` on `clsf_nm` for the selected land codes. When a legal district is selected, the WMS filter also includes `stdg_cd` so the overlay is scoped to that legal-dong code. Returned Farmmap `geometry[0].xy` polygons are drawn on top with the Farmmap classification colors.

The field map screen is a Farmmap information search surface, not a registered-field surface. It does not use locally registered fields or the top header selected field for its field list. Legal-district filtering can only recenter when Farmmap WFS returns at least one field geometry. The standard legal-dong code API does not provide coordinates, so a selected district with zero Farmmap geometries cannot be used as a map center by itself.

The filter panel exposes a `선택 조건으로 지도 이동` action. It is enabled after any legal district level has been selected. Clicking it always calls `farmmap-proxy` with `searchRegionExtent`, uses a `stdg_cd` range filter for the selected administrative prefix plus the selected `clsf_nm` values, zooms to the returned WFS geometry extent, and builds the below field list from the returned WFS `features[].properties` and geometry centroid. The list is capped by the proxy request's `maxFeatures` value.

The result area is a two-panel layout. The left panel shows `필지목록`; clicking a field selects it and zooms the map to that field's Farmmap polygon extent. If polygon geometry is unavailable, the map falls back to the field coordinate as a close zoom focus target. The right panel shows `팜맵 정보` for the selected field, including classification, area, cadastral match rate, aerial photo year, update year, and representative address. It also shows `연계 지적 정보`, including land category, cadastral area, ownership type, and PNU. Cultivation analysis fields are not displayed because the current upstream analysis endpoint does not return reliable values in local verification.

## API Smoke Test

Run:

```bash
npm run api:smoke
```

The smoke script checks:

1. Nongsaro weekly farm info
2. Nongsaro pest occurrence year/list
3. Nongsaro work schedule group/list/detail
4. Nongsaro pesticide safety manual
5. Nongsaro disaster prevention year/list
6. KMA ultra short actual and village forecast
7. Gemini JSON text generation
8. Standard region legal-dong code lookup when `STANDARD_REGION_API_KEY` is set
9. Farmmap PNU lookup when `FARMMAP_TEST_PNU` is set
10. NCPMS integrated pest search when `NCPMS_API_KEY` is set
11. PSIS pesticide registration search when `PSIS_API_KEY` is set

The script prints status only and does not print API keys or full upstream responses.

The smoke script loads the project `.env` directly and lets those values override stale shell or Windows user environment variables. This keeps local API checks tied to the current workspace configuration.

Gemini smoke generation uses `maxOutputTokens: 900`. `gemini-3-flash-preview` can spend output budget on thinking tokens before producing visible text, so very low limits such as 80 can return HTTP 200 with `MAX_TOKENS` and empty content.

## Verification Gate

Before marking API integration complete, run:

```bash
npm test
npm run lint
npm run api:smoke
npm run build
```

Build note: this Windows Node environment crashed when Vite performed its default `dist` empty step. The project now runs `scripts/clean-dist.mjs` as `prebuild` and calls Vite with `--emptyOutDir=false`, so `npm run build` still produces a fresh `dist` without relying on Vite's cleanup path.

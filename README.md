# Flood Depth: flood exposure from terrain alone

**The problem:** in most of the world, nobody can say which ground floods, how deep, how likely, and what's on it. The reason is missing data: no river gauges, no surveyed cross-sections, no hydraulic models.

**The tool:** Flood Depth answers those questions in a browser, for any place on Earth, from a single free global elevation model. Where better data exists (a LiDAR DEM, one gauged discharge, a local rainfall statistic), it plugs straight in.

The same question matters across sectors:

| Sector | Use |
| --- | --- |
| Disaster risk / humanitarian | Anticipatory action, evacuation planning, pre-positioning, damage triage |
| Health | Facilities and water points at risk; waterborne-disease hotspots |
| Agriculture | Field siting, waterlogging risk, flood-recession farming zones |
| Infrastructure / energy | Screening roads, substations and pipelines for flood exposure |
| Urban planning | Where not to build; drainage priorities in informal settlements |
| Insurance / finance | Portfolio flood screening where no commercial flood maps exist |

## Run it

All tools are free and open, with no API keys or accounts. Node.js is used only to serve static files.

```bash
node server.js
```

Then open http://localhost:8080. Any static web server also works (`python -m http.server 8080`).

## Workflow

1. **Area & terrain**: draw a box, use the map view, pick an example site, or upload your own GeoTIFF DEM. *Run terrain analysis* conditions the DEM, routes flow, extracts streams, computes HAND and builds a synthetic rating curve for every reach (typically 1–3 s).
2. **Flood scenario**: choose how the flood is defined:
   - *Water level*: uniform stage above the channel.
   - *Design rainfall*: 24-h rainfall depth + land cover → Rational-method discharge per reach.
   - *Known discharge*: one reported/gauged peak, transferred to all reaches by drainage-area ratio.
   Depth, probability and statistics update live as you move the sliders.
3. **Exposure**: pulls buildings and critical facilities (health, schools, water points, police, markets…) from OpenStreetMap and scores each for depth and probability.
4. **Layers & export**: hillshade, HAND, streams, flood depth/probability. Export DEM/HAND/depth/probability as GeoTIFF (EPSG:3857), reaches with rating curves as GeoJSON, and exposure as CSV.

Click any stream for its rating curve, or anywhere on the map for a point readout.

## Scientific basis

| Step | Method | Reference |
| --- | --- | --- |
| Depression filling | Priority-Flood + ε (guarantees drainage, no flats) | Barnes et al. 2014, *Computers & Geosciences* |
| Stream burning | Mapped OSM rivers lowered 10 m in the routing surface; HAND measured on un-burned surface | Hellweger 1997 (AGREE) |
| Flow routing | D8 steepest descent; topological accumulation | O'Callaghan & Mark 1984 |
| Terrain descriptor | Height Above Nearest Drainage (HAND) | Rennó et al. 2008; Nobre et al. 2011 |
| Stage–discharge | Synthetic rating curves from HAND + Manning | Zheng, Tarboton et al. 2018, *JAWRA*; used in NOAA NWM inundation mapping (Liu et al. 2018) |
| Design discharge | Rational method, Kirpich t<sub>c</sub>, IMD short-duration ratio, Leclerc–Schaake ARF | Kirpich 1940; Leclerc & Schaake 1972 |
| Ungauged transfer | Drainage-area ratio Q·(A/A<sub>ref</sub>)<sup>b</sup> | standard regional practice |
| Uncertainty | P(flood) = Φ((h − HAND)/σ), σ = DEM/HAND vertical error | — |
| Slope / hillshade | Horn 1981 | — |

Rating curve per reach at stage *h*, over cells in the reach catchment with HAND < h:

```
V  = Σ (h − HAND_i)·A_i           A  = V / L
Ab = Σ A_i·√(1 + slope_i²)        P  = Ab / L,  R = A / P
Q  = (1/n)·A·R^(2/3)·S^(1/2)
```

Curves are built once for n = 1. Q scales exactly with 1/n, so Manning's n changes instantly.

### Validation in this repo

A synthetic V-valley with an analytic solution (see the test run during development) gives:
- HAND within 0.06 m of the analytic value across 10,530 cells, including a filled pit;
- rating-curve inversion exact (stage → Q → stage = 2.000 m);
- synthetic Q within the expected cell-discretisation error of Manning's analytic triangular-channel solution.

GeoTIFF exports were read back with geotiff.js (correct EPSG:3857 keys, bounds and nodata). Feeding the exported DEM back in as an upload reproduces the online result exactly.

### Why it works in data-sparse environments

- **Only a DEM is required.** The default global DEM (AWS Terrain Tiles: SRTM / GMTED / ETOPO1 / NED) needs no download, sign-up or key.
- **Every extra input is optional and local-knowledge-friendly:** one flood mark (→ *Water level*), one reported peak flow (→ *Known discharge*), or one rainfall statistic (→ *Design rainfall*).
- **Uncertainty is explicit.** The probability map widens with σ, so a coarse DEM gives an honest, wider "plausible" zone instead of false precision.
- **Better data drops in:** upload Copernicus GLO-30, FABDEM (forest/building-removed) or LiDAR in EPSG:4326, 3857 or WGS84 UTM.
- **Exposure from community mapping:** OSM building coverage in much of Africa and Asia comes from HOT / Missing Maps volunteers.
- **Runs on a laptop in a browser**, with all computation client-side.

### Limitations (read before use)

- HAND is a steady-state, network-connected "bathtub" method. It ignores backwater, flood-wave attenuation, levees narrower than a DEM cell, and coastal surge.
- DEMs see the water surface, not the bed, so channel conveyance is under-estimated at low stages.
- SRTM-derived elevations include canopy and buildings. Prefer FABDEM where you can, and set σ ≥ 2 m for SRTM.
- Only catchment area inside the analysis box is counted. For large rivers entering from outside, use *Known discharge*.
- The Rational method is intended for catchments below ~50 km² and will warn above that.
- This is a **screening** tool for prioritisation and early action, not a substitute for hydraulic modelling in engineering design.

## Free and open components

| Component | Licence / terms |
| --- | --- |
| [Leaflet](https://leafletjs.com) 1.9.4 | BSD-2 |
| [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (Tilezen/Mapzen) | Open data; see attribution list |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) + [Overpass API](https://overpass-api.de) | ODbL; free public endpoint, fair use |
| [OpenTopoMap](https://opentopomap.org) | CC-BY-SA |
| [Sentinel-2 cloudless 2016](https://s2maps.eu) by EOX | CC BY 4.0 |
| [geotiff.js](https://geotiffjs.github.io) 2.1.3 (only loaded for uploads) | MIT |

## Project layout

```
index.html        UI and in-app Method notes with references
css/style.css     Styles (light/dark, responsive)
js/app.js         Map, area selection, scenarios, exposure, exports
js/worker.js      Web Worker: DEM loading/resampling, pipeline orchestration, rendering
js/hydro.js       Hydrology core (pure functions): fill, D8, accumulation, HAND, rating curves
js/geo.js         Web Mercator & UTM maths, minimal GeoTIFF writer
server.js         Zero-dependency static server
```

## Ideas for extension

- Validate extents against Sentinel-1 flood maps (e.g. Copernicus GFM) and report the Critical Success Index.
- Use WorldPop population grids for people exposed, not just buildings.
- Use CHIRPS-derived rainfall return levels per location instead of user input.
- Add an upstream-inflow boundary condition for rivers entering the box.

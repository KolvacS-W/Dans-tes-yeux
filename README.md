# Quebec Cities Circular Temperature Chart (p5.js)

This sketch renders a circular line chart where:
- angle dimension (x-axis semantics): Quebec cities
- radius (y-axis): average temperature for selected year + month

Controls:
- Year slider
- Month slider

## Dataset (local at runtime)

Source: Open-Meteo Historical Weather API
- Docs: https://open-meteo.com/en/docs/historical-weather-api
- Endpoint: `https://archive-api.open-meteo.com/v1/archive`
- Variable: `daily=temperature_2m_mean`
- Aggregate in local file: monthly mean from daily means

Local file used by the sketch:
- `data/quebec_city_monthly_temps_2000_2025.json`

## Refresh local dataset

```bash
node scripts/download_quebec_temps.mjs
```

## Run

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000`.

# Quebec Temperature Flow Portrait (p5.js)

Flow-field generative artwork built from Quebec city yearly average temperatures.

- Threads start from the top of the canvas
- A flow field bends them downward
- The strands are attracted to a data-defined figure shape for the selected year

## Dataset

Source: Open-Meteo Historical Weather API
- Docs: https://open-meteo.com/en/docs/historical-weather-api
- Endpoint: `https://archive-api.open-meteo.com/v1/archive`
- Variable: `daily=temperature_2m_mean`

Local file used at runtime:
- `data/quebec_city_yearly_temps_2000_2025.json`

## Refresh dataset (optional)

```bash
node scripts/download_quebec_temps.mjs
```

## Run

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000`.

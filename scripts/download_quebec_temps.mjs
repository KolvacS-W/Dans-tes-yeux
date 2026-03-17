import fs from "node:fs/promises";
import path from "node:path";

const START_YEAR = 2000;
const END_YEAR = 2025;

const QUEBEC_CITIES = [
  { name: "Montreal", latitude: 45.5019, longitude: -73.5674 },
  { name: "Quebec City", latitude: 46.8139, longitude: -71.2082 },
  { name: "Laval", latitude: 45.6066, longitude: -73.7124 },
  { name: "Gatineau", latitude: 45.4765, longitude: -75.7013 },
  { name: "Longueuil", latitude: 45.5312, longitude: -73.5181 },
  { name: "Sherbrooke", latitude: 45.4042, longitude: -71.8929 },
  { name: "Saguenay", latitude: 48.4281, longitude: -71.0686 },
  { name: "Levis", latitude: 46.7382, longitude: -71.2465 },
  { name: "Trois-Rivieres", latitude: 46.343, longitude: -72.5434 },
  { name: "Terrebonne", latitude: 45.693, longitude: -73.6313 },
  { name: "Saint-Jean-sur-Richelieu", latitude: 45.3071, longitude: -73.2625 },
  { name: "Repentigny", latitude: 45.7422, longitude: -73.4501 }
];

const OUTPUT_PATH = path.join(process.cwd(), "data", `quebec_city_monthly_temps_${START_YEAR}_${END_YEAR}.json`);
const MIN_429_DELAY_MS = 15000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithBackoff(url, maxRetries = 10) {
  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      const response = await fetch(url);
      if (response.status !== 429) {
        return response;
      }

      const retryAfter = Number(response.headers.get("Retry-After"));
      const serverDelay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : null;
      const backoffDelay = 1200 * Math.pow(2, attempt);
      const jitter = Math.floor(Math.random() * 350);
      const delay = Math.max(serverDelay ?? backoffDelay + jitter, MIN_429_DELAY_MS);

      if (attempt === maxRetries) {
        return response;
      }

      process.stdout.write(`Rate-limited. Retry in ${Math.round(delay / 1000)}s (attempt ${attempt + 1}/${maxRetries})...\n`);
      await sleep(delay);
      attempt += 1;
      continue;
    } catch (err) {
      if (attempt === maxRetries) {
        throw err;
      }

      const delay = 1000 * Math.pow(2, attempt) + Math.floor(Math.random() * 200);
      process.stdout.write(`Network error. Retry in ${Math.round(delay / 1000)}s (attempt ${attempt + 1}/${maxRetries})...\n`);
      await sleep(delay);
      attempt += 1;
      continue;
    }
  }

  throw new Error("Unexpected retry loop exit.");
}

function computeMonthlyAverages(times, temps) {
  const accum = {};

  for (let i = 0; i < times.length; i++) {
    const value = temps[i];
    if (!Number.isFinite(value)) continue;

    const year = Number(times[i].slice(0, 4));
    const month = Number(times[i].slice(5, 7));

    if (!accum[year]) accum[year] = {};
    if (!accum[year][month]) accum[year][month] = { sum: 0, count: 0 };

    accum[year][month].sum += value;
    accum[year][month].count += 1;
  }

  const monthly = {};
  for (const year of Object.keys(accum)) {
    monthly[year] = {};
    for (const month of Object.keys(accum[year])) {
      const { sum, count } = accum[year][month];
      monthly[year][month] = count ? Number((sum / count).toFixed(4)) : null;
    }
  }

  return monthly;
}

async function fetchCityMonthly(city) {
  const url = new URL("https://archive-api.open-meteo.com/v1/archive");
  url.searchParams.set("latitude", city.latitude);
  url.searchParams.set("longitude", city.longitude);
  url.searchParams.set("start_date", `${START_YEAR}-01-01`);
  url.searchParams.set("end_date", `${END_YEAR}-12-31`);
  url.searchParams.set("daily", "temperature_2m_mean");
  url.searchParams.set("timezone", "America/Toronto");

  const response = await fetchWithBackoff(url.toString());
  if (!response.ok) {
    throw new Error(`Failed loading ${city.name}: HTTP ${response.status}`);
  }

  const data = await response.json();
  const times = data?.daily?.time || [];
  const temps = data?.daily?.temperature_2m_mean || [];

  return {
    city: city.name,
    latitude: city.latitude,
    longitude: city.longitude,
    monthly: computeMonthlyAverages(times, temps)
  };
}

async function main() {
  let rows = [];

  try {
    const existingRaw = await fs.readFile(OUTPUT_PATH, "utf8");
    const existing = JSON.parse(existingRaw);
    if (Array.isArray(existing?.cities)) {
      rows = existing.cities;
      process.stdout.write(`Found existing file with ${rows.length} cached cities, resuming...\n`);
    }
  } catch (_err) {
    // No existing file; start fresh.
  }

  for (let i = 0; i < QUEBEC_CITIES.length; i++) {
    const city = QUEBEC_CITIES[i];
    if (rows.some((row) => row.city === city.name)) {
      process.stdout.write(`Skipping ${city.name}, already cached.\n`);
      continue;
    }
    process.stdout.write(`Fetching ${city.name} (${i + 1}/${QUEBEC_CITIES.length})...\n`);
    const row = await fetchCityMonthly(city);
    rows.push(row);
    await writePayload(rows);
    await sleep(700);
  }

  await writePayload(rows);
  process.stdout.write(`Saved dataset to ${OUTPUT_PATH}\n`);
}

async function writePayload(rows) {
  const payload = {
    source: "Open-Meteo Historical Weather API",
    endpoint: "https://archive-api.open-meteo.com/v1/archive",
    variable: "daily.temperature_2m_mean",
    aggregate: "monthly_mean_from_daily_mean",
    units: "deg C",
    timezone: "America/Toronto",
    startYear: START_YEAR,
    endYear: END_YEAR,
    generatedAt: new Date().toISOString(),
    cities: rows
  };

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

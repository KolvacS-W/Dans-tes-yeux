const DATA_FILE = "./data/quebec_city_monthly_temps_2000_2025.json";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

let QUEBEC_CITIES = [];
let cityMonthlyAvg = {};
let availableYears = [];
let selectedYear = 2020;
let selectedMonth = 1;
let yearSlider;
let monthSlider;
let loading = true;
let loadError = null;
let loadingMessage = "Loading local dataset...";
let dataMeta = null;
let globalTempMin = null;
let globalTempMax = null;

function setup() {
  const container = document.getElementById("app");
  const canvas = createCanvas(getCanvasWidth(), 660);
  canvas.parent(container);

  yearSlider = createSlider(2000, 2025, selectedYear, 1);
  yearSlider.parent(container);
  yearSlider.addClass("p5Slider");
  yearSlider.input(() => {
    selectedYear = yearSlider.value();
  });

  monthSlider = createSlider(1, 12, selectedMonth, 1);
  monthSlider.parent(container);
  monthSlider.addClass("p5Slider");
  monthSlider.input(() => {
    selectedMonth = monthSlider.value();
  });

  positionSliders();
  loadTemperatureData();
}

function draw() {
  background("#f9fcff");

  if (loading) {
    drawHeader();
    drawCenteredText(loadingMessage, 0.5);
    return;
  }

  if (loadError) {
    drawHeader();
    drawCenteredText(loadError, 0.5);
    return;
  }

  drawHeader();
  drawChart();
}

function drawHeader() {
  fill("#0e2a47");
  noStroke();
  textAlign(LEFT, TOP);
  textSize(24);
  text("Quebec Cities: Circular Monthly Temperature", 40, 24);

  textSize(14);
  fill("#315379");
  text(`Year: ${selectedYear}`, 42, 58);
  text(`Month: ${MONTH_NAMES[selectedMonth - 1]}`, 42, 78);

  if (dataMeta) {
    text(`Source: ${dataMeta.source} (${dataMeta.startYear}-${dataMeta.endYear})`, 42, 98);
  } else {
    text("Source: local pre-downloaded dataset", 42, 98);
  }

  textSize(11);
  fill("#48688c");
  text("Y-axis (radius) is fixed across all years and months.", 42, 118);
}

function drawCenteredText(message, yRatio) {
  fill("#2d4f75");
  textAlign(CENTER, CENTER);
  textSize(16);
  text(message, width / 2, height * yRatio);
}

function drawChart() {
  const entries = QUEBEC_CITIES.map((city) => {
    const byYear = cityMonthlyAvg[city.name] || {};
    const byMonth = byYear[selectedYear] || {};
    return { name: city.name, value: byMonth[selectedMonth] ?? null };
  });

  const validValues = entries.map((d) => d.value).filter((v) => Number.isFinite(v));

  if (!validValues.length) {
    drawCenteredText(`No data available for ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`, 0.56);
    return;
  }

  const vMin = Number.isFinite(globalTempMin) ? globalTempMin : Math.floor(Math.min(...validValues)) - 1;
  const vMax = Number.isFinite(globalTempMax) ? globalTempMax : Math.ceil(Math.max(...validValues)) + 1;

  const cx = width * 0.5;
  const cy = height * 0.56;
  const outerR = Math.min(width, height) * 0.29;
  const innerR = outerR * 0.3;

  drawPolarGrid(cx, cy, innerR, outerR, vMin, vMax, entries.length);

  const points = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!Number.isFinite(entry.value)) continue;

    const angle = map(i, 0, entries.length, -HALF_PI, TWO_PI - HALF_PI);
    const r = map(entry.value, vMin, vMax, innerR, outerR);
    const x = cx + cos(angle) * r;
    const y = cy + sin(angle) * r;
    points.push({ x, y, angle, name: entry.name, value: entry.value });
  }

  if (points.length > 2) {
    fill(225, 62, 74, 22);
    stroke("#d62839");
    strokeWeight(2.6);
    drawExactClosedShape(points);
  }

  stroke("#d62839");
  fill("#ffffff");
  strokeWeight(1.6);
  for (const p of points) {
    circle(p.x, p.y, 5);
  }
}

function drawPolarGrid(cx, cy, innerR, outerR, vMin, vMax, count) {
  const rings = 4;
  stroke("#cfdae8");
  strokeWeight(1);
  noFill();

  for (let i = 0; i <= rings; i++) {
    const r = lerp(innerR, outerR, i / rings);
    circle(cx, cy, r * 2);
  }

  for (let i = 0; i < count; i++) {
    const angle = map(i, 0, count, -HALF_PI, TWO_PI - HALF_PI);
    const x = cx + cos(angle) * outerR;
    const y = cy + sin(angle) * outerR;
    line(cx, cy, x, y);
  }

  textSize(10);
  fill("#5a6b81");
  noStroke();
  textAlign(LEFT, CENTER);
  for (let i = 0; i <= rings; i++) {
    const r = lerp(innerR, outerR, i / rings);
    const value = lerp(vMin, vMax, i / rings);
    text(value.toFixed(1), cx + r + 6, cy);
  }

  textSize(8);
  fill("#78889e");
  textAlign(CENTER, CENTER);
  for (let i = 0; i < count; i++) {
    const city = QUEBEC_CITIES[i];
    const angle = map(i, 0, count, -HALF_PI, TWO_PI - HALF_PI);
    const x = cx + cos(angle) * (outerR + 16);
    const y = cy + sin(angle) * (outerR + 16);
    text(shortCityLabel(city.name), x, y);
  }
}

function drawExactClosedShape(points) {
  beginShape();
  for (const p of points) vertex(p.x, p.y);
  endShape(CLOSE);
}

function shortCityLabel(name) {
  if (name.length <= 6) return name;
  const compact = name.split(/[-\s]/).filter(Boolean);
  if (compact.length > 1) {
    return compact.map((part) => part[0]).join("").slice(0, 4).toUpperCase();
  }
  return name.slice(0, 6);
}

async function loadTemperatureData() {
  loading = true;
  loadError = null;
  loadingMessage = "Loading local dataset...";

  if (window.location.protocol === "file:") {
    loadError = "Run this with a local server (not file://), e.g. `python3 -m http.server 8000`.";
    loading = false;
    return;
  }

  try {
    const response = await fetch(DATA_FILE, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Dataset file request failed: ${response.status}`);
    }

    const payload = await response.json();
    hydrateFromDataset(payload);
  } catch (err) {
    console.error(err);
    loadError = "Could not load local monthly dataset. Run `node scripts/download_quebec_temps.mjs` first.";
  } finally {
    loading = false;
  }
}

function hydrateFromDataset(payload) {
  dataMeta = {
    source: payload?.source || "Unknown",
    startYear: payload?.startYear,
    endYear: payload?.endYear
  };

  const rows = Array.isArray(payload?.cities) ? payload.cities : [];
  QUEBEC_CITIES = rows.map((row) => ({
    name: row.city,
    latitude: row.latitude,
    longitude: row.longitude
  }));

  cityMonthlyAvg = {};
  rows.forEach((row) => {
    cityMonthlyAvg[row.city] = row.monthly || {};
  });

  const years = new Set();
  const allValues = [];
  rows.forEach((row) => {
    const monthly = row.monthly || {};
    Object.keys(monthly).forEach((year) => {
      years.add(Number(year));
      const months = monthly[year] || {};
      Object.values(months).forEach((value) => {
        if (Number.isFinite(value)) allValues.push(value);
      });
    });
  });

  availableYears = [...years].sort((a, b) => a - b);
  if (!availableYears.length) {
    throw new Error("Dataset does not contain monthly values.");
  }

  if (allValues.length) {
    globalTempMin = Math.floor(Math.min(...allValues)) - 1;
    globalTempMax = Math.ceil(Math.max(...allValues)) + 1;
    if (globalTempMin === globalTempMax) {
      globalTempMax += 1;
      globalTempMin -= 1;
    }
  }

  const minYear = availableYears[0];
  const maxYear = availableYears[availableYears.length - 1];
  yearSlider.attribute("min", minYear);
  yearSlider.attribute("max", maxYear);

  if (!availableYears.includes(selectedYear)) {
    selectedYear = maxYear;
    yearSlider.value(selectedYear);
  }

  monthSlider.attribute("min", 1);
  monthSlider.attribute("max", 12);
  if (selectedMonth < 1 || selectedMonth > 12) {
    selectedMonth = 1;
    monthSlider.value(selectedMonth);
  }
}

function windowResized() {
  resizeCanvas(getCanvasWidth(), 660);
  positionSliders();
}

function getCanvasWidth() {
  return Math.min(windowWidth * 0.95, 1100);
}

function positionSliders() {
  yearSlider.position(42, height - 68);
  monthSlider.position(42, height - 36);
}

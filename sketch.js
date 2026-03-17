const DATA_FILE = "./data/quebec_city_yearly_temps_2000_2025.json";

let QUEBEC_CITIES = [];
let cityYearlyAvg = {};
let availableYears = [];
let selectedYear = 2020;
let yearSlider;
let loading = true;
let loadError = null;
let loadingMessage = "Loading local dataset...";
let dataMeta = null;
let globalTempMin = null;
let globalTempMax = null;

function setup() {
  const container = document.getElementById("app");
  const canvas = createCanvas(getCanvasWidth(), 620);
  canvas.parent(container);

  yearSlider = createSlider(2000, 2025, selectedYear, 1);
  yearSlider.parent(container);
  yearSlider.addClass("p5Slider");
  yearSlider.input(() => {
    selectedYear = yearSlider.value();
  });

  positionSlider();
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
  text("Quebec Cities: Circular Yearly Temperature", 40, 24);

  textSize(14);
  fill("#315379");
  text(`Year: ${selectedYear}`, 42, 58);

  if (dataMeta) {
    text(`Source: ${dataMeta.source} (${dataMeta.startYear}-${dataMeta.endYear})`, 42, 78);
  } else {
    text("Source: local pre-downloaded dataset", 42, 78);
  }
}

function drawCenteredText(message, yRatio) {
  fill("#2d4f75");
  textAlign(CENTER, CENTER);
  textSize(16);
  text(message, width / 2, height * yRatio);
}

function drawChart() {
  const entries = QUEBEC_CITIES.map((city) => {
    const byYear = cityYearlyAvg[city.name] || {};
    return { name: city.name, value: byYear[selectedYear] ?? null };
  });

  const validValues = entries.map((d) => d.value).filter((v) => Number.isFinite(v));

  if (!validValues.length) {
    drawCenteredText(`No data available for ${selectedYear}`, 0.55);
    return;
  }

  let vMin = Number.isFinite(globalTempMin) ? globalTempMin : Math.floor(Math.min(...validValues)) - 1;
  let vMax = Number.isFinite(globalTempMax) ? globalTempMax : Math.ceil(Math.max(...validValues)) + 1;

  const cx = width * 0.5;
  const cy = height * 0.54;
  const outerR = Math.min(width, height) * 0.31;
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
    circle(p.x, p.y, 4.8);
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
    loadError = "Could not load local dataset. Run `node scripts/download_quebec_temps.mjs` first.";
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

  cityYearlyAvg = {};
  rows.forEach((row) => {
    cityYearlyAvg[row.city] = row.yearly || {};
  });

  const years = new Set();
  rows.forEach((row) => {
    Object.keys(row.yearly || {}).forEach((year) => years.add(Number(year)));
  });

  availableYears = [...years].sort((a, b) => a - b);

  if (!availableYears.length) {
    throw new Error("Dataset does not contain yearly values.");
  }

  const allValues = [];
  rows.forEach((row) => {
    Object.values(row.yearly || {}).forEach((v) => {
      if (Number.isFinite(v)) allValues.push(v);
    });
  });
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
}

function windowResized() {
  resizeCanvas(getCanvasWidth(), 620);
  positionSlider();
}

function getCanvasWidth() {
  return Math.min(windowWidth * 0.95, 1100);
}

function positionSlider() {
  const sliderX = 42;
  const sliderY = height - 42;
  yearSlider.position(sliderX, sliderY);
}

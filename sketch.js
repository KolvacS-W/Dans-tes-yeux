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
  text("Quebec Cities: Yearly Average Temperature", 40, 24);

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
  const margin = {
    left: 80,
    right: 40,
    top: 130,
    bottom: 145
  };

  const chartX = margin.left;
  const chartY = margin.top;
  const chartW = width - margin.left - margin.right;
  const chartH = height - margin.top - margin.bottom;

  const entries = QUEBEC_CITIES.map((city) => {
    const byYear = cityYearlyAvg[city.name] || {};
    return { name: city.name, value: byYear[selectedYear] ?? null };
  });

  const validValues = entries.map((d) => d.value).filter((v) => Number.isFinite(v));

  if (!validValues.length) {
    drawCenteredText(`No data available for ${selectedYear}`, 0.55);
    return;
  }

  let yMin = Math.floor(Math.min(...validValues)) - 1;
  let yMax = Math.ceil(Math.max(...validValues)) + 1;
  if (yMin === yMax) {
    yMax += 1;
    yMin -= 1;
  }

  stroke("#d7e6f8");
  strokeWeight(1);
  fill("#edf5ff");
  rect(chartX, chartY, chartW, chartH, 10);

  drawGridAndYAxis(chartX, chartY, chartW, chartH, yMin, yMax);

  const points = [];
  entries.forEach((entry, idx) => {
    if (!Number.isFinite(entry.value)) return;
    const x = map(idx, 0, QUEBEC_CITIES.length - 1, chartX + 10, chartX + chartW - 10);
    const y = map(entry.value, yMin, yMax, chartY + chartH - 10, chartY + 10);
    points.push({ x, y, name: entry.name, value: entry.value, idx });
  });

  if (points.length >= 2) {
    noFill();
    stroke("#1d70d6");
    strokeWeight(3);
    beginShape();
    curveVertex(points[0].x, points[0].y);
    for (const p of points) {
      curveVertex(p.x, p.y);
    }
    curveVertex(points[points.length - 1].x, points[points.length - 1].y);
    endShape();
  }

  stroke("#1d70d6");
  fill("#ffffff");
  strokeWeight(2);
  for (const p of points) {
    circle(p.x, p.y, 8);
  }

  noStroke();
  fill("#21486f");
  textSize(10);
  textAlign(CENTER, TOP);
  QUEBEC_CITIES.forEach((city, idx) => {
    const x = map(idx, 0, QUEBEC_CITIES.length - 1, chartX + 10, chartX + chartW - 10);
    push();
    translate(x, chartY + chartH + 12);
    rotate(-PI / 3.8);
    text(city.name, 0, 0);
    pop();
  });

  fill("#21486f");
  textAlign(RIGHT, CENTER);
  textSize(11);
  text("Average Temperature (deg C)", chartX - 14, chartY - 18);
}

function drawGridAndYAxis(chartX, chartY, chartW, chartH, yMin, yMax) {
  const ticks = 6;
  textSize(11);
  for (let i = 0; i <= ticks; i++) {
    const t = i / ticks;
    const y = lerp(chartY + chartH - 10, chartY + 10, t);
    const value = lerp(yMin, yMax, t);

    stroke("#d3e2f5");
    strokeWeight(1);
    line(chartX + 2, y, chartX + chartW - 2, y);

    noStroke();
    fill("#2d4f75");
    textAlign(RIGHT, CENTER);
    text(value.toFixed(1), chartX - 10, y);
  }

  stroke("#4c6f96");
  strokeWeight(1.5);
  line(chartX, chartY, chartX, chartY + chartH);
  line(chartX, chartY + chartH, chartX + chartW, chartY + chartH);
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

const DATA_FILE = "./data/quebec_city_monthly_temps_2000_2025.json";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
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
    redraw();
  });

  monthSlider = createSlider(1, 12, selectedMonth, 1);
  monthSlider.parent(container);
  monthSlider.addClass("p5Slider");
  monthSlider.input(() => {
    selectedMonth = monthSlider.value();
    redraw();
  });

  positionSliders();
  loadTemperatureData();
  noLoop();
}

function draw() {
  background(4, 3, 14);

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
  noStroke();
  textAlign(LEFT, TOP);

  fill(210, 185, 245);
  textSize(24);
  text("Dans tes yeux — Quebec Monthly Temperature", 40, 24);

  textSize(14);
  fill(165, 140, 210);
  text(`Year: ${selectedYear}`, 42, 58);
  text(`Month: ${MONTH_NAMES[selectedMonth - 1]}`, 42, 78);

  if (dataMeta) {
    text(`Source: ${dataMeta.source} (${dataMeta.startYear}–${dataMeta.endYear})`, 42, 98);
  } else {
    text("Source: local pre-downloaded dataset", 42, 98);
  }

  textSize(10);
  fill(115, 90, 155);
  text(
    "Collarette shape = city temperatures  ·  Pupil size = monthly mean  ·  Cyan = cold  ·  Magenta = warm",
    42, 118
  );
}

function drawCenteredText(message, yRatio) {
  fill(165, 140, 210);
  textAlign(CENTER, CENTER);
  textSize(16);
  text(message, width / 2, height * yRatio);
}

// ─── Main chart / eye orchestrator ────────────────────────────────────────────

function drawChart() {
  const entries = QUEBEC_CITIES.map((city) => {
    const byYear = cityMonthlyAvg[city.name] || {};
    const byMonth = byYear[selectedYear] || {};
    return { name: city.name, value: byMonth[selectedMonth] ?? null };
  });

  const validValues = entries.map((d) => d.value).filter((v) => Number.isFinite(v));

  if (!validValues.length) {
    drawCenteredText(
      `No data available for ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`,
      0.56
    );
    return;
  }

  const vMin = Number.isFinite(globalTempMin)
    ? globalTempMin
    : Math.floor(Math.min(...validValues)) - 1;
  const vMax = Number.isFinite(globalTempMax)
    ? globalTempMax
    : Math.ceil(Math.max(...validValues)) + 1;

  const cx = width * 0.5;
  const cy = height * 0.55;
  const irisR = Math.min(width, height) * 0.30;

  // Collarette lives in the 30–68 % radial zone of the iris
  const colMinR = irisR * 0.30;
  const colMaxR = irisR * 0.68;

  // Build collarette points from temperature data
  const colPoints = [];
  for (let i = 0; i < entries.length; i++) {
    if (!Number.isFinite(entries[i].value)) continue;
    const angle = map(i, 0, entries.length, -HALF_PI, TWO_PI - HALF_PI);
    const r = map(entries[i].value, vMin, vMax, colMinR, colMaxR);
    colPoints.push({
      x: cx + cos(angle) * r,
      y: cy + sin(angle) * r,
      angle, r,
      value: entries[i].value,
      name: entries[i].name,
    });
  }

  const monthlyMean = validValues.reduce((s, v) => s + v, 0) / validValues.length;
  const meanR = map(monthlyMean, vMin, vMax, colMinR, colMaxR);
  const pupilR = max(irisR * 0.10, meanR * 0.40);

  // Seed random so fibers are stable for a given year+month
  randomSeed(selectedYear * 100 + selectedMonth);

  drawIrisBase(cx, cy, irisR);
  drawIrisFibers(cx, cy, pupilR, irisR, colPoints);
  drawCollarette(colPoints, vMin, vMax);
  drawPupilGlow(cx, cy, pupilR);
  drawPupil(cx, cy, pupilR, monthlyMean);
  drawLimbus(cx, cy, irisR);
}

// ─── Eye drawing functions ─────────────────────────────────────────────────────

function drawIrisBase(cx, cy, r) {
  noStroke();
  fill(4, 3, 18);
  circle(cx, cy, r * 2);
}

// Spawns fiber seeds uniformly along the collarette curve, growing both
// outward (to the limbus) and inward (to the pupil).
function drawIrisFibers(cx, cy, pupilR, irisR, colPoints) {
  const numSeeds = 1800;
  const n = colPoints.length;
  if (n < 2) return;

  for (let i = 0; i < numSeeds; i++) {
    const t = i / numSeeds;
    const rawIdx = t * n;
    const i0 = floor(rawIdx) % n;
    const i1 = (i0 + 1) % n;
    const f = rawIdx - floor(rawIdx);

    // Interpolate a point on the collarette perimeter
    const sx = lerp(colPoints[i0].x, colPoints[i1].x, f);
    const sy = lerp(colPoints[i0].y, colPoints[i1].y, f);
    const baseAngle = atan2(sy - cy, sx - cx);
    const seedR = sqrt((sx - cx) * (sx - cx) + (sy - cy) * (sy - cy));

    // Outward: collarette → limbus
    if (random() < 0.93) {
      growFiber(cx, cy, sx, sy, baseAngle, seedR, irisR, true, 0, 1.0, 118);
    }

    // Inward: collarette → pupil border
    if (random() < 0.58) {
      growFiber(cx, cy, sx, sy, baseAngle + PI, seedR, pupilR * 1.06, false, 0, 0.72, 88);
    }
  }
}

// Recursively grows a single iris fiber with slight angular noise and
// occasional branching, mimicking the tree-like fibrous texture of the iris.
function growFiber(cx, cy, startX, startY, angle, startR, targetR, goingOut, depth, thickness, parentAlpha) {
  if (depth > 2) return;

  let x = startX;
  let y = startY;
  // Initial directional jitter grows with depth (branches diverge more)
  let ang = angle + random(-0.09, 0.09) * (1 + depth * 0.75);

  const step = 1.8;
  const totalSteps = max(2, floor(abs(targetR - startR) / step));

  for (let s = 0; s < totalSteps; s++) {
    const t = s / totalSteps; // 0 = at collarette, 1 = at target

    // Slight per-step angular drift for organic curl
    ang += random(-0.022, 0.022);

    const nx = x + cos(ang) * step;
    const ny = y + sin(ang) * step;
    const currR = sqrt((nx - cx) * (nx - cx) + (ny - cy) * (ny - cy));

    if (goingOut  && currR >= targetR * 0.97) break;
    if (!goingOut && currR <= targetR * 1.04) break;

    // Color gradient:
    //   Outward — white-lavender at collarette → vivid magenta at limbus
    //   Inward  — soft white at collarette → blue-white fade at pupil
    let r, g, b, alpha;
    if (goingOut) {
      const ease = pow(t, 0.60);
      r = lerp(228, 255, ease);
      g = lerp(198, 16,  ease * ease);   // green falls fast → pure magenta
      b = lerp(255, 172, ease);
      alpha = lerp(parentAlpha, parentAlpha * 0.17, pow(t, 1.3));
    } else {
      r = lerp(222, 115, t);
      g = lerp(212, 162, t);
      b = lerp(255, 255, t);
      alpha = lerp(parentAlpha, 0, pow(t, 0.65));
    }

    stroke(r, g, b, alpha);
    strokeWeight(max(0.22, thickness * (1 - t * 0.65)));
    line(x, y, nx, ny);

    // Branching: spawns a diverging sub-fiber further along the main fiber
    if (depth < 2 && s > totalSteps * 0.25 && random() < 0.016) {
      const bDir = random() < 0.5 ? 1 : -1;
      const bAngle = ang + bDir * random(0.20, 0.55);
      const remR = abs(targetR - currR);
      if (remR > 10) {
        growFiber(cx, cy, nx, ny, bAngle, currR, targetR, goingOut,
                  depth + 1, thickness * 0.55, alpha * 0.62);
      }
    }

    x = nx;
    y = ny;
  }
}

// Draws the collarette ring — the temperature data polygon — with a layered
// glow and per-segment temperature colouring (cyan = cold, magenta = warm).
function drawCollarette(points, vMin, vMax) {
  if (points.length < 3) return;

  // Four passes: wide soft glow → tight bright edge
  const passes = [
    { sw: 14, a: 18 },
    { sw: 7,  a: 38 },
    { sw: 3.5, a: 88 },
    { sw: 1.8, a: 185 },
  ];

  noFill();
  for (const pass of passes) {
    strokeWeight(pass.sw);
    for (let i = 0; i < points.length; i++) {
      const p0 = points[i];
      const p1 = points[(i + 1) % points.length];
      const midVal = (p0.value + p1.value) / 2;
      const t = constrain(map(midVal, vMin, vMax, 0, 1), 0, 1);
      // cold → cyan (#40C8FF), warm → magenta (#FF28C0)
      stroke(
        lerp(64,  255, t),
        lerp(200, 40,  t),
        lerp(255, 192, t),
        pass.a
      );
      line(p0.x, p0.y, p1.x, p1.y);
    }
  }

  // City-data dots on the collarette
  noStroke();
  for (const p of points) {
    const t = constrain(map(p.value, vMin, vMax, 0, 1), 0, 1);
    fill(lerp(80, 255, t), lerp(210, 50, t), lerp(255, 200, t), 220);
    circle(p.x, p.y, 4);
  }
}

// Cyan-blue halo ring at the pupil–iris border, like the bright limbal ring
// visible in close-up iris photography.
function drawPupilGlow(cx, cy, pupilR) {
  noFill();
  for (let i = 9; i >= 1; i--) {
    const ri = pupilR + i * 3.2;
    const a = map(i, 9, 1, 7, 145);
    const blue = map(i, 9, 1, 155, 255);
    stroke(0, blue * 0.55, blue, a);
    strokeWeight(lerp(7, 0.8, (9 - i) / 8));
    circle(cx, cy, ri * 2);
  }
}

// Draws the pupil: solid black disc, corneal specular highlights, and a
// subtle mean-temperature label.
function drawPupil(cx, cy, r, monthlyMean) {
  noStroke();
  fill(0);
  circle(cx, cy, r * 2);

  // Primary cornea highlight — classic teardrop reflection
  fill(255, 255, 255, 165);
  ellipse(cx - r * 0.30, cy - r * 0.30, r * 0.40, r * 0.24);

  // Secondary faint highlight
  fill(200, 225, 255, 85);
  circle(cx + r * 0.20, cy - r * 0.22, r * 0.14);

  // Mean temperature readout
  noStroke();
  fill(85, 108, 158);
  textSize(max(7, r * 0.28));
  textAlign(CENTER, CENTER);
  text(`${monthlyMean.toFixed(1)}°C`, cx, cy + r * 0.14);
}

// Draws the limbus — the dark outer ring that bounds the iris.
function drawLimbus(cx, cy, r) {
  noFill();
  // Diffuse outer glow
  for (let i = 6; i >= 1; i--) {
    stroke(18, 10, 55, 12 + i * 5);
    strokeWeight(i * 3.2);
    circle(cx, cy, r * 2 + i * 5);
  }
  // Crisp dark ring
  stroke(28, 18, 78, 210);
  strokeWeight(4);
  circle(cx, cy, r * 2);
}

// ─── Data loading ──────────────────────────────────────────────────────────────

async function loadTemperatureData() {
  loading = true;
  loadError = null;
  loadingMessage = "Loading local dataset...";

  if (window.location.protocol === "file:") {
    loadError =
      "Run this with a local server (not file://), e.g. `python3 -m http.server 8000`.";
    loading = false;
    redraw();
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
    loadError =
      "Could not load local monthly dataset. Run `node scripts/download_quebec_temps.mjs` first.";
  } finally {
    loading = false;
    redraw();
  }
}

function hydrateFromDataset(payload) {
  dataMeta = {
    source: payload?.source || "Unknown",
    startYear: payload?.startYear,
    endYear: payload?.endYear,
  };

  const rows = Array.isArray(payload?.cities) ? payload.cities : [];
  QUEBEC_CITIES = rows.map((row) => ({
    name: row.city,
    latitude: row.latitude,
    longitude: row.longitude,
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

// ─── Window / layout helpers ───────────────────────────────────────────────────

function windowResized() {
  resizeCanvas(getCanvasWidth(), 660);
  positionSliders();
  redraw();
}

function getCanvasWidth() {
  return Math.min(windowWidth * 0.95, 1100);
}

function positionSliders() {
  yearSlider.position(42, height - 68);
  monthSlider.position(42, height - 36);
}

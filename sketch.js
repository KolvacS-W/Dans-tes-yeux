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
let showCollaretteCurve = false;
let collaretteDensity = 60;
let densitySlider;

function setup() {
  const container = document.getElementById("app");
  const canvas = createCanvas(getCanvasWidth(), 720);
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

  densitySlider = createSlider(1, 300, collaretteDensity, 1);
  densitySlider.parent(container);
  densitySlider.addClass("p5Slider");
  densitySlider.input(() => {
    collaretteDensity = densitySlider.value();
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
    `Collarette fibers: ${collaretteDensity}  ·  [C] precise curve: ${showCollaretteCurve ? "ON" : "off"}` +
    "  ·  Pupil = mean temp  ·  Cyan = cold  ·  Magenta = warm",
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
  const cy = height * 0.53;
  const irisR = Math.min(width, height) * 0.27;

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
  drawPupil(cx, cy, pupilR);          // black base drawn first — fibers grow over it
  drawIrisFibers(cx, cy, pupilR, irisR, colPoints);
  drawCollarette(cx, cy, colPoints);
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

    // Inward: grow into the pupil so fiber tips define its organic edge
    if (random() < 0.72) {
      growFiber(cx, cy, sx, sy, baseAngle + PI, seedR, pupilR * 0.74, false, 0, 0.72, 88);
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
    //   Outward — white-lavender (228,198,255) at collarette → vivid magenta at limbus
    //   Inward  — same white-lavender (228,198,255) at collarette → bright white at pupil
    let r, g, b, alpha;
    if (goingOut) {
      const ease = pow(t, 0.60);
      r = lerp(228, 255, ease);
      g = lerp(198, 16,  ease * ease);   // green falls fast → pure magenta
      b = lerp(255, 172, ease);
      alpha = lerp(parentAlpha, parentAlpha * 0.17, pow(t, 1.3));
    } else {
      // Same start colour as outward (white-lavender 228,198,255 at collarette),
      // then brightens to near-white at the pupil border
      const ease = pow(t, 0.42);
      r = lerp(228, 255, ease);
      g = lerp(198, 238, ease);
      b = lerp(255, 255, ease);
      alpha = lerp(parentAlpha, parentAlpha * 1.45, ease);
      alpha = min(alpha, 228);
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

// Renders the collarette using the exact same visual style as the radial iris
// fibers (growFiber): each trace shares the same white-lavender→magenta colour
// ramp, the same thickness taper, and the same per-step angular drift — but
// runs tangentially around the Catmull-Rom smoothed data ring instead of
// Draws the collarette as collaretteDensity iris-line traces that follow the
// exact Catmull-Rom smooth data curve (no radial offset). Each trace carries
// the same per-step angular drift as growFiber, so lines stay organic while
// staying true to the curve shape. Colour = outward-fiber start (228,198,255).
function drawCollarette(cx, cy, points) {
  if (points.length < 3) return;
  const n = points.length;

  // Smooth path via Catmull-Rom
  const numSamples = 400;
  const smooth = [];
  for (let i = 0; i < numSamples; i++) {
    const t      = i / numSamples;
    const rawSeg = t * n;
    const seg    = floor(rawSeg);
    const f      = rawSeg - seg;
    const p0 = points[((seg - 1) + n) % n];
    const p1 = points[seg          % n];
    const p2 = points[(seg + 1)    % n];
    const p3 = points[(seg + 2)    % n];
    smooth.push({
      x: curvePoint(p0.x, p1.x, p2.x, p3.x, f),
      y: curvePoint(p0.y, p1.y, p2.y, p3.y, f),
    });
  }

  noFill();
  for (let trace = 0; trace < collaretteDensity; trace++) {
    // Outward-fiber start colour: white-lavender (228, 198, 255)
    stroke(228, 198, 255, random(50, 135));
    strokeWeight(random(0.30, 2.2));

    let drift = 0;
    let prevX = null, prevY = null;

    for (const sp of smooth) {
      // Same per-step wobble as growFiber — tiny drift, no base offset
      drift += random(-0.022, 0.022);
      const radAng = atan2(sp.y - cy, sp.x - cx);
      const wx = sp.x + cos(radAng) * drift * 8;
      const wy = sp.y + sin(radAng) * drift * 8;
      if (prevX !== null) line(prevX, prevY, wx, wy);
      prevX = wx;
      prevY = wy;
    }
  }

  // Optional precise white reference curve (press C)
  if (showCollaretteCurve) {
    noFill();
    stroke(255, 255, 255, 200);
    strokeWeight(1.4);
    beginShape();
    curveVertex(points[n - 2].x, points[n - 2].y);
    curveVertex(points[n - 1].x, points[n - 1].y);
    for (const p of points) curveVertex(p.x, p.y);
    curveVertex(points[0].x, points[0].y);
    curveVertex(points[1].x, points[1].y);
    endShape();
  }
}

// Pure black pupil disc — drawn before fibers so inward fiber tips
// overlap it and define its edge organically.
function drawPupil(cx, cy, r) {
  noStroke();
  fill(0);
  circle(cx, cy, r * 2);
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

function keyPressed() {
  if (key === 'c' || key === 'C') {
    showCollaretteCurve = !showCollaretteCurve;
    redraw();
  }
}

function windowResized() {
  resizeCanvas(getCanvasWidth(), 720);
  positionSliders();
  redraw();
}

function getCanvasWidth() {
  return Math.min(windowWidth * 0.95, 1100);
}

function positionSliders() {
  densitySlider.position(42, height - 108);
  yearSlider.position(42, height - 72);
  monthSlider.position(42, height - 36);
}

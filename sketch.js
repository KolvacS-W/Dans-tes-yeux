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
  "December",
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
let collaretteDensity = 0;
let densitySlider;
let growingFiberCount = 300;
let growingFiberSlider;
let irisLineCount = 900;
let irisLineCountSlider;
let irisMinWidth = 0.22;
let irisMinWidthSlider;
let irisMaxWidth = 4.2;
let irisMaxWidthSlider;
let irisRandomness = 1.0;
let irisRandomnessSlider;

function setup() {
  const container = document.getElementById("app");
  const canvas = createCanvas(getCanvasWidth(), 800);
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

  densitySlider = createSlider(0, 300, collaretteDensity, 1);
  densitySlider.parent(container);
  densitySlider.addClass("p5Slider");
  densitySlider.input(() => {
    collaretteDensity = densitySlider.value();
    redraw();
  });

  growingFiberSlider = createSlider(0, 1000, growingFiberCount, 10);
  growingFiberSlider.parent(container);
  growingFiberSlider.addClass("p5Slider");
  growingFiberSlider.input(() => {
    growingFiberCount = growingFiberSlider.value();
    redraw();
  });

  irisLineCountSlider = createSlider(0, 3600, irisLineCount, 50);
  irisLineCountSlider.parent(container);
  irisLineCountSlider.addClass("p5Slider");
  irisLineCountSlider.input(() => {
    irisLineCount = irisLineCountSlider.value();
    redraw();
  });

  irisMinWidthSlider = createSlider(0.05, 2.0, irisMinWidth, 0.05);
  irisMinWidthSlider.parent(container);
  irisMinWidthSlider.addClass("p5Slider");
  irisMinWidthSlider.input(() => {
    irisMinWidth = irisMinWidthSlider.value();
    redraw();
  });

  irisMaxWidthSlider = createSlider(0.5, 6.0, irisMaxWidth, 0.1);
  irisMaxWidthSlider.parent(container);
  irisMaxWidthSlider.addClass("p5Slider");
  irisMaxWidthSlider.input(() => {
    irisMaxWidth = irisMaxWidthSlider.value();
    redraw();
  });

  irisRandomnessSlider = createSlider(0, 1.0, irisRandomness, 0.05);
  irisRandomnessSlider.parent(container);
  irisRandomnessSlider.addClass("p5Slider");
  irisRandomnessSlider.input(() => {
    irisRandomness = irisRandomnessSlider.value();
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
    text(
      `Source: ${dataMeta.source} (${dataMeta.startYear}–${dataMeta.endYear})`,
      42,
      98,
    );
  } else {
    text("Source: local pre-downloaded dataset", 42, 98);
  }

  textSize(10);
  fill(115, 90, 155);
  text(
    `Ring lines: ${collaretteDensity}  ·  Growing fibers: ${growingFiberCount}  ·  Iris lines: ${irisLineCount}` +
      `  ·  Width: ${irisMinWidth.toFixed(2)}–${irisMaxWidth.toFixed(1)}  ·  Rand: ${irisRandomness.toFixed(2)}` +
      `  ·  [C] curve: ${showCollaretteCurve ? "ON" : "off"}  ·  Pupil = mean temp`,
    42,
    118,
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

  const validValues = entries
    .map((d) => d.value)
    .filter((v) => Number.isFinite(v));

  if (!validValues.length) {
    drawCenteredText(
      `No data available for ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`,
      0.56,
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
  const colMinR = irisR * 0.3;
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
      angle,
      r,
      value: entries[i].value,
      name: entries[i].name,
    });
  }

  const monthlyMean =
    validValues.reduce((s, v) => s + v, 0) / validValues.length;
  const meanR = map(monthlyMean, vMin, vMax, colMinR, colMaxR);
  // DATA→PUPIL: monthlyMean is mapped to meanR via the temperature range [vMin, vMax]
  // → collarette radial zone [colMinR, colMaxR]. pupilR = 40% of meanR, so a warmer
  // month (higher mean temp) produces a larger pupil. Floor at 10% of irisR.
  const pupilR = max(irisR * 0.1, meanR * 0.7);

  // Seed random so fibers are stable for a given year+month
  randomSeed(selectedYear * 100 + selectedMonth);

  drawIrisBase(cx, cy, irisR);
  drawPupil(cx, cy, pupilR); // black base drawn first — fibers grow over it
  drawIrisFibers(cx, cy, pupilR, irisR, colPoints);
  if (growingFiberCount > 0)
    drawCollaretteGrowingFibers(cx, cy, colPoints, irisR);
  if (collaretteDensity > 0) drawCollarette(cx, cy, colPoints);
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
  const numSeeds = irisLineCount;
  const n = colPoints.length;
  if (n < 2 || numSeeds === 0) return;

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

    // Per-fiber width: random between irisMinWidth and irisMaxWidth, scaled by irisRandomness
    // irisRandomness=0 → all fibers use midpoint width; irisRandomness=1 → fully random
    const w = lerp(
      irisMinWidth,
      irisMaxWidth,
      lerp(0.5, random(), irisRandomness),
    );

    // Outward: collarette → limbus
    if (random() < 0.93) {
      growFiber(cx, cy, sx, sy, baseAngle, seedR, irisR, true, 0, w, 118);
    }

    // Inward: grow into the pupil so fiber tips define its organic edge
    if (random() < 0.72) {
      growFiber(
        cx,
        cy,
        sx,
        sy,
        baseAngle + PI,
        seedR,
        pupilR * 0.74,
        false,
        0,
        w * 0.72,
        88,
      );
    }
  }
}

// Recursively grows a single iris fiber with slight angular noise and
// occasional branching, mimicking the tree-like fibrous texture of the iris.
function growFiber(
  cx,
  cy,
  startX,
  startY,
  angle,
  startR,
  targetR,
  goingOut,
  depth,
  thickness,
  parentAlpha,
) {
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

    if (goingOut && currR >= targetR * 0.97) break;
    if (!goingOut && currR <= targetR * 1.04) break;

    // Color gradient:
    //   Outward — white-lavender (228,198,255) at collarette → vivid magenta at limbus
    //   Inward  — same white-lavender (228,198,255) at collarette → bright white at pupil
    let r, g, b, alpha;
    if (goingOut) {
      const ease = pow(t, 0.6);
      r = lerp(228, 255, ease);
      g = lerp(198, 16, ease * ease); // green falls fast → pure magenta
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
    strokeWeight(max(irisMinWidth, thickness * (1 - t * 0.65)));
    line(x, y, nx, ny);

    // Branching: spawns a diverging sub-fiber further along the main fiber
    if (depth < 2 && s > totalSteps * 0.25 && random() < 0.016) {
      const bDir = random() < 0.5 ? 1 : -1;
      const bAngle = ang + bDir * random(0.2, 0.55);
      const remR = abs(targetR - currR);
      if (remR > 10) {
        growFiber(
          cx,
          cy,
          nx,
          ny,
          bAngle,
          currR,
          targetR,
          goingOut,
          depth + 1,
          thickness * 0.55,
          alpha * 0.62,
        );
      }
    }

    x = nx;
    y = ny;
  }
}

// Seeds fibers uniformly along the collarette ring that first travel tangentially
// for a short arc, then curve and grow outward to the limbus — mimicking how iris
// fibers in a real eye appear to originate from the collarette structure.
function drawCollaretteGrowingFibers(cx, cy, colPoints, irisR) {
  const numFibers = growingFiberCount;
  const n = colPoints.length;
  if (n < 2) return;
  noFill();

  for (let i = 0; i < numFibers; i++) {
    const t = i / numFibers;
    const rawIdx = t * n;
    const i0 = floor(rawIdx) % n;
    const i1 = (i0 + 1) % n;
    const f = rawIdx - floor(rawIdx);
    const sx = lerp(colPoints[i0].x, colPoints[i1].x, f);
    const sy = lerp(colPoints[i0].y, colPoints[i1].y, f);
    growRingOutwardFiber(cx, cy, sx, sy, irisR);
  }
}

// Each fiber starts tangentially (along the ring), then curves outward.
// Phase 1 (first ~12% of steps): moves in the tangential direction.
// Phase 2 (remaining steps): smoothly blends from tangential → radial outward.
// Colour and style identical to growFiber outward fibers.
function growRingOutwardFiber(cx, cy, sx, sy, irisR) {
  const radAng = atan2(sy - cy, sx - cx);
  const startR = sqrt((sx - cx) * (sx - cx) + (sy - cy) * (sy - cy));

  // Random tangential launch direction (CW or CCW) with slight jitter
  const tangDir = random() < 0.5 ? 1 : -1;
  const tangAng = radAng + tangDir * HALF_PI + random(-0.28, 0.28);

  const step = 2.0;
  const totalSteps = max(5, floor((irisR - startR) / step));
  const tangPhase = 0.12;
  const parentAlpha = random(70, 135);
  const baseThickness = lerp(
    irisMinWidth,
    irisMaxWidth,
    lerp(0.5, random(), irisRandomness),
  );

  let drift = 0;
  let x = sx,
    y = sy;
  let prevX = null,
    prevY = null;

  for (let s = 0; s < totalSteps; s++) {
    const t = s / totalSteps;
    drift += random(-0.022, 0.022);

    let ang;
    if (t < tangPhase) {
      ang = tangAng + drift;
    } else {
      const blend = pow((t - tangPhase) / (1 - tangPhase), 0.55);
      // drift weight fades to 0 as blend→1, so direction is exactly radAng at limbus
      ang = lerp(tangAng, radAng, blend) + drift * (1 - blend);
    }

    const nx = x + cos(ang) * step;
    const ny = y + sin(ang) * step;
    const currR = sqrt((nx - cx) * (nx - cx) + (ny - cy) * (ny - cy));
    if (currR >= irisR * 0.97) break;

    // Same gradient as growFiber outward: white-lavender → magenta
    const ease = pow(t, 0.6);
    stroke(
      lerp(228, 255, ease),
      lerp(198, 16, ease * ease),
      lerp(255, 172, ease),
      lerp(parentAlpha, parentAlpha * 0.17, pow(t, 1.3)),
    );
    strokeWeight(max(irisMinWidth, baseThickness * (1 - t * 0.65)));

    if (prevX !== null) line(prevX, prevY, nx, ny);
    prevX = nx;
    prevY = ny;
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
    const t = i / numSamples;
    const rawSeg = t * n;
    const seg = floor(rawSeg);
    const f = rawSeg - seg;
    const p0 = points[(seg - 1 + n) % n];
    const p1 = points[seg % n];
    const p2 = points[(seg + 1) % n];
    const p3 = points[(seg + 2) % n];
    smooth.push({
      x: curvePoint(p0.x, p1.x, p2.x, p3.x, f),
      y: curvePoint(p0.y, p1.y, p2.y, p3.y, f),
    });
  }

  noFill();
  for (let trace = 0; trace < collaretteDensity; trace++) {
    // Outward-fiber start colour: white-lavender (228, 198, 255)
    stroke(228, 198, 255, random(50, 135));
    strokeWeight(
      lerp(irisMinWidth, irisMaxWidth, lerp(0.5, random(), irisRandomness)),
    );

    let drift = 0;
    let prevX = null,
      prevY = null;

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
  if (key === "c" || key === "C") {
    showCollaretteCurve = !showCollaretteCurve;
    redraw();
  }
}

function windowResized() {
  resizeCanvas(getCanvasWidth(), 800);
  positionSliders();
  redraw();
}

function getCanvasWidth() {
  return Math.min(windowWidth * 0.95, 1100);
}

function positionSliders() {
  // Left column: data + iris count
  yearSlider.position(42, height - 144);
  monthSlider.position(42, height - 108);
  irisLineCountSlider.position(42, height - 72);
  irisRandomnessSlider.position(42, height - 36);
  // Right column: ring/growing fibers + width range
  densitySlider.position(400, height - 144);
  growingFiberSlider.position(400, height - 108);
  irisMinWidthSlider.position(400, height - 72);
  irisMaxWidthSlider.position(400, height - 36);
}

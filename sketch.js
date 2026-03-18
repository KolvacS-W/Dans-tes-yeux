// ============================
// Data Sources (keep explicit)
// ============================
// Precipitation controls ring/collarette geometry (line chart shape).
const PRECIP_DATA_FILE = "./data/quebec_city_monthly_precip_2000_2025.json";
// Temperature controls pupil radius + iris color palette.
const TEMP_DATA_FILE = "./data/quebec_city_monthly_temps_2000_2025.json";

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

// ============================
// Data-to-geometry mapping
// ============================
// Value at outer iris edge for precipitation axis (mm).
// Higher -> flatter chart variation; lower -> more amplified chart variation.
const PRECIP_Y_MAX_AT_EDGE = 500;
// Radius where precipitation axis starts (0..1 of iris radius).
// 0 = center, 1 = edge. Larger values compress radial variation.
const PRECIP_Y_AXIS_START_RADIUS_NORM = 0.45;

// ============================
// Canvas/layout constants
// ============================
const CANVAS_H = 800;
const MAX_CANVAS_W = 1100;
const CANVAS_W_RATIO = 0.95;

// Slider panel layout.
const SLIDER_ROW_H = 32;
const SLIDER_W = 185;
// Browser range inputs render slightly differently by platform; nudge label anchors.
const SLIDER_LABEL_Y_NUDGE = -4;

// ============================
// Artistic controls
// ============================
// These parameters shape the fibrous iris style.
let collaretteDensity = 0; // Number of tangential collarette traces.
let growingFiberOutward = 300; // Fibers seeded on collarette flowing outward.
let growingFiberInward = 50; // Fibers seeded on collarette flowing inward.
let irisLineCount = 500; // Main radial iris seed count.
let irisMinWidth = 0.5; // Minimum stroke width for fibers.
let irisMaxWidth = 5.2; // Maximum stroke width for fibers.
let irisRandomness = 1.0; // 0 = deterministic widths, 1 = fully random widths.
let colorVariance = 0.5; // Per-fiber RGB perturbation amount.

// ============================
// Interaction state
// ============================
let selectedYear = 2003;
let selectedMonth = 1;
let showCollaretteCurve = false; // C: show white collarette reference curve.
let showTempPupilGuide = false; // T: show temp->pupil mapping ruler.
let showPrecipAxes = false; // P: show precipitation axes + exact polyline.

// ============================
// Runtime data state
// ============================
let loading = true;
let loadError = null;
let loadingMessage = "Loading local datasets...";

// City registry used for angular ordering in the ring chart.
let QUEBEC_CITIES = [];

// Lookup maps: city -> year -> month -> numeric value.
let cityMonthlyPrecip = {};
let cityMonthlyTemp = {};

// Data metadata for on-canvas provenance text.
let precipMeta = null;
let tempMeta = null;

// Global temperature range over all cities/years/months.
// Used to keep palette + pupil mapping stable while browsing.
let globalTempMin = null;
let globalTempMax = null;

// Years present in loaded data (used to constrain year slider).
let availableYears = [];

// Cached geometry from the last drawChart pass.
// Overlay layers (T/P) consume this to remain perfectly aligned.
let lastChartState = null;

// Slider references.
let yearSlider;
let monthSlider;
let densitySlider;
let growingFiberOutwardSlider;
let growingFiberInwardSlider;
let irisLineCountSlider;
let irisMinWidthSlider;
let irisMaxWidthSlider;
let irisRandomnessSlider;
let colorVarianceSlider;

// ============================
// Palette helpers
// ============================
function hexToRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

// Temperature-driven color anchors (cold -> hazel -> warm).
const PALETTE_COLD = {
  fiberStart: hexToRgb("#83bcf5"),
  fiberEnd: hexToRgb("#0539a0"),
  inwardEnd: hexToRgb("#8bc0f4"),
  base: hexToRgb("#01021e"),
};

const PALETTE_HAZEL = {
  fiberStart: hexToRgb("#f4a638"),
  fiberEnd: hexToRgb("#2e4614"),
  inwardEnd: hexToRgb("#f0d7a5"),
  base: hexToRgb("#070402"),
};

const PALETTE_WARM = {
  fiberStart: hexToRgb("#e27120"),
  fiberEnd: hexToRgb("#411a04"),
  inwardEnd: hexToRgb("#ffbc5a"),
  base: hexToRgb("#120501"),
};

// Blend low->mid->high using smoothstep for soft transitions.
function getIrisPalette(normValue) {
  const t = constrain(normValue, 0, 1);
  const ss = (x) => x * x * (3 - 2 * x);

  let f;
  let from;
  let to;
  if (t <= 0.5) {
    f = ss(t * 2);
    from = PALETTE_COLD;
    to = PALETTE_HAZEL;
  } else {
    f = ss((t - 0.5) * 2);
    from = PALETTE_HAZEL;
    to = PALETTE_WARM;
  }

  const lerpColor = (a, b) => [
    lerp(a[0], b[0], f),
    lerp(a[1], b[1], f),
    lerp(a[2], b[2], f),
  ];

  return {
    fiberStart: lerpColor(from.fiberStart, to.fiberStart),
    fiberEnd: lerpColor(from.fiberEnd, to.fiberEnd),
    inwardEnd: lerpColor(from.inwardEnd, to.inwardEnd),
    base: lerpColor(from.base, to.base),
  };
}

// ============================
// p5 lifecycle
// ============================
function setup() {
  const container = document.getElementById("app");
  const canvas = createCanvas(getCanvasWidth(), CANVAS_H);
  canvas.parent(container);

  // Primary data navigation controls.
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

  // Artistic detail controls.
  densitySlider = createSlider(0, 300, collaretteDensity, 1);
  densitySlider.parent(container);
  densitySlider.addClass("p5Slider");
  densitySlider.input(() => {
    collaretteDensity = densitySlider.value();
    redraw();
  });

  growingFiberOutwardSlider = createSlider(0, 1000, growingFiberOutward, 10);
  growingFiberOutwardSlider.parent(container);
  growingFiberOutwardSlider.addClass("p5Slider");
  growingFiberOutwardSlider.input(() => {
    growingFiberOutward = growingFiberOutwardSlider.value();
    redraw();
  });

  growingFiberInwardSlider = createSlider(0, 1000, growingFiberInward, 10);
  growingFiberInwardSlider.parent(container);
  growingFiberInwardSlider.addClass("p5Slider");
  growingFiberInwardSlider.input(() => {
    growingFiberInward = growingFiberInwardSlider.value();
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

  colorVarianceSlider = createSlider(0, 1.0, colorVariance, 0.05);
  colorVarianceSlider.parent(container);
  colorVarianceSlider.addClass("p5Slider");
  colorVarianceSlider.input(() => {
    colorVariance = colorVarianceSlider.value();
    redraw();
  });

  positionSliders();
  loadData();

  // Static generative frame; redraw only on interaction.
  noLoop();
}

function draw() {
  background(4, 3, 14);

  if (loading) {
    drawHeader();
    drawCenteredText(loadingMessage, 0.5);
    drawSliderLabels();
    return;
  }

  if (loadError) {
    drawHeader();
    drawCenteredText(loadError, 0.5);
    drawSliderLabels();
    return;
  }

  drawHeader();
  drawChart();

  // Optional explanatory overlays.
  if (showTempPupilGuide && lastChartState) drawTempPupilGuide(lastChartState);
  if (showPrecipAxes && lastChartState) drawPrecipAxesOverlay(lastChartState);

  drawSliderLabels();
}

// ============================
// Header + status UI
// ============================
function drawHeader() {
  noStroke();
  textAlign(LEFT, TOP);

  fill(210, 185, 245);
  textSize(24);
  text("Dans tes yeux", 40, 24);

  fill(165, 140, 210);
  textSize(13);
  text(
    `Year: ${selectedYear}  ·  Month: ${MONTH_NAMES[selectedMonth - 1]}`,
    42,
    60,
  );

  // Keep explicit source explanation as requested.
  // if (precipMeta || tempMeta) {
  //   const precipYears = precipMeta
  //     ? `${precipMeta.startYear}-${precipMeta.endYear}`
  //     : "n/a";
  //   const tempYears = tempMeta
  //     ? `${tempMeta.startYear}-${tempMeta.endYear}`
  //     : "n/a";
  //   text(
  //     `Ring data: precipitation (${precipYears}) from ${precipMeta?.source || "Unknown"}`,
  //     42,
  //     82,
  //   );
  //   text(
  //     `Pupil + color data: temperature (${tempYears}) from ${tempMeta?.source || "Unknown"}`,
  //     42,
  //     100,
  //   );
  // } else {
  //   text("Source: local pre-downloaded datasets", 42, 82);
  // }

  fill(115, 90, 155);
  textSize(10);
  // text(
  //   `[C] collarette reference: ${showCollaretteCurve ? "ON" : "off"}  ·  [T] temp->pupil ruler: ${showTempPupilGuide ? "ON" : "off"}  ·  [P] precip axes: ${showPrecipAxes ? "ON" : "off"}`,
  //   42,
  //   122,
  // );
}

function drawCenteredText(message, yRatio) {
  fill(165, 140, 210);
  textAlign(CENTER, CENTER);
  textSize(16);
  text(message, width / 2, height * yRatio);
}

// ============================
// Data -> geometry -> art
// ============================
function drawChart() {
  // 1) Build monthly city arrays for each data channel.
  const precipEntries = mapCitiesToMonthlyValues(cityMonthlyPrecip);
  const tempEntries = mapCitiesToMonthlyValues(cityMonthlyTemp);

  const validPrecipValues = precipEntries
    .map((d) => d.value)
    .filter((v) => Number.isFinite(v));
  const validTempValues = tempEntries
    .map((d) => d.value)
    .filter((v) => Number.isFinite(v));

  if (!validPrecipValues.length || !validTempValues.length) {
    lastChartState = null;
    drawCenteredText(
      `No data available for ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`,
      0.56,
    );
    return;
  }

  // 2) Eye center and base iris radius.
  const cx = width * 0.5;
  const cy = height * 0.5;
  const irisR = Math.min(width, height) * 0.27;

  // 3) Precipitation axis mapping for collarette/ring shape.
  //    0 mm starts at colMinR; PRECIP_Y_MAX_AT_EDGE reaches colMaxR.
  const precipMin = 0;
  const precipMax = max(precipMin + 1, PRECIP_Y_MAX_AT_EDGE);
  const colMinR = irisR * constrain(PRECIP_Y_AXIS_START_RADIUS_NORM, 0, 0.96);
  const colMaxR = irisR * 0.97;

  // 4) Convert each city precipitation value to a polar ring point.
  const colPoints = [];
  for (let i = 0; i < precipEntries.length; i++) {
    const entry = precipEntries[i];
    if (!Number.isFinite(entry.value)) continue;

    const angle = map(i, 0, precipEntries.length, -HALF_PI, TWO_PI - HALF_PI);
    const clamped = constrain(entry.value, precipMin, precipMax);
    const radius = map(clamped, precipMin, precipMax, colMinR, colMaxR);

    colPoints.push({
      x: cx + cos(angle) * radius,
      y: cy + sin(angle) * radius,
      angle,
      r: radius,
      value: entry.value,
      name: entry.name,
    });
  }

  // 5) Temperature drives pupil size + palette exactly as before.
  const monthlyTempMean =
    validTempValues.reduce((sum, v) => sum + v, 0) / validTempValues.length;

  const tempMin = Number.isFinite(globalTempMin)
    ? globalTempMin
    : Math.floor(Math.min(...validTempValues)) - 1;
  const tempMax = Number.isFinite(globalTempMax)
    ? globalTempMax
    : Math.ceil(Math.max(...validTempValues)) + 1;

  const mappedTempRadius = map(
    monthlyTempMean,
    tempMin,
    tempMax,
    colMinR,
    colMaxR,
  );
  const pupilR = max(irisR * 0.1, mappedTempRadius * 0.6);

  const tempNorm = constrain(
    map(monthlyTempMean, tempMin, tempMax, 0, 1),
    0,
    1,
  );
  const palette = getIrisPalette(tempNorm);

  // 6) Stable random seed for reproducible month/year texture.
  randomSeed(selectedYear * 100 + selectedMonth);

  // 7) Render layered eye structure.
  drawIrisBase(cx, cy, irisR, palette);
  drawPupil(cx, cy, pupilR);
  drawIrisFibers(cx, cy, pupilR, irisR, colPoints, palette);
  if (growingFiberOutward > 0) {
    drawCollaretteGrowingFibers(cx, cy, colPoints, irisR, palette);
  }
  if (growingFiberInward > 0) {
    drawCollaretteInwardFibers(cx, cy, colPoints, pupilR, palette);
  }
  if (collaretteDensity > 0) {
    drawCollarette(cx, cy, colPoints, palette);
  }
  // drawLimbus(cx, cy, irisR);

  // 8) Cache derived geometry for explanatory overlays.
  lastChartState = {
    cx,
    cy,
    irisR,
    colMinR,
    colMaxR,
    colPoints,
    precipEntries,
    precipMin,
    precipMax,
    monthlyTempMean,
    tempMin,
    tempMax,
    pupilR,
  };
}

function mapCitiesToMonthlyValues(cityMonthlyMap) {
  return QUEBEC_CITIES.map((city) => {
    const byYear = cityMonthlyMap[city.name] || {};
    const byMonth = byYear[selectedYear] || {};
    return { name: city.name, value: byMonth[selectedMonth] ?? null };
  });
}

// ============================
// Explainability overlays
// ============================
function drawTempPupilGuide(state) {
  const {
    cx,
    cy,
    irisR,
    colMinR,
    colMaxR,
    monthlyTempMean,
    tempMin,
    tempMax,
    pupilR,
  } = state;

  // Guide ruler is placed to the right of the eye.
  const axisX = cx + irisR + 34;

  // Convert the temp-domain bounds to the exact pupil-radius domain currently in use.
  const guideMinPupilR = max(irisR * 0.1, colMinR * 0.6);
  const guideMaxPupilR = max(irisR * 0.1, colMaxR * 0.6);
  const yTop = cy - guideMaxPupilR;
  const yBottom = cy - guideMinPupilR;

  stroke(220, 236, 255, 120);
  strokeWeight(1);
  line(axisX, yTop, axisX, yBottom);

  noStroke();
  fill(215, 235, 255, 220);
  textAlign(LEFT, CENTER);
  textSize(10);
  text("Average temperature (deg C) -> pupil radius", axisX + 8, yTop - 10);

  const ticks = 6;
  for (let i = 0; i <= ticks; i++) {
    const f = i / ticks;
    const temp = lerp(tempMin, tempMax, f);
    const mappedRadius = map(temp, tempMin, tempMax, colMinR, colMaxR);
    const pr = max(irisR * 0.1, mappedRadius * 0.6);
    const y = cy - pr;

    stroke(220, 236, 255, 120);
    line(axisX - 5, y, axisX + 5, y);

    noStroke();
    fill(215, 235, 255, 210);
    text(`${temp.toFixed(1)} deg`, axisX + 9, y);
  }

  // Highlight the currently selected month's derived pupil radius.
  const currentY = cy - pupilR;
  stroke(255, 210, 120, 220);
  strokeWeight(1.2);
  line(axisX - 10, currentY, axisX + 96, currentY);

  noStroke();
  fill(255, 210, 120, 240);
  text(`current ${monthlyTempMean.toFixed(2)} deg`, axisX + 10, currentY - 10);
}

function drawPrecipAxesOverlay(state) {
  const { cx, cy, colMinR, colMaxR, precipEntries, precipMin, precipMax } =
    state;
  textSize(10);

  // Radial y-axis ticks: precipitation rings.
  const ticks = 5;
  for (let i = 0; i <= ticks; i++) {
    const f = i / ticks;
    const value = lerp(precipMin, precipMax, f);
    const r = map(value, precipMin, precipMax, colMinR, colMaxR);

    noFill();
    stroke(168, 222, 255, 70);
    strokeWeight(1);
    circle(cx, cy, r * 2);

    noStroke();
    fill(168, 222, 255, 200);
    textAlign(LEFT, CENTER);
    text(`${value.toFixed(1)} mm`, cx + 8, cy - r - 2);
  }

  // Exact precipitation polyline (unsmoothed), thick white.
  // Missing values break the polyline so we avoid false bridge segments.
  const plotPoints = precipEntries.map((entry, i) => {
    if (!Number.isFinite(entry.value)) return null;

    const angle = map(i, 0, precipEntries.length, -HALF_PI, TWO_PI - HALF_PI);
    const clamped = constrain(entry.value, precipMin, precipMax);
    const r = map(clamped, precipMin, precipMax, colMinR, colMaxR);
    return { x: cx + cos(angle) * r, y: cy + sin(angle) * r };
  });

  const hasMissing = plotPoints.some((p) => p === null);
  const validCount = plotPoints.reduce((n, p) => n + (p ? 1 : 0), 0);

  if (validCount >= 2) {
    noFill();
    stroke(255, 255, 255, 245);
    strokeWeight(4.2);

    if (!hasMissing) {
      beginShape();
      for (const p of plotPoints) vertex(p.x, p.y);
      endShape(CLOSE);
    } else {
      let drawing = false;
      for (const p of plotPoints) {
        if (!p) {
          if (drawing) {
            endShape();
            drawing = false;
          }
          continue;
        }
        if (!drawing) {
          beginShape();
          drawing = true;
        }
        vertex(p.x, p.y);
      }
      if (drawing) endShape();
    }
  }

  // Angular x-axis: city spokes + city/value labels.
  for (let i = 0; i < precipEntries.length; i++) {
    const entry = precipEntries[i];
    if (!Number.isFinite(entry.value)) continue;

    const angle = map(i, 0, precipEntries.length, -HALF_PI, TWO_PI - HALF_PI);
    const r = map(entry.value, precipMin, precipMax, colMinR, colMaxR);

    const x0 = cx + cos(angle) * colMinR;
    const y0 = cy + sin(angle) * colMinR;
    const x1 = cx + cos(angle) * (colMaxR + 8);
    const y1 = cy + sin(angle) * (colMaxR + 8);
    const xp = cx + cos(angle) * r;
    const yp = cy + sin(angle) * r;
    const xl = cx + cos(angle) * (colMaxR + 28);
    const yl = cy + sin(angle) * (colMaxR + 28);

    stroke(176, 205, 255, 70);
    strokeWeight(1);
    line(x0, y0, x1, y1);

    noStroke();
    fill(255, 245, 200, 235);
    circle(xp, yp, 4);

    fill(200, 220, 255, 220);
    textAlign(CENTER, CENTER);
    text(entry.name, xl, yl);

    fill(255, 235, 180, 220);
    text(`${entry.value.toFixed(1)} mm`, xp, yp - 10);
  }
}

// ============================
// Core eye rendering
// ============================
function drawIrisBase(cx, cy, r, palette) {
  noStroke();
  fill(palette.base[0], palette.base[1], palette.base[2]);
  circle(cx, cy, r * 2);
}

function drawPupil(cx, cy, r) {
  noStroke();
  fill(0);
  circle(cx, cy, r * 2);
}

function drawLimbus(cx, cy, r) {
  noFill();

  // Soft outer glow.
  for (let i = 6; i >= 1; i--) {
    stroke(18, 10, 55, 12 + i * 5);
    strokeWeight(i * 3.2);
    circle(cx, cy, r * 2 + i * 5);
  }

  // Crisp dark boundary ring.
  stroke(28, 18, 78, 210);
  strokeWeight(4);
  circle(cx, cy, r * 2);
}

// Seed main iris fibers along the precipitation-defined collarette perimeter,
// then grow them outward and inward to build the iris body.
function drawIrisFibers(cx, cy, pupilR, irisR, colPoints, palette) {
  const numSeeds = irisLineCount;
  const n = colPoints.length;
  if (n < 2 || numSeeds === 0) return;

  for (let i = 0; i < numSeeds; i++) {
    const t = i / numSeeds;
    const rawIdx = t * n;
    const i0 = floor(rawIdx) % n;
    const i1 = (i0 + 1) % n;
    const f = rawIdx - floor(rawIdx);

    // Interpolate seed point between neighboring collarette points.
    const sx = lerp(colPoints[i0].x, colPoints[i1].x, f);
    const sy = lerp(colPoints[i0].y, colPoints[i1].y, f);
    const baseAngle = atan2(sy - cy, sx - cx);
    const seedR = dist(sx, sy, cx, cy);

    // Fiber thickness for this seed.
    const width = lerp(
      irisMinWidth,
      irisMaxWidth,
      lerp(0.5, random(), irisRandomness),
    );

    // Outward fibers shape limbus-side texture.
    if (random() < 0.93) {
      growFiber(
        cx,
        cy,
        sx,
        sy,
        baseAngle,
        seedR,
        irisR,
        true,
        0,
        width,
        118,
        palette,
      );
    }

    // Inward fibers define pupil edge texture.
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
        width * 0.72,
        88,
        palette,
      );
    }
  }
}

// Recursive fiber grower.
// It advances a small segment step-by-step with directional jitter, color gradient,
// width tapering, and optional branching to mimic iris microstructure.
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
  palette,
) {
  if (depth > 2) return;

  let x = startX;
  let y = startY;
  let ang = angle + random(-0.09, 0.09) * (1 + depth * 0.75);

  const step = 1.8;
  const totalSteps = max(2, floor(abs(targetR - startR) / step));

  // Per-fiber RGB shift: keeps each fiber related to palette while adding natural variation.
  const cv = colorVariance * 55;
  const clamp255 = (v) => constrain(v, 0, 255);
  const dr = random(-cv, cv);
  const dg = random(-cv, cv);
  const db = random(-cv, cv);

  const pStart = palette.fiberStart.map((c, i) =>
    clamp255(c + [dr, dg, db][i]),
  );
  const pEnd = palette.fiberEnd.map((c, i) => clamp255(c + [dr, dg, db][i]));
  const pInward = palette.inwardEnd.map((c, i) =>
    clamp255(c + [dr, dg, db][i]),
  );

  for (let s = 0; s < totalSteps; s++) {
    const t = s / totalSteps;

    // Small directional drift per segment creates organic waviness.
    ang += random(-0.022, 0.022);

    const nx = x + cos(ang) * step;
    const ny = y + sin(ang) * step;
    const currR = dist(nx, ny, cx, cy);

    if (goingOut && currR >= targetR * 0.97) break;
    if (!goingOut && currR <= targetR * 1.04) break;

    let r;
    let g;
    let b;
    let alpha;

    if (goingOut) {
      // Collarette -> limbus gradient.
      const ease = pow(t, 0.6);
      r = lerp(pStart[0], pEnd[0], ease);
      g = lerp(pStart[1], pEnd[1], ease);
      b = lerp(pStart[2], pEnd[2], ease);
      alpha = lerp(parentAlpha, parentAlpha * 0.17, pow(t, 1.3));
    } else {
      // Collarette -> pupil gradient.
      const ease = pow(t, 0.42);
      r = lerp(pStart[0], pInward[0], ease);
      g = lerp(pStart[1], pInward[1], ease);
      b = lerp(pStart[2], pInward[2], ease);
      alpha = min(lerp(parentAlpha, parentAlpha * 1.45, ease), 228);
    }

    stroke(r, g, b, alpha);
    strokeWeight(max(irisMinWidth, thickness * (1 - t * 0.65)));
    line(x, y, nx, ny);

    // Sparse branching for fractal-like iris texture depth.
    if (depth < 2 && s > totalSteps * 0.25 && random() < 0.016) {
      const bDir = random() < 0.5 ? 1 : -1;
      const bAngle = ang + bDir * random(0.2, 0.55);
      const remaining = abs(targetR - currR);
      if (remaining > 10) {
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
          palette,
        );
      }
    }

    x = nx;
    y = ny;
  }
}

// Additional outward collarette-seeded fibers that begin tangentially then fan out.
function drawCollaretteGrowingFibers(cx, cy, colPoints, irisR, palette) {
  const numFibers = growingFiberOutward;
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
    growRingOutwardFiber(cx, cy, sx, sy, irisR, palette);
  }
}

function growRingOutwardFiber(cx, cy, sx, sy, irisR, palette) {
  const radAng = atan2(sy - cy, sx - cx);
  const startR = dist(sx, sy, cx, cy);

  // Random CW/CCW tangential launch.
  const tangDir = random() < 0.5 ? 1 : -1;
  const tangAng = radAng + tangDir * HALF_PI + random(-0.28, 0.28);

  const step = 2.0;
  const totalSteps = max(5, floor((irisR - startR) / step));
  const tangentialPhase = 0.12;
  const parentAlpha = random(70, 118);
  const baseThickness = lerp(
    irisMinWidth,
    irisMaxWidth,
    lerp(0.5, random(), irisRandomness),
  );

  const cv = colorVariance * 55;
  const clamp255 = (v) => constrain(v, 0, 255);
  const dr = random(-cv, cv);
  const dg = random(-cv, cv);
  const db = random(-cv, cv);
  const pStart = palette.fiberStart.map((c, i) =>
    clamp255(c + [dr, dg, db][i]),
  );
  const pEnd = palette.fiberEnd.map((c, i) => clamp255(c + [dr, dg, db][i]));

  let drift = 0;
  let x = sx;
  let y = sy;
  let prevX = null;
  let prevY = null;

  for (let s = 0; s < totalSteps; s++) {
    const t = s / totalSteps;
    drift += random(-0.022, 0.022);

    let ang;
    if (t < tangentialPhase) {
      ang = tangAng + drift;
    } else {
      const blend = pow((t - tangentialPhase) / (1 - tangentialPhase), 0.55);
      ang = lerp(tangAng, radAng, blend) + drift * (1 - blend);
    }

    const nx = x + cos(ang) * step;
    const ny = y + sin(ang) * step;
    const currR = dist(nx, ny, cx, cy);
    if (currR >= irisR * 0.97) break;

    const rNorm = constrain((currR - startR) / (irisR - startR), 0, 1);
    const ease = pow(rNorm, 0.6);

    stroke(
      lerp(pStart[0], pEnd[0], ease),
      lerp(pStart[1], pEnd[1], ease),
      lerp(pStart[2], pEnd[2], ease),
      lerp(parentAlpha, parentAlpha * 0.17, pow(rNorm, 1.3)),
    );
    strokeWeight(max(irisMinWidth, baseThickness * (1 - rNorm * 0.65)));

    if (prevX !== null) line(prevX, prevY, nx, ny);
    prevX = nx;
    prevY = ny;
    x = nx;
    y = ny;
  }
}

// Additional inward collarette-seeded fibers that begin tangentially then curve to pupil.
function drawCollaretteInwardFibers(cx, cy, colPoints, pupilR, palette) {
  const numFibers = growingFiberInward;
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
    growRingInwardFiber(cx, cy, sx, sy, pupilR, palette);
  }
}

function growRingInwardFiber(cx, cy, sx, sy, pupilR, palette) {
  const radAng = atan2(sy - cy, sx - cx);
  const startR = dist(sx, sy, cx, cy);
  const inwardAng = radAng + PI;

  const tangDir = random() < 0.5 ? 1 : -1;
  const startAng = inwardAng + tangDir * random(1.0, 1.4);

  const step = 1.6;
  const totalSteps = max(5, floor((startR - pupilR) / step));
  const parentAlpha = random(70, 118);
  const baseThickness = lerp(
    irisMinWidth,
    irisMaxWidth,
    lerp(0.5, random(), irisRandomness),
  );

  const cv = colorVariance * 55;
  const clamp255 = (v) => constrain(v, 0, 255);
  const dr = random(-cv, cv);
  const dg = random(-cv, cv);
  const db = random(-cv, cv);
  const pStart = palette.fiberStart.map((c, i) =>
    clamp255(c + [dr, dg, db][i]),
  );
  const pInward = palette.inwardEnd.map((c, i) =>
    clamp255(c + [dr, dg, db][i]),
  );

  let drift = 0;
  let x = sx;
  let y = sy;
  let prevX = null;
  let prevY = null;

  for (let s = 0; s < totalSteps; s++) {
    const t = s / totalSteps;
    drift += random(-0.022, 0.022);

    const blend = pow(t, 0.55);
    const ang = lerp(startAng, inwardAng, blend) + drift * (1 - blend);

    const nx = x + cos(ang) * step;
    const ny = y + sin(ang) * step;
    const currR = dist(nx, ny, cx, cy);
    if (currR <= pupilR * 1.04) break;

    const ease = pow(t, 0.42);
    stroke(
      lerp(pStart[0], pInward[0], ease),
      lerp(pStart[1], pInward[1], ease),
      lerp(pStart[2], pInward[2], ease),
      min(lerp(parentAlpha, parentAlpha * 1.45, ease), 228),
    );
    strokeWeight(max(irisMinWidth, baseThickness * (1 - t * 0.65)));

    if (prevX !== null) line(prevX, prevY, nx, ny);
    prevX = nx;
    prevY = ny;
    x = nx;
    y = ny;
  }
}

// Tangential collarette traces that follow a smoothed data contour.
// function drawCollarette(cx, cy, points, palette) {
//   if (points.length < 3) return;

//   const n = points.length;
//   const numSamples = 400;
//   const smooth = [];

//   // Build Catmull-Rom samples around closed ring.
//   for (let i = 0; i < numSamples; i++) {
//     const t = i / numSamples;
//     const rawSeg = t * n;
//     const seg = floor(rawSeg);
//     const f = rawSeg - seg;

//     const p0 = points[(seg - 1 + n) % n];
//     const p1 = points[seg % n];
//     const p2 = points[(seg + 1) % n];
//     const p3 = points[(seg + 2) % n];

//     smooth.push({
//       x: curvePoint(p0.x, p1.x, p2.x, p3.x, f),
//       y: curvePoint(p0.y, p1.y, p2.y, p3.y, f),
//     });
//   }

//   noFill();
//   for (let trace = 0; trace < collaretteDensity; trace++) {
//     const fs = palette.fiberStart;
//     stroke(fs[0], fs[1], fs[2], random(50, 135));
//     strokeWeight(lerp(irisMinWidth, irisMaxWidth, lerp(0.5, random(), irisRandomness)));

//     let drift = 0;
//     let prevX = null;
//     let prevY = null;

//     for (const sp of smooth) {
//       drift += random(-0.022, 0.022);
//       const radAng = atan2(sp.y - cy, sp.x - cx);
//       const wx = sp.x + cos(radAng) * drift * 8;
//       const wy = sp.y + sin(radAng) * drift * 8;

//       if (prevX !== null) line(prevX, prevY, wx, wy);
//       prevX = wx;
//       prevY = wy;
//     }
//   }

//   // Optional white collarette reference curve.
//   if (showCollaretteCurve) {
//     stroke(255, 255, 255, 200);
//     strokeWeight(1.4);
//     noFill();
//     beginShape();
//     for (const p of points) vertex(p.x, p.y);
//     endShape(CLOSE);
//   }
// }

// ============================
// Data loading / hydration
// ============================
async function loadData() {
  loading = true;
  loadError = null;
  loadingMessage = "Loading local datasets...";

  if (window.location.protocol === "file:") {
    loadError =
      "Run this with a local server (not file://), e.g. `python3 -m http.server 8000`.";
    loading = false;
    redraw();
    return;
  }

  try {
    const [precipResp, tempResp] = await Promise.all([
      fetch(PRECIP_DATA_FILE, { cache: "no-store" }),
      fetch(TEMP_DATA_FILE, { cache: "no-store" }),
    ]);

    if (!precipResp.ok) {
      throw new Error(
        `Precip dataset file request failed: ${precipResp.status}`,
      );
    }
    if (!tempResp.ok) {
      throw new Error(`Temp dataset file request failed: ${tempResp.status}`);
    }

    const [precipPayload, tempPayload] = await Promise.all([
      precipResp.json(),
      tempResp.json(),
    ]);

    hydrateFromDatasets(precipPayload, tempPayload);
  } catch (err) {
    console.error(err);
    loadError =
      "Could not load local datasets. Run `node scripts/download_quebec_precip.mjs` and ensure monthly temperature JSON exists.";
  } finally {
    loading = false;
    redraw();
  }
}

function hydrateFromDatasets(precipPayload, tempPayload) {
  precipMeta = {
    source: precipPayload?.source || "Unknown",
    startYear: precipPayload?.startYear,
    endYear: precipPayload?.endYear,
  };
  tempMeta = {
    source: tempPayload?.source || "Unknown",
    startYear: tempPayload?.startYear,
    endYear: tempPayload?.endYear,
  };

  const precipRows = Array.isArray(precipPayload?.cities)
    ? precipPayload.cities
    : [];
  const tempRows = Array.isArray(tempPayload?.cities) ? tempPayload.cities : [];
  const baseRows = precipRows.length ? precipRows : tempRows;

  QUEBEC_CITIES = baseRows.map((row) => ({
    name: row.city,
    latitude: row.latitude,
    longitude: row.longitude,
  }));

  cityMonthlyPrecip = {};
  for (const row of precipRows) {
    cityMonthlyPrecip[row.city] = row.monthly || {};
  }

  cityMonthlyTemp = {};
  for (const row of tempRows) {
    cityMonthlyTemp[row.city] = row.monthly || {};
  }

  const years = new Set();
  const allTemps = [];

  for (const row of precipRows) {
    const monthly = row.monthly || {};
    for (const year of Object.keys(monthly)) years.add(Number(year));
  }

  for (const row of tempRows) {
    const monthly = row.monthly || {};
    for (const year of Object.keys(monthly)) {
      years.add(Number(year));
      const months = monthly[year] || {};
      for (const value of Object.values(months)) {
        if (Number.isFinite(value)) allTemps.push(value);
      }
    }
  }

  availableYears = [...years].sort((a, b) => a - b);
  if (!availableYears.length) {
    throw new Error("Dataset does not contain monthly values.");
  }

  if (allTemps.length) {
    globalTempMin = Math.floor(Math.min(...allTemps)) - 1;
    globalTempMax = Math.ceil(Math.max(...allTemps)) + 1;
    if (globalTempMin === globalTempMax) {
      globalTempMin -= 1;
      globalTempMax += 1;
    }
  }

  // Keep UI selectors inside dataset range.
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

// ============================
// Input + layout helpers
// ============================
function keyPressed() {
  if (key === "c" || key === "C") {
    showCollaretteCurve = !showCollaretteCurve;
    redraw();
  }
  if (key === "t" || key === "T") {
    showTempPupilGuide = !showTempPupilGuide;
    redraw();
  }
  if (key === "p" || key === "P") {
    showPrecipAxes = !showPrecipAxes;
    redraw();
  }
}

function windowResized() {
  resizeCanvas(getCanvasWidth(), CANVAS_H);
  positionSliders();
  redraw();
}

function getCanvasWidth() {
  return Math.min(windowWidth * CANVAS_W_RATIO, MAX_CANVAS_W);
}

function positionSliders() {
  const sx = width - SLIDER_W - 22;
  const sliders = [
    yearSlider,
    monthSlider,
    irisLineCountSlider,
    irisRandomnessSlider,
    irisMinWidthSlider,
    irisMaxWidthSlider,
    densitySlider,
    growingFiberOutwardSlider,
    growingFiberInwardSlider,
    colorVarianceSlider,
  ];

  sliders.forEach((slider, i) => {
    slider.position(sx, height - SLIDER_ROW_H * (sliders.length - i));
    slider.style("width", `${SLIDER_W}px`);
  });
}

function drawSliderLabels() {
  const sx = width - SLIDER_W - 22;

  const defs = [
    { name: "Year", range: "2000 - 2025", value: String(selectedYear) },
    {
      name: "Month",
      range: "Jan - Dec",
      value: MONTH_NAMES[selectedMonth - 1],
    },
    { name: "Iris lines", range: "0 - 3600", value: String(irisLineCount) },
    {
      name: "Width randomness",
      range: "0 - 1",
      value: irisRandomness.toFixed(2),
    },
    {
      name: "Min line width",
      range: "0.05 - 2.0",
      value: irisMinWidth.toFixed(2),
    },
    {
      name: "Max line width",
      range: "0.5 - 6.0",
      value: irisMaxWidth.toFixed(1),
    },
    { name: "Ring lines", range: "0 - 300", value: String(collaretteDensity) },
    {
      name: "Growing fibers (out)",
      range: "0 - 1000",
      value: String(growingFiberOutward),
    },
    {
      name: "Growing fibers (in)",
      range: "0 - 1000",
      value: String(growingFiberInward),
    },
    { name: "Color variance", range: "0 - 1", value: colorVariance.toFixed(2) },
  ];

  noStroke();
  textAlign(RIGHT, CENTER);

  defs.forEach((def, i) => {
    const sliderY = height - SLIDER_ROW_H * (defs.length - i);
    const midY = sliderY + 9 + SLIDER_LABEL_Y_NUDGE;
    const lx = sx - 10;

    fill(200, 175, 245);
    textSize(11);
    text(def.name, lx, midY - 7);

    fill(120, 96, 162);
    textSize(10);
    text(`${def.range}  ·  ${def.value}`, lx, midY + 7);
  });
}

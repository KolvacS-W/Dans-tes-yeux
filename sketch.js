const PRECIP_DATA_FILE = "./data/quebec_city_monthly_precip_2000_2025.json";
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

// Precipitation value (mm) that maps to the iris edge for the ring chart.
// Increase/decrease this to rescale the precipitation y-axis.
const PRECIP_Y_MAX_AT_EDGE = 500;
// Where precipitation y=0 starts on the iris radius (0..1).
// 0.0 = center, 1.0 = iris edge. Higher values reduce chart radial variation.
const PRECIP_Y_AXIS_START_RADIUS_NORM = 0.45;

let QUEBEC_CITIES = [];
let cityMonthlyPrecip = {};
let cityMonthlyTemp = {};
let availableYears = [];
let selectedYear = 2003;
let selectedMonth = 1;
let yearSlider;
let monthSlider;
let loading = true;
let loadError = null;
let loadingMessage = "Loading local dataset...";
let dataMeta = null;
let tempDataMeta = null;
let globalValueMin = null;
let globalValueMax = null;
let globalTempMin = null;
let globalTempMax = null;
let showCollaretteCurve = false;
let showTempPupilGuide = false;
let showPrecipAxes = false;
let lastChartState = null;
let collaretteDensity = 0;
let densitySlider;
let growingFiberOutward = 300;
let growingFiberOutwardSlider;
let growingFiberInward = 50;
let growingFiberInwardSlider;
let irisLineCount = 500;
let irisLineCountSlider;
let irisMinWidth = 0.5;
let irisMinWidthSlider;
let irisMaxWidth = 5.2;
let irisMaxWidthSlider;
let irisRandomness = 1.0;
let irisRandomnessSlider;
let colorVariance = 0.5;
let colorVarianceSlider;

// ─── Data-driven iris colour palettes ──────────────────────────────────────────
// Each palette defines the fiber gradient (collarette→limbus) and the inward
// gradient (collarette→pupil), matched to real eye colour photographs.
// Colors are hex strings so the IDE shows inline swatches for easy tweaking.

function hex(h) {
  return [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
}

const PALETTE_COLD = {
  // Blue eye  (coldest months)
  fiberStart: hex("#83bcf519"), // vivid cobalt-blue at collarette
  fiberEnd: hex("#0539a0"), // deep saturated navy at limbus
  inwardEnd: hex("#8bc0f4"), // icy blue-white at pupil
  base: hex("#01021e"), // near-black deep navy background
};
const PALETTE_HAZEL = {
  // Hazel eye  (mid-range months)
  fiberStart: hex("#f4a6385d"), // golden amber at collarette
  fiberEnd: hex("#2e4614"), // deep olive green at limbus
  inwardEnd: hex("#f0d7a5"), // warm cream at pupil
  base: hex("#070402"), // near-black warm-dark background
};
const PALETTE_WARM = {
  // Brown eye  (warmest months)
  fiberStart: hex("#e271204f"), // vivid burnt-orange amber at collarette
  fiberEnd: hex("#411a04"), // deep rich dark-brown at limbus
  inwardEnd: hex("#ffbc5a"), // warm golden-orange at pupil
  base: hex("#120501"), // near-black reddish-brown background
};

// Smoothly interpolates between low→mid→high value based on valueNorm ∈ [0,1].
function getIrisPalette(t) {
  const ss = (x) => x * x * (3 - 2 * x); // smoothstep
  let f, from, to;
  if (t <= 0.5) {
    f = ss(t * 2);
    from = PALETTE_COLD;
    to = PALETTE_HAZEL;
  } else {
    f = ss((t - 0.5) * 2);
    from = PALETTE_HAZEL;
    to = PALETTE_WARM;
  }
  const lc = (a, b) => [
    lerp(a[0], b[0], f),
    lerp(a[1], b[1], f),
    lerp(a[2], b[2], f),
  ];
  return {
    fiberStart: lc(from.fiberStart, to.fiberStart),
    fiberEnd: lc(from.fiberEnd, to.fiberEnd),
    inwardEnd: lc(from.inwardEnd, to.inwardEnd),
    base: lc(from.base, to.base),
  };
}

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
  if (showTempPupilGuide && lastChartState) drawTempPupilGuide(lastChartState);
  if (showPrecipAxes && lastChartState) drawPrecipAxesOverlay(lastChartState);
  drawSliderLabels();
}

function drawHeader() {
  noStroke();
  textAlign(LEFT, TOP);

  fill(210, 185, 245);
  textSize(24);
  text("Dans tes yeux", 40, 24);

  // textSize(14);
  // fill(165, 140, 210);
  // text(`Year: ${selectedYear}`, 42, 58);
  // text(`Month: ${MONTH_NAMES[selectedMonth - 1]}`, 42, 78);

  // if (dataMeta) {
  //   const precipYears = `${dataMeta.startYear}–${dataMeta.endYear}`;
  //   const tempYears = tempDataMeta
  //     ? `${tempDataMeta.startYear}–${tempDataMeta.endYear}`
  //     : precipYears;
  //   text(
  //     `Ring: precipitation (${precipYears}) · Color/Pupil: temperature (${tempYears})`,
  //     42,
  //     98,
  //   );
  // } else {
  //   text("Source: local pre-downloaded dataset", 42, 98);
  // }

  // textSize(10);
  // fill(115, 90, 155);
  // text(
  //   `[C] precision curve: ${showCollaretteCurve ? "ON" : "off"}  ·  Ring = precipitation · Pupil/Color = temperature`,
  //   42,
  //   118,
  // );
  // text(
  //   `[T] temp→pupil guide: ${showTempPupilGuide ? "ON" : "off"}  ·  [P] precip axes: ${showPrecipAxes ? "ON" : "off"}`,
  //   42,
  //   132,
  // );
}

function drawCenteredText(message, yRatio) {
  fill(165, 140, 210);
  textAlign(CENTER, CENTER);
  textSize(16);
  text(message, width / 2, height * yRatio);
}

// ─── Main chart / eye orchestrator ────────────────────────────────────────────

function drawChart() {
  const precipEntries = QUEBEC_CITIES.map((city) => {
    const byYear = cityMonthlyPrecip[city.name] || {};
    const byMonth = byYear[selectedYear] || {};
    return { name: city.name, value: byMonth[selectedMonth] ?? null };
  });

  const tempEntries = QUEBEC_CITIES.map((city) => {
    const byYear = cityMonthlyTemp[city.name] || {};
    const byMonth = byYear[selectedYear] || {};
    return { name: city.name, value: byMonth[selectedMonth] ?? null };
  });

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

  const vMin = 0;
  const vMax = max(vMin + 1, PRECIP_Y_MAX_AT_EDGE);

  const cx = width * 0.5;
  const cy = height * 0.5;
  const irisR = Math.min(width, height) * 0.27;

  // Collarette (line chart ring): vMax lands at the edge of the iris.
  // y-axis start radius is controlled by PRECIP_Y_AXIS_START_RADIUS_NORM.
  const colMinR = irisR * constrain(PRECIP_Y_AXIS_START_RADIUS_NORM, 0, 0.96);
  const colMaxR = irisR * 0.97;

  // Build collarette points from precipitation data (ring shape only)
  const colPoints = [];
  for (let i = 0; i < precipEntries.length; i++) {
    if (!Number.isFinite(precipEntries[i].value)) continue;
    const angle = map(i, 0, precipEntries.length, -HALF_PI, TWO_PI - HALF_PI);
    const r = map(
      constrain(precipEntries[i].value, vMin, vMax),
      vMin,
      vMax,
      colMinR,
      colMaxR,
    );
    colPoints.push({
      x: cx + cos(angle) * r,
      y: cy + sin(angle) * r,
      angle,
      r,
      value: precipEntries[i].value,
      name: precipEntries[i].name,
    });
  }

  // Temperature still controls pupil radius and color, as before.
  const monthlyTempMean =
    validTempValues.reduce((s, v) => s + v, 0) / validTempValues.length;
  const tMin = Number.isFinite(globalTempMin)
    ? globalTempMin
    : Math.floor(Math.min(...validTempValues)) - 1;
  const tMax = Number.isFinite(globalTempMax)
    ? globalTempMax
    : Math.ceil(Math.max(...validTempValues)) + 1;
  const meanR = map(monthlyTempMean, tMin, tMax, colMinR, colMaxR);
  const pupilR = max(irisR * 0.1, meanR * 0.6);

  // Colour palette driven by monthly mean temperature (0=coldest→blue, 1=warmest→brown)
  const tempNorm = constrain(map(monthlyTempMean, tMin, tMax, 0, 1), 0, 1);
  const palette = getIrisPalette(tempNorm);

  // Seed random so fibers are stable for a given year+month
  randomSeed(selectedYear * 100 + selectedMonth);

  drawIrisBase(cx, cy, irisR, palette);
  drawPupil(cx, cy, pupilR); // black base drawn first — fibers grow over it
  drawIrisFibers(cx, cy, pupilR, irisR, colPoints, palette);
  if (growingFiberOutward > 0)
    drawCollaretteGrowingFibers(cx, cy, colPoints, irisR, palette);
  if (growingFiberInward > 0)
    drawCollaretteInwardFibers(cx, cy, colPoints, pupilR, palette);
  if (collaretteDensity > 0) drawCollarette(cx, cy, colPoints, palette);
  drawLimbus(cx, cy, irisR);

  lastChartState = {
    cx,
    cy,
    irisR,
    colMinR,
    colMaxR,
    colPoints,
    precipEntries,
    vMin,
    vMax,
    monthlyTempMean,
    tMin,
    tMax,
    pupilR,
  };
}

function drawTempPupilGuide(state) {
  const {
    cx,
    cy,
    irisR,
    colMinR,
    colMaxR,
    monthlyTempMean,
    tMin,
    tMax,
    pupilR,
  } = state;
  const guideMinPupilR = max(irisR * 0.1, colMinR * 0.7);
  const guideMaxPupilR = max(irisR * 0.1, colMaxR * 0.7);
  const axisX = cx + irisR + 34;
  const yTop = cy - guideMaxPupilR;
  const yBottom = cy - guideMinPupilR;

  stroke(220, 236, 255, 120);
  strokeWeight(1);
  line(axisX, yTop, axisX, yBottom);

  noStroke();
  fill(215, 235, 255, 220);
  textAlign(LEFT, CENTER);
  textSize(10);
  text("Avg Temp (°C) -> pupil radius", axisX + 8, yTop - 10);

  const ticks = 6;
  for (let i = 0; i <= ticks; i++) {
    const f = i / ticks;
    const temp = lerp(tMin, tMax, f);
    const meanR = map(temp, tMin, tMax, colMinR, colMaxR);
    const pr = max(irisR * 0.1, meanR * 0.7);
    const y = cy - pr;
    stroke(220, 236, 255, 120);
    line(axisX - 5, y, axisX + 5, y);
    noStroke();
    fill(215, 235, 255, 210);
    text(`${temp.toFixed(1)}°`, axisX + 9, y);
  }

  const currY = cy - pupilR;
  stroke(255, 210, 120, 220);
  strokeWeight(1.2);
  line(axisX - 10, currY, axisX + 75, currY);
  noStroke();
  fill(255, 210, 120, 240);
  text(`current ${monthlyTempMean.toFixed(2)}°C`, axisX + 10, currY - 10);
}

function drawPrecipAxesOverlay(state) {
  const { cx, cy, colMinR, colMaxR, precipEntries, vMin, vMax } = state;
  textSize(10);

  // Y axis (radial): precipitation values as concentric rings.
  const ticks = 5;
  for (let i = 0; i <= ticks; i++) {
    const f = i / ticks;
    const val = lerp(vMin, vMax, f);
    const r = map(val, vMin, vMax, colMinR, colMaxR);
    noFill();
    stroke(168, 222, 255, 70);
    strokeWeight(1);
    circle(cx, cy, r * 2);
    noStroke();
    fill(168, 222, 255, 200);
    textAlign(LEFT, CENTER);
    text(`${val.toFixed(1)} mm`, cx + 8, cy - r - 2);
  }

  // Precise precipitation line chart (thick white), unsmoothed.
  // If there are missing city values, draw open segments to avoid false bridge lines.
  const plotPoints = precipEntries.map((e, i) => {
    if (!Number.isFinite(e.value)) return null;
    const angle = map(i, 0, precipEntries.length, -HALF_PI, TWO_PI - HALF_PI);
    const r = map(constrain(e.value, vMin, vMax), vMin, vMax, colMinR, colMaxR);
    return {
      x: cx + cos(angle) * r,
      y: cy + sin(angle) * r,
    };
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

  // X axis (angular): city spokes + exact city precipitation labels.
  for (let i = 0; i < precipEntries.length; i++) {
    const e = precipEntries[i];
    if (!Number.isFinite(e.value)) continue;
    const angle = map(i, 0, precipEntries.length, -HALF_PI, TWO_PI - HALF_PI);
    const r = map(e.value, vMin, vMax, colMinR, colMaxR);
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
    text(e.name, xl, yl);
    fill(255, 235, 180, 220);
    text(`${e.value.toFixed(1)} mm`, xp, yp - 10);
  }
}

// ─── Eye drawing functions ─────────────────────────────────────────────────────

function drawIrisBase(cx, cy, r, palette) {
  noStroke();
  fill(palette.base[0], palette.base[1], palette.base[2]);
  circle(cx, cy, r * 2);
}

// Spawns fiber seeds uniformly along the collarette curve, growing both
// outward (to the limbus) and inward (to the pupil).
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
        w,
        118,
        palette,
      );
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
        palette,
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
  palette,
) {
  if (depth > 2) return;

  let x = startX;
  let y = startY;
  // Initial directional jitter grows with depth (branches diverge more)
  let ang = angle + random(-0.09, 0.09) * (1 + depth * 0.75);

  const step = 1.8;
  const totalSteps = max(2, floor(abs(targetR - startR) / step));

  // Per-fiber color variance: one random RGB offset applied uniformly to all
  // gradient endpoints so the fiber shifts hue slightly while keeping its gradient shape.
  const cv = colorVariance * 55;
  const cl = (v) => constrain(v, 0, 255);
  const dr = random(-cv, cv),
    dg = random(-cv, cv),
    db = random(-cv, cv);
  const pStart = palette.fiberStart.map((c, i) => cl(c + [dr, dg, db][i]));
  const pEnd = palette.fiberEnd.map((c, i) => cl(c + [dr, dg, db][i]));
  const pInward = palette.inwardEnd.map((c, i) => cl(c + [dr, dg, db][i]));

  for (let s = 0; s < totalSteps; s++) {
    const t = s / totalSteps; // 0 = at collarette, 1 = at target

    // Slight per-step angular drift for organic curl
    ang += random(-0.022, 0.022);

    const nx = x + cos(ang) * step;
    const ny = y + sin(ang) * step;
    const currR = sqrt((nx - cx) * (nx - cx) + (ny - cy) * (ny - cy));

    if (goingOut && currR >= targetR * 0.97) break;
    if (!goingOut && currR <= targetR * 1.04) break;

    // Color gradient using perturbed palette endpoints
    let r, g, b, alpha;
    if (goingOut) {
      const ease = pow(t, 0.6);
      r = lerp(pStart[0], pEnd[0], ease);
      g = lerp(pStart[1], pEnd[1], ease);
      b = lerp(pStart[2], pEnd[2], ease);
      alpha = lerp(parentAlpha, parentAlpha * 0.17, pow(t, 1.3));
    } else {
      const ease = pow(t, 0.42);
      r = lerp(pStart[0], pInward[0], ease);
      g = lerp(pStart[1], pInward[1], ease);
      b = lerp(pStart[2], pInward[2], ease);
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
          palette,
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

// Each fiber starts tangentially (along the ring), then curves outward.
// Phase 1 (first ~12% of steps): moves in the tangential direction.
// Phase 2 (remaining steps): smoothly blends from tangential → radial outward.
// Colour and style identical to growFiber outward fibers.
function growRingOutwardFiber(cx, cy, sx, sy, irisR, palette) {
  const radAng = atan2(sy - cy, sx - cx);
  const startR = sqrt((sx - cx) * (sx - cx) + (sy - cy) * (sy - cy));

  // Random tangential launch direction (CW or CCW) with slight jitter
  const tangDir = random() < 0.5 ? 1 : -1;
  const tangAng = radAng + tangDir * HALF_PI + random(-0.28, 0.28);

  const step = 2.0;
  const totalSteps = max(5, floor((irisR - startR) / step));
  const tangPhase = 0.12;
  // Cap at 118 — the fixed parentAlpha of regular outward iris fibers — so growing
  // fibers never exceed the brightness of the iris layer behind them at any radius.
  const parentAlpha = random(70, 118);
  const baseThickness = lerp(
    irisMinWidth,
    irisMaxWidth,
    lerp(0.5, random(), irisRandomness),
  );

  // Per-fiber color variance
  const cv = colorVariance * 55;
  const cl = (v) => constrain(v, 0, 255);
  const dr = random(-cv, cv),
    dg = random(-cv, cv),
    db = random(-cv, cv);
  const pStart = palette.fiberStart.map((c, i) => cl(c + [dr, dg, db][i]));
  const pEnd = palette.fiberEnd.map((c, i) => cl(c + [dr, dg, db][i]));

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

    // Color driven by radial distance, using per-fiber perturbed palette
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

// Seeds fibers uniformly along the collarette ring that first travel tangentially
// then curve inward toward the pupil — mirror of drawCollaretteGrowingFibers.
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

// Fiber starts nearly tangential to the ring, then smoothly curves inward to pupil.
// Start angle is offset from the pure inward direction by 1.0–1.4 rad (57–80°),
// keeping it always within the inward half-circle so it never drifts outward.
function growRingInwardFiber(cx, cy, sx, sy, pupilR, palette) {
  const radAng = atan2(sy - cy, sx - cx);
  const startR = sqrt((sx - cx) * (sx - cx) + (sy - cy) * (sy - cy));
  const inwardAng = radAng + PI; // purely radial inward direction

  // Lean toward the ring tangent (57–80° off inward) while staying inward-half.
  // The offset is < PI/2 so cos component in the outward direction stays negative.
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

  // Per-fiber color variance
  const cv = colorVariance * 55;
  const cl = (v) => constrain(v, 0, 255);
  const dr = random(-cv, cv),
    dg = random(-cv, cv),
    db = random(-cv, cv);
  const pStart = palette.fiberStart.map((c, i) => cl(c + [dr, dg, db][i]));
  const pInward = palette.inwardEnd.map((c, i) => cl(c + [dr, dg, db][i]));

  let drift = 0;
  let x = sx,
    y = sy;
  let prevX = null,
    prevY = null;

  for (let s = 0; s < totalSteps; s++) {
    const t = s / totalSteps;
    drift += random(-0.022, 0.022);

    // Blend from tangential-lean → pure inward; drift fades so pupil arrival is clean
    const blend = pow(t, 0.55);
    const ang = lerp(startAng, inwardAng, blend) + drift * (1 - blend);

    const nx = x + cos(ang) * step;
    const ny = y + sin(ang) * step;
    const currR = sqrt((nx - cx) * (nx - cx) + (ny - cy) * (ny - cy));
    if (currR <= pupilR * 1.04) break;

    // Inward gradient using per-fiber perturbed palette
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

// Renders the collarette using the exact same visual style as the radial iris
// fibers (growFiber): each trace shares the same white-lavender→magenta colour
// ramp, the same thickness taper, and the same per-step angular drift — but
// runs tangentially around the Catmull-Rom smoothed data ring instead of
// Draws the collarette as collaretteDensity iris-line traces that follow the
// exact Catmull-Rom smooth data curve (no radial offset). Each trace carries
// the same per-step angular drift as growFiber, so lines stay organic while
// staying true to the curve shape. Colour = outward-fiber start (228,198,255).
function drawCollarette(cx, cy, points, palette) {
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
    // Ring trace colour = fiber start colour from palette
    const fs = palette.fiberStart;
    stroke(fs[0], fs[1], fs[2], random(50, 135));
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
      "Could not load local datasets. Run `node scripts/download_quebec_precip.mjs` and ensure temperature JSON exists.";
  } finally {
    loading = false;
    redraw();
  }
}

function hydrateFromDatasets(precipPayload, tempPayload) {
  dataMeta = {
    source: precipPayload?.source || "Unknown",
    startYear: precipPayload?.startYear,
    endYear: precipPayload?.endYear,
  };
  tempDataMeta = {
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
  precipRows.forEach((row) => {
    cityMonthlyPrecip[row.city] = row.monthly || {};
  });

  cityMonthlyTemp = {};
  tempRows.forEach((row) => {
    cityMonthlyTemp[row.city] = row.monthly || {};
  });

  const years = new Set();
  const allPrecipValues = [];
  precipRows.forEach((row) => {
    const monthly = row.monthly || {};
    Object.keys(monthly).forEach((year) => {
      years.add(Number(year));
      const months = monthly[year] || {};
      Object.values(months).forEach((value) => {
        if (Number.isFinite(value)) allPrecipValues.push(value);
      });
    });
  });

  const allTempValues = [];
  tempRows.forEach((row) => {
    const monthly = row.monthly || {};
    Object.keys(monthly).forEach((year) => {
      years.add(Number(year));
      const months = monthly[year] || {};
      Object.values(months).forEach((value) => {
        if (Number.isFinite(value)) allTempValues.push(value);
      });
    });
  });

  availableYears = [...years].sort((a, b) => a - b);
  if (!availableYears.length) {
    throw new Error("Dataset does not contain monthly values.");
  }

  if (allPrecipValues.length) {
    globalValueMin = Math.floor(Math.min(...allPrecipValues)) - 1;
    globalValueMax = Math.ceil(Math.max(...allPrecipValues)) + 1;
    if (globalValueMin === globalValueMax) {
      globalValueMax += 1;
      globalValueMin -= 1;
    }
  }
  if (allTempValues.length) {
    globalTempMin = Math.floor(Math.min(...allTempValues)) - 1;
    globalTempMax = Math.ceil(Math.max(...allTempValues)) + 1;
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
  resizeCanvas(getCanvasWidth(), 800);
  positionSliders();
  redraw();
}

function getCanvasWidth() {
  return Math.min(windowWidth * 0.95, 1100);
}

// Ordered top → bottom; must match the SLIDER_DEFS order in drawSliderLabels
const SLIDER_ROW_H = 32;
const SLIDER_W = 185;

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
  sliders.forEach((s, i) => {
    s.position(sx, height - SLIDER_ROW_H * (sliders.length - i));
    s.style("width", SLIDER_W + "px");
  });
}

function drawSliderLabels() {
  const sx = width - SLIDER_W - 22; // slider left edge

  const defs = [
    { name: "Year", range: "2000 – 2025", val: String(selectedYear) },
    { name: "Month", range: "Jan – Dec", val: MONTH_NAMES[selectedMonth - 1] },
    { name: "Iris lines", range: "0 – 3600", val: String(irisLineCount) },
    {
      name: "Width randomness",
      range: "0 – 1",
      val: irisRandomness.toFixed(2),
    },
    {
      name: "Min line width",
      range: "0.05 – 2.0",
      val: irisMinWidth.toFixed(2),
    },
    {
      name: "Max line width",
      range: "0.5 – 6.0",
      val: irisMaxWidth.toFixed(1),
    },
    { name: "Ring lines", range: "0 – 300", val: String(collaretteDensity) },
    {
      name: "Growing fibers (out)",
      range: "0 – 1000",
      val: String(growingFiberOutward),
    },
    {
      name: "Growing fibers (in)",
      range: "0 – 1000",
      val: String(growingFiberInward),
    },
    { name: "Color variance", range: "0 – 1", val: colorVariance.toFixed(2) },
  ];

  noStroke();
  textAlign(RIGHT, CENTER);

  defs.forEach((d, i) => {
    const sliderY = height - SLIDER_ROW_H * (defs.length - i);
    const midY = sliderY + 9; // vertical centre of the slider thumb
    const lx = sx - 10; // label right edge

    // Slider name
    fill(200, 175, 245);
    textSize(11);
    text(d.name, lx, midY - 7);

    // Range  ·  current value
    fill(120, 96, 162);
    textSize(10);
    text(`${d.range}  ·  ${d.val}`, lx, midY + 7);
  });
}

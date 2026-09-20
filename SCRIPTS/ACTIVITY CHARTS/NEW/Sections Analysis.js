(() => {
// =====================================================
// NP Sections + Variability + Surges
// Asse X = moving time (sezioni larghe uguali)
// Etichette asse X = km
// Surges corti: 5s continui ≥200% FTP
// Surges lunghi: avg 30s ≥150% FTP
// =====================================================

const CONFIG = {
  // --- SEZIONI ---
  SECTION_MINUTES: 30,

  // --- SURGES ---
  SURGE1_MIN_SECONDS: 5,
  SURGE1_THRESHOLD_PCT: 200,
  SURGE2_WINDOW_SECONDS: 30,
  SURGE2_THRESHOLD_PCT: 150,
  SURGE2_MIN_SECONDS: 30,
  MERGE_GAP_SECONDS: 2,

  // --- COLORAZIONE POTENZA (5s) ---
  POWER_SMOOTH_SEC: 5,
  COAST_THRESHOLD: 10,

  // --- DOWNSAMPLE ---
  DISPLAY_STEP: 5,

  // --- COLORI ---
  COLORI: {
    ALT:                '#e2dedeff',
    FILL:               '#e2dedeff',
    COAST:              '#1100ffff',
    SOTTO_80:           '#24e04d',
    TRA_80_100:         '#ffe600',
    SOPRA_CP:           '#fa0710ff',
    SECTION_LINE:       '#24e04dff',
    SURGE1:             'rgba(0,0,0,0.55)',        // nero – corti
    SURGE2:             'rgba(120,40,180,0.22)',   // viola soffuso – lunghi
    // testo + linee Avg/NP
    AVG_TEXT:           '#5dade2',   // azzurro chiaro
    NP_TEXT:            '#1a5276',   // blu scuro
    AVG_LINE:           '#5dade2',
    NP_LINE:            '#1a5276',
    HR_AVG:             '#e74c3c',   // rosso medio (più chiaro)
    HR_MAX:             '#922b21',   // rosso scuro
    SURGE1_TEXT:        '#111111',   // nero
    SURGE2_TEXT:        '#6c3483',   // viola
  },

  // --- LAYOUT ---
  HEIGHT: 580,
  MARGIN: { t: 90, l: 50, r: 55, b: 50 },
  TITLE: 'NP Sections + VI + Surges',
};

// =====================================================
// UTILITY
// =====================================================
const fmt = (n, d = 0) => Number(n).toFixed(d);
const fmtTime = (sec) => {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

function getStream(name) {
  const s = icu.streams.get(name);
  return s && s.data ? s.data.map(v => v ?? 0) : [];
}

function computeSampleInterval(timeArr) {
  if (!timeArr || timeArr.length < 2) return 1;
  const deltas = [];
  for (let i = 1; i < timeArr.length; i++) {
    const d = timeArr[i] - timeArr[i - 1];
    if (d > 0 && isFinite(d)) deltas.push(d);
  }
  if (deltas.length === 0) return 1;
  deltas.sort((a, b) => a - b);
  const mid = Math.floor(deltas.length / 2);
  return deltas.length % 2 === 1 ? deltas[mid] : (deltas[mid - 1] + deltas[mid]) / 2;
}

function getSurgeClustersRaw(data, threshold, minSamples, mergeGapSamples) {
  const above = data.map(v => v >= threshold);
  const runs = [];
  let i = 0;
  while (i < above.length) {
    if (above[i]) {
      let start = i;
      while (i + 1 < above.length && above[i + 1]) i++;
      const end = i;
      if (end - start + 1 >= minSamples) runs.push({ start, end, length: end - start + 1 });
    }
    i++;
  }
  if (runs.length === 0) return [];

  const clusters = [];
  let current = { runs: [runs[0]], start: runs[0].start, end: runs[0].end };
  for (let r = 1; r < runs.length; r++) {
    const gap = runs[r].start - current.end - 1;
    if (gap <= mergeGapSamples) {
      current.runs.push(runs[r]);
      current.end = runs[r].end;
    } else {
      clusters.push(current);
      current = { runs: [runs[r]], start: runs[r].start, end: runs[r].end };
    }
  }
  clusters.push(current);

  for (const cl of clusters) {
    let totalSamples = 0, totalPower = 0;
    for (const r of cl.runs) {
      totalSamples += (r.end - r.start + 1);
      for (let k = r.start; k <= r.end; k++) totalPower += data[k];
    }
    cl.avg = totalSamples > 0 ? totalPower / totalSamples : 0;
    cl.duration = totalSamples;
  }
  return clusters;
}

function getSurgeClustersByAvg(power, windowSec, threshold, minDurationSec, mergeGapSec, sampleInterval) {
  const n = power.length;
  if (n < 2) return [];

  const windowSamples = Math.max(1, Math.round(windowSec / sampleInterval));
  const minSamples = Math.max(1, Math.round(minDurationSec / sampleInterval));
  const mergeGapSamples = Math.max(0, Math.round(mergeGapSec / sampleInterval));

  const cum = new Array(n + 1).fill(0);
  for (let i = 0; i < n; i++) cum[i + 1] = cum[i] + power[i];

  const above = new Array(n).fill(false);
  for (let end = windowSamples - 1; end < n; end++) {
    const start = end - windowSamples + 1;
    const mean = (cum[end + 1] - cum[start]) / windowSamples;
    if (mean >= threshold) {
      for (let k = start; k <= end; k++) above[k] = true;
    }
  }

  const runs = [];
  let i = 0;
  while (i < n) {
    if (above[i]) {
      let start = i;
      while (i + 1 < n && above[i + 1]) i++;
      const end = i;
      if (end - start + 1 >= minSamples) runs.push({ start, end, length: end - start + 1 });
    }
    i++;
  }
  if (runs.length === 0) return [];

  const clusters = [];
  let current = { runs: [runs[0]], start: runs[0].start, end: runs[0].end };
  for (let r = 1; r < runs.length; r++) {
    const gap = runs[r].start - current.end - 1;
    if (gap <= mergeGapSamples) {
      current.runs.push(runs[r]);
      current.end = runs[r].end;
    } else {
      clusters.push(current);
      current = { runs: [runs[r]], start: runs[r].start, end: runs[r].end };
    }
  }
  clusters.push(current);

  for (const cl of clusters) {
    let totalSamples = 0, totalPower = 0;
    for (const r of cl.runs) {
      totalSamples += (r.end - r.start + 1);
      for (let k = r.start; k <= r.end; k++) totalPower += power[k];
    }
    cl.avg = totalSamples > 0 ? totalPower / totalSamples : 0;
    cl.duration = totalSamples;
  }
  return clusters;
}

function calcNP(powerArr, timeArr, startIdx, endIdx) {
  if (endIdx <= startIdx) return 0;
  const n = endIdx - startIdx + 1;
  const rolling = new Array(n).fill(0);
  let left = startIdx, sum = 0, count = 0;
  for (let i = startIdx; i <= endIdx; i++) {
    sum += powerArr[i];
    count++;
    while (left < i && (timeArr[i] - timeArr[left]) > 30) {
      sum -= powerArr[left];
      count--;
      left++;
    }
    rolling[i - startIdx] = count > 0 ? sum / count : 0;
  }
  let sum4 = 0;
  for (let i = 0; i < n; i++) {
    const v = rolling[i];
    sum4 += v * v * v * v;
  }
  return Math.pow(sum4 / n, 0.25);
}

// =====================================================
// STREAMS
// =====================================================
const alt_raw  = getStream("fixed_altitude");
const dist_raw = getStream("distance");
const time_raw = getStream("time");
const pwr_raw  = getStream("fixed_watts");
const hr_raw   = getStream("fixed_heartrate");

const FTP = icu.activity.icu_ftp || (icu.sportSettings && icu.sportSettings.ftp) || 250;
const sampleInterval = computeSampleInterval(time_raw) || 1;

const firstAlt = alt_raw.find(v => v > 0);
if (firstAlt !== undefined) {
  for (let i = 0; i < alt_raw.length && alt_raw[i] === 0; i++) alt_raw[i] = firstAlt;
}

const distKm_raw = dist_raw.map(d => d / 1000);

// Moving time full-res
const mov_raw = [0];
for (let i = 1; i < time_raw.length; i++) {
  const dt = time_raw[i] - time_raw[i - 1];
  const dd = distKm_raw[i] - distKm_raw[i - 1];
  const v = dt > 0 ? (dd * 3600) / dt : 0;
  mov_raw.push(v > 1 ? mov_raw[i - 1] + dt : mov_raw[i - 1]);
}

// =====================================================
// SURGES
// =====================================================
const thr1 = (CONFIG.SURGE1_THRESHOLD_PCT / 100) * FTP;
const thr2 = (CONFIG.SURGE2_THRESHOLD_PCT / 100) * FTP;
const minSamp1 = Math.max(1, Math.round(CONFIG.SURGE1_MIN_SECONDS / sampleInterval));
const mergeGapSamp = Math.max(0, Math.round(CONFIG.MERGE_GAP_SECONDS / sampleInterval));

const clusters1 = getSurgeClustersRaw(pwr_raw, thr1, minSamp1, mergeGapSamp);
const clusters2 = getSurgeClustersByAvg(
  pwr_raw,
  CONFIG.SURGE2_WINDOW_SECONDS,
  thr2,
  CONFIG.SURGE2_MIN_SECONDS,
  CONFIG.MERGE_GAP_SECONDS,
  sampleInterval
);

// =====================================================
// SEZIONI (basate su moving time – larghezze uguali)
// =====================================================
const sectionSec = CONFIG.SECTION_MINUTES * 60;
const totalMov = mov_raw[mov_raw.length - 1] || 0;
const numSections = Math.max(1, Math.ceil(totalMov / sectionSec));
const displayTotal = numSections * sectionSec;

const sezioni = [];
for (let s = 0; s < numSections; s++) {
  const t0 = s * sectionSec;
  const t1 = Math.min((s + 1) * sectionSec, totalMov);

  let i0 = 0, i1 = mov_raw.length - 1;
  for (let i = 0; i < mov_raw.length; i++) {
    if (mov_raw[i] >= t0) { i0 = i; break; }
  }
  for (let i = i0; i < mov_raw.length; i++) {
    if (mov_raw[i] >= t1) { i1 = i; break; }
  }
  if (s === numSections - 1) i1 = mov_raw.length - 1;

  let sumP = 0, nP = 0, sumHR = 0, nHR = 0;
  for (let i = i0; i <= i1; i++) {
    if (i === 0 || mov_raw[i] > mov_raw[i - 1]) {
      sumP += pwr_raw[i];
      nP++;
      if (hr_raw[i] > 0) { sumHR += hr_raw[i]; nHR++; }
    }
  }
  const avgP = nP > 0 ? sumP / nP : 0;
  const avgHR = nHR > 0 ? sumHR / nHR : 0;
  const np = calcNP(pwr_raw, time_raw, i0, i1);
  const vi = avgP > 0 ? np / avgP : 0;

  let max5sHR = 0;
  const win5 = Math.max(1, Math.round(5 / sampleInterval));
  for (let i = i0; i <= i1 - win5 + 1; i++) {
    let sHR = 0, n = 0;
    for (let j = i; j < i + win5 && j <= i1; j++) {
      if (hr_raw[j] > 0) { sHR += hr_raw[j]; n++; }
    }
    if (n > 0 && sHR / n > max5sHR) max5sHR = sHR / n;
  }

  const count1 = clusters1.filter(c => {
    const mid = Math.floor((c.start + c.end) / 2);
    return mov_raw[mid] >= t0 && mov_raw[mid] < t1;
  }).length;

  const count2 = clusters2.filter(c => {
    const mid = Math.floor((c.start + c.end) / 2);
    return mov_raw[mid] >= t0 && mov_raw[mid] < t1;
  }).length;

  sezioni.push({
    s, t0, t1, i0, i1,
    avgP, np, vi, avgHR, max5sHR,
    count1, count2,
    durationSec: t1 - t0,
    // x in the equal-width display grid
    x0: t0,
    x1: (s + 1) * sectionSec
  });
}

// =====================================================
// DOWNSAMPLE (x = moving time)
// =====================================================
const STEP = CONFIG.DISPLAY_STEP;
let alt = [], time = [], pwr = [], distKm = [], mov = [];
for (let i = 0; i < time_raw.length; i++) {
  if (i === 0 || (time_raw[i] - time_raw[0]) % STEP < 0.001 || i === time_raw.length - 1) {
    alt.push(alt_raw[i]);
    time.push(time_raw[i]);
    pwr.push(pwr_raw[i]);
    distKm.push(distKm_raw[i]);
    mov.push(mov_raw[i]);
  }
}
const SMOOTH_PTS = Math.max(1, Math.round(CONFIG.POWER_SMOOTH_SEC / STEP));
const pwrSmooth = pwr.map((_, i) => {
  let s = 0, n = 0;
  const from = Math.max(0, i - SMOOTH_PTS + 1);
  for (let j = from; j <= i; j++) { s += pwr[j]; n++; }
  return n ? s / n : 0;
});

// =====================================================
// Y-AXIS
// =====================================================
const minAlt = Math.min(...alt);
const maxAlt = Math.max(...alt);
const elevationGain = maxAlt - minAlt;
const paddingTop    = 360;
const paddingBottom = minAlt >= 100 ? 80 : Math.max(0, minAlt * 0.5);
const rangeY_base   = Math.max(elevationGain * 1.5, elevationGain + 280);
const rangeY_final  = rangeY_base + paddingBottom + paddingTop;
const roundTo       = 50;
const yMin          = Math.floor((minAlt - paddingBottom) / roundTo) * roundTo;
const yMaxRaw       = Math.ceil((yMin + rangeY_final) / roundTo) * roundTo;
const yMaxCap       = Math.ceil((maxAlt + paddingTop) / roundTo) * roundTo;
const yMax          = Math.min(yMaxRaw, yMaxCap);

const allPowers = sezioni.flatMap(s => [s.avgP, s.np]);
const maxP = Math.max(...allPowers, 50);
const y2Max = Math.ceil(maxP * 1.25 / 25) * 25;
const y2Min = 0;

// =====================================================
// TICK ASSE X: posizioni in moving-time, etichette = km
// =====================================================
const tickVals = [];
const tickText = [];
// un tick ogni ~10 km (o ogni sezione se più denso)
const maxDist = distKm_raw[distKm_raw.length - 1] || 1;
const kmStep = maxDist > 80 ? 10 : (maxDist > 40 ? 5 : 2);
let nextKm = 0;
for (let i = 0; i < mov_raw.length; i++) {
  if (distKm_raw[i] >= nextKm) {
    tickVals.push(mov_raw[i]);
    tickText.push(fmt(distKm_raw[i], 0));
    nextKm += kmStep;
  }
}
// assicura l'ultimo
if (tickVals.length === 0 || tickVals[tickVals.length - 1] < mov_raw[mov_raw.length - 1] - 30) {
  tickVals.push(mov_raw[mov_raw.length - 1]);
  tickText.push(fmt(maxDist, 0));
}

// =====================================================
// TRACES (x = moving time)
// =====================================================
const data = [];

// Hover text
const hoverTexts = mov.map((m, i) => {
  const sec = Math.floor(time[i] % 60);
  const min = Math.floor((time[i] / 60) % 60);
  const hr = Math.floor(time[i] / 3600);
  const tStr = `${String(hr).padStart(2,'0')}:${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  const mSec = Math.floor(m % 60);
  const mMin = Math.floor((m / 60) % 60);
  const mHr = Math.floor(m / 3600);
  const mStr = `${String(mHr).padStart(2,'0')}:${String(mMin).padStart(2,'0')}:${String(mSec).padStart(2,'0')}`;
  return `⏱ ${tStr}<br>🚴 ${mStr}<br>📏 ${fmt(distKm[i], 2)} km<br>⛰ ${fmt(alt[i], 0)} m<br>⚡ ${fmt(pwrSmooth[i], 0)} W`;
});

data.push({
  x: mov,
  y: alt,
  type: 'scatter',
  mode: 'lines',
  fill: 'tozeroy',
  fillcolor: CONFIG.COLORI.FILL,
  line: { width: 0, color: CONFIG.COLORI.FILL },
  yaxis: 'y',
  showlegend: false,
  text: hoverTexts,
  hoverinfo: 'text',
  hoverlabel: { bgcolor: 'rgba(255,255,255,0.95)', bordercolor: '#888', font: { size: 12 } }
});

function colorSeg(cond, col) {
  const traces = [];
  for (let i = 1; i < pwrSmooth.length; i++) {
    if (cond(pwrSmooth[i - 1]) || cond(pwrSmooth[i])) {
      traces.push({
        x: [mov[i - 1], mov[i]],
        y: [alt[i - 1], alt[i]],
        type: 'scatter',
        mode: 'lines',
        line: { color: col, width: 4 },
        yaxis: 'y',
        showlegend: false,
        hoverinfo: 'skip'
      });
    }
  }
  return traces;
}
const ftp80 = FTP * 0.8;
data.push(...colorSeg(w => w < CONFIG.COAST_THRESHOLD, CONFIG.COLORI.COAST));
data.push(...colorSeg(w => w >= CONFIG.COAST_THRESHOLD && w < ftp80, CONFIG.COLORI.SOTTO_80));
data.push(...colorSeg(w => w >= ftp80 && w < FTP, CONFIG.COLORI.TRA_80_100));
data.push(...colorSeg(w => w >= FTP, CONFIG.COLORI.SOPRA_CP));

// Linee Avg / NP
sezioni.forEach(sec => {
  data.push({
    x: [sec.x0, sec.x1],
    y: [sec.avgP, sec.avgP],
    type: 'scatter',
    mode: 'lines',
    line: { color: CONFIG.COLORI.AVG_LINE, width: 3 },
    yaxis: 'y2',
    showlegend: false,
    hoverinfo: 'skip'
  });
  data.push({
    x: [sec.x0, sec.x1],
    y: [sec.np, sec.np],
    type: 'scatter',
    mode: 'lines',
    line: { color: CONFIG.COLORI.NP_LINE, width: 3 },
    yaxis: 'y2',
    showlegend: false,
    hoverinfo: 'skip'
  });
});

// =====================================================
// SHAPES + ANNOTATIONS
// =====================================================
const shapes = [];
const annotations = [];

const surge1Label = `S≥${CONFIG.SURGE1_MIN_SECONDS}s >${CONFIG.SURGE1_THRESHOLD_PCT}%`;
const surge2Label = `S≥${CONFIG.SURGE2_WINDOW_SECONDS}s >${CONFIG.SURGE2_THRESHOLD_PCT}%`;

// Bande surges su moving-time
function addSurgeBands(clusters, fillcolor) {
  clusters.forEach(cl => {
    cl.runs.forEach(r => {
      const x0 = mov_raw[r.start];
      const x1 = mov_raw[r.end];
      if (x1 <= x0) return;
      // larghezza minima ~8 secondi visuali
      const w = Math.max(x1 - x0, 8);
      shapes.push({
        type: 'rect',
        xref: 'x',
        yref: 'paper',
        x0: x0,
        x1: x0 + w,
        y0: 0,
        y1: 1,
        fillcolor: fillcolor,
        line: { width: 0 },
        layer: 'above'
      });
    });
  });
}
addSurgeBands(clusters2, CONFIG.COLORI.SURGE2);
addSurgeBands(clusters1, CONFIG.COLORI.SURGE1);

sezioni.forEach((sec, idx) => {
  if (idx < sezioni.length - 1) {
    shapes.push({
      type: 'line',
      xref: 'x',
      yref: 'paper',
      x0: sec.x1,
      x1: sec.x1,
      y0: 0,
      y1: 1,
      line: { color: CONFIG.COLORI.SECTION_LINE, width: 1.5, dash: 'solid' }
    });
  }

  const midX = (sec.x0 + sec.x1) / 2;

  const C = CONFIG.COLORI;
  const label =
    `<span style="color:${C.AVG_TEXT}">${fmt(sec.avgP, 0)} W</span>` +
    ` <span style="color:#888">|</span> ` +
    `<span style="color:${C.NP_TEXT}">NP ${fmt(sec.np, 0)}</span>` +
    `<br><span style="color:#555">VI ${fmt(sec.vi, 2)}</span>` +
    `<br><span style="color:${C.HR_AVG}">Avg HR ${fmt(sec.avgHR, 0)}</span>` +
    ` <span style="color:#888">·</span> ` +
    `<span style="color:${C.HR_MAX}">Max 5s ${fmt(sec.max5sHR, 0)}</span>` +
    `<br><span style="color:${C.SURGE1_TEXT}">${surge1Label} ${sec.count1}</span>` +
    `<br><span style="color:${C.SURGE2_TEXT}">${surge2Label} ${sec.count2}</span>`;

  annotations.push({
    x: midX,
    y: 0.98,
    xref: 'x',
    yref: 'paper',
    text: label,
    showarrow: false,
    yanchor: 'top',
    xanchor: 'center',
    align: 'center',
    font: { family: 'Arial Black', size: 10 },
    bgcolor: 'rgba(255,255,255,0.90)',
    borderpad: 4
  });

  annotations.push({
    x: midX,
    y: 0.02,
    xref: 'x',
    yref: 'paper',
    text: fmtTime(sec.durationSec),
    showarrow: false,
    yanchor: 'bottom',
    xanchor: 'center',
    font: { family: 'Arial', size: 10, color: '#333' }
  });
});

for (let i = 1; i < time.length; i++) {
  const dt = time[i] - time[i - 1];
  if (dt >= 300 && dt < 900) {
    annotations.push({
      x: mov[i], y: alt[i] + 60, xref: 'x', yref: 'y',
      text: '⏸️', showarrow: false,
      font: { color: '#d80000', size: 14 }, yanchor: 'middle'
    });
  } else if (dt >= 900) {
    annotations.push({
      x: mov[i], y: alt[i] + 60, xref: 'x', yref: 'y',
      text: '⏹️', showarrow: false,
      font: { color: '#d80000', size: 14 }, yanchor: 'middle'
    });
  }
}

// =====================================================
// LAYOUT
// =====================================================
const layout = {
  height: CONFIG.HEIGHT,
  margin: CONFIG.MARGIN,
  title: {
    text: `${CONFIG.TITLE}  ·  sezioni ${CONFIG.SECTION_MINUTES} min  ·  ${surge1Label}  ·  ${surge2Label}`,
    font: { size: 13 }
  },
  xaxis: {
    title: 'Distance (km)',
    tickvals: tickVals,
    ticktext: tickText,
    range: [0, displayTotal * 1.01],
    showgrid: true,
    gridcolor: '#EEEEEE',
    zeroline: false
  },
  yaxis: {
    title: 'Altitude (m)',
    range: [yMin, yMax],
    showgrid: true,
    gridcolor: '#CCCCCC',
    zeroline: false
  },
  yaxis2: {
    title: 'Power (W)',
    overlaying: 'y',
    side: 'right',
    range: [y2Min, y2Max],
    showgrid: false,
    zeroline: false,
    tickfont: { size: 11 }
  },
  shapes: shapes,
  annotations: annotations,
  showlegend: false,
  hovermode: 'closest'
};

return { data, layout };
})();

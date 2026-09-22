// ============================================================
// SURGES TABLE - stessa logica dello script altimetrico
// Ordinamento: cronologico
// ============================================================
const CONFIG = {
  MIN_EFFORT_INTENSITY_FTP: 220,
  MIN_SURGE_SECONDS: 5,
  MERGE_GAP_SECONDS: 2,

  LOOKBACK_SECONDS: 4,
  SMOOTH_SECONDS: 2,
  LOW_POWER_THRESHOLD_FTP: 130,
  MIN_SPEED_RISE: 1,

  ENTRY_SPEED_SECONDS: 4,
  TOP_N: 40
};

const FTP = icu.activity.icu_ftp;
const weight = icu.activity.icu_weight;

function getStreamData(name) {
  const s = icu.streams.get(name);
  return s && s.data ? s.data.map(v => v ?? 0) : Array(icu.streams.get("time").data.length).fill(0);
}

const power      = getStreamData("fixed_watts");
const time       = getStreamData("time");
const distance   = getStreamData("distance");
const distanceKm = distance.map(d => d / 1000);
const cadence    = getStreamData("cadence");
const torque     = getStreamData("torque");
const heartrate  = getStreamData("fixed_heartrate");
const grade      = getStreamData("grade_smooth");
const speedKmh   = getStreamData("velocity_smooth").map(v => (v || 0) * 3.6);

function computeSampleInterval(t) {
  if (!t || t.length < 2) return 1;
  const d = [];
  for (let i = 1; i < t.length; i++) {
    const delta = t[i] - t[i-1];
    if (delta > 0 && isFinite(delta)) d.push(delta);
  }
  if (!d.length) return 1;
  d.sort((a,b) => a-b);
  const m = Math.floor(d.length/2);
  return d.length % 2 ? d[m] : (d[m-1] + d[m]) / 2;
}

function secondsToHms(sec) {
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return (h > 0 ? String(h).padStart(2,'0') + ':' : '') +
         String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
}

function getSurgeClusters(data, threshold, minSamples, mergeGapSamples) {
  const above = data.map(v => v >= threshold);
  const runs = [];
  let i = 0;
    while (i < above.length) {
    if (above[i]) {
      let start = i;
      while (i+1 < above.length && above[i+1]) i++;
      if (i - start + 1 >= minSamples) runs.push({start, end: i});
    }
    i++;
  }
  if (!runs.length) return [];

  const clusters = [];
  let cur = {runs: [runs[0]], start: runs[0].start, end: runs[0].end};
  for (let r = 1; r < runs.length; r++) {
    if (runs[r].start - cur.end - 1 <= mergeGapSamples) {
      cur.runs.push(runs[r]);
      cur.end = runs[r].end;
    } else {
      clusters.push(cur);
      cur = {runs: [runs[r]], start: runs[r].start, end: runs[r].end};
    }
  }
  clusters.push(cur);

  for (const cl of clusters) {
    let totS = 0, totP = 0;
    for (const r of cl.runs) {
      totS += r.end - r.start + 1;
      for (let k = r.start; k <= r.end; k++) totP += data[k];
    }
    cl.avg = totS ? totP / totS : 0;
    cl.duration = totS;
    cl.originalStart = cl.start;
  }
  return clusters;
}

function findBetterStartBySpeedMin(powerStart, powerEnd, lookbackSamples, smoothSamples, lowPowerThr, minRise) {
  const from = Math.max(0, powerStart - lookbackSamples);

  const rawSpeed = speedKmh.slice(from, powerEnd + 1);

  const smooth = [];
  for (let i = 0; i < rawSpeed.length; i++) {
    let sum = 0, cnt = 0;
    for (let k = Math.max(0, i - Math.floor(smoothSamples/2)); k <= Math.min(rawSpeed.length-1, i + Math.floor(smoothSamples/2)); k++) {
      sum += rawSpeed[k];
      cnt++;
    }
    smooth.push(sum / cnt);
  }

  const lookbackLen = powerStart - from;
  if (lookbackLen < 2) return powerStart;

  let minVal = Infinity;
  let minIdx = lookbackLen;
  for (let i = 0; i < lookbackLen; i++) {
    if (smooth[i] < minVal) {
      minVal = smooth[i];
      minIdx = i;
    }
  }

  const speedAtPowerStart = smooth[lookbackLen] || smooth[smooth.length-1];
  if (speedAtPowerStart - minVal < minRise) return powerStart;

  let candidate = from + minIdx;
  while (candidate < powerStart && power[candidate] < lowPowerThr) candidate++;
  return Math.min(candidate + 1, powerStart);
}

const sampleInterval = computeSampleInterval(time) || 1;
const threshold = (CONFIG.MIN_EFFORT_INTENSITY_FTP / 100) * FTP;
const lowThr = (CONFIG.LOW_POWER_THRESHOLD_FTP / 100) * FTP;
const minSamples = Math.max(1, Math.round(CONFIG.MIN_SURGE_SECONDS / sampleInterval));
const mergeGapSamples = Math.max(0, Math.round(CONFIG.MERGE_GAP_SECONDS / sampleInterval));
const lookbackSamples = Math.round(CONFIG.LOOKBACK_SECONDS / sampleInterval);
const smoothSamples = Math.max(1, Math.round(CONFIG.SMOOTH_SECONDS / sampleInterval));

let clusters = getSurgeClusters(power, threshold, minSamples, mergeGapSamples);

clusters.forEach(cl => {
  const better = findBetterStartBySpeedMin(cl.start, cl.end, lookbackSamples, smoothSamples, lowThr, CONFIG.MIN_SPEED_RISE);
  if (better < cl.start) {
    cl.start = better;
    if (cl.runs.length) cl.runs[0].start = better;
    let totS = 0, totP = 0;
    for (const r of cl.runs) {
      totS += r.end - r.start + 1;
      for (let k = r.start; k <= r.end; k++) totP += power[k];
    }
    cl.avg = totS ? totP / totS : 0;
    cl.duration = totS;
  }
});

// Ordinamento CRONOLOGICO
clusters.sort((a, b) => a.start - b.start);
const top = clusters.slice(0, CONFIG.TOP_N);
const sprintRank = new Map(
  top
    .slice()
    .sort((a, b) => b.avg - a.avg)
    .map((cl, rank) => [cl, rank + 1])
);

// Header
const header = [
  'Sprint', '#', 'Inizio', 'Durata (orig)',
  'Avg W', 'P entrata', 'Pmin (s)', 'Pmax (s)', 'W/kg',
  'Torque ∅/max',
  'v entrata', 'v max', 'v uscita', 'Δv',
  'Acc media', 'Acc 2→5s', 'Acc entr→5s', 'Acc entr→Vmax'
];

const cols = header.map(() => []);

top.forEach((cl, idx) => {
  const bestStart = cl.start;
  const displayDurationSec = Math.round(cl.duration * sampleInterval);
  const origDurSec = Math.round((cl.end - cl.originalStart + 1) * sampleInterval);

  // sezioni
  let sPower = [], sTime = [], sTorque = [], sCadence = [], sHR = [];
  for (const r of cl.runs) {
    sPower   = sPower.concat(power.slice(r.start, r.end+1));
    sTime    = sTime.concat(time.slice(r.start, r.end+1));
    sTorque  = sTorque.concat(torque.slice(r.start, r.end+1));
    sCadence = sCadence.concat(cadence.slice(r.start, r.end+1));
    sHR      = sHR.concat(heartrate.slice(r.start, r.end+1));
  }

  const avgP = cl.avg;
  const pmax = Math.max(...sPower);
  const wkg  = weight ? avgP / weight : 0;
  const tMean = sTorque.length ? sTorque.reduce((a,b)=>a+b,0)/sTorque.length : 0;
  const tMax  = sTorque.length ? Math.max(...sTorque) : 0;

  // Power di entrata
  const powerEntry = (power[bestStart] + (power[bestStart+1] || power[bestStart])) / 2;

  // Power minima dopo ≥2s + secondo
  let pminAfter2 = null;
  let pminAfter2Sec = null;
  if (cl.end >= bestStart + 2) {
    pminAfter2 = Infinity;
    for (let k = bestStart + 2; k <= cl.end; k++) {
      if (power[k] < pminAfter2) {
        pminAfter2 = power[k];
        pminAfter2Sec = k - bestStart;
      }
    }
  }

  // Pmax + secondo
  let pmaxSec = null;
  for (let k = bestStart; k <= cl.end; k++) {
    if (power[k] === pmax) {
      pmaxSec = k - bestStart;
      break;
    }
  }

  function speedAt(idx) {
    if (idx < 0 || idx >= speedKmh.length) return 0;
    return speedKmh[idx];
  }

  // v entrata
  const entryWindow = CONFIG.ENTRY_SPEED_SECONDS || 5;
  let vEntrySum = 0, vEntryCount = 0;
  for (let k = Math.max(1, bestStart - entryWindow); k < bestStart; k++) {
    vEntrySum += speedAt(k);
    vEntryCount++;
  }
  const vEntry = vEntryCount > 0 ? vEntrySum / vEntryCount : speedAt(bestStart);

  // v uscita + vmax
  const lastIdx = cl.end;
  const vExit = (speedAt(lastIdx) + speedAt(Math.max(lastIdx-1, bestStart))) / 2;

  let vMax = 0, vMaxIdx = bestStart;
  for (let k = bestStart; k <= cl.end; k++) {
    const s = speedAt(k);
    if (s > vMax) { vMax = s; vMaxIdx = k; }
  }

  const deltaV = vExit - vEntry;
  const totT = sTime[sTime.length-1] - sTime[0];
  const accMean = totT > 0 ? deltaV / totT : 0;

  // Acc 2→5s
  let acc25 = '–';
  if (displayDurationSec >= 6) {
    const v2 = speedAt(bestStart + 2);
    const v5 = speedAt(bestStart + 5);
    acc25 = ((v5 - v2) / 3).toFixed(2);
  }

  // Acc entrata → 5s
  let accEntry5 = '–';
  if (displayDurationSec >= 5) {
    const v5s = speedAt(bestStart + 5);
    accEntry5 = ((v5s - vEntry) / 5).toFixed(2);
  }

  // Acc entrata → Vmax
  const timeToVmax = time[vMaxIdx] - time[bestStart];
  const accEntryVmax = timeToVmax > 0 ? ((vMax - vEntry) / timeToVmax).toFixed(2) : '–';

  // Popola colonne
  cols[0].push(sprintRank.get(cl));
  cols[1].push(idx + 1);
  cols[2].push(secondsToHms(time[bestStart]));
  cols[3].push(`${displayDurationSec}s (${origDurSec}s)`);
  cols[4].push(avgP.toFixed(0));
  cols[5].push(powerEntry.toFixed(0));
  cols[6].push(pminAfter2 != null ? `${pminAfter2.toFixed(0)} (${pminAfter2Sec}s)` : '–');
  cols[7].push(`${pmax.toFixed(0)} (${pmaxSec}s)`);
  cols[8].push(wkg.toFixed(2));
  cols[9].push(`${tMean.toFixed(0)}/${tMax.toFixed(0)}`);
  cols[10].push(vEntry.toFixed(1));
  cols[11].push(vMax.toFixed(1));
  cols[12].push(vExit.toFixed(1));
  cols[13].push((deltaV >= 0 ? '+' : '') + deltaV.toFixed(1));
  cols[14].push(accMean.toFixed(2));
  cols[15].push(acc25);
  cols[16].push(accEntry5);
  cols[17].push(accEntryVmax);
});

const data = [{
  type: 'table',
  header: {
    values: header,
    align: 'center',
    font: {size: 11, color: 'white'},
    fill: {color: '#1f77b4'},
    height: 28
  },
  cells: {
    values: cols,
    align: 'center',
    font: {size: 11},
    fill: {color: [['#f8f9fa', '#e9ecef']]},
    height: 24
  }
}];

const layout = {
  title: `Surges ≥${CONFIG.MIN_SURGE_SECONDS}s >${CONFIG.MIN_EFFORT_INTENSITY_FTP}% FTP (ordine cronologico)`,
  margin: {l: 8, r: 8, t: 40, b: 8},
  height: 600
};

chart = { data, layout };
chart;
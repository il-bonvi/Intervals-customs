// =====================
// CONFIGURAZIONE PRINCIPALE
// =====================
(function() {
  const CONFIG = {
    // === PARAMETRI PRINCIPALI: modificare qui per cambiare la logica del grafico ===
    DURATION: 180,                    // Durata finestra sforzo (secondi)
    MIN_EFFORT_INTENSITY_FTP: 100,    // Soglia minima effort (% FTP)
    // ============================================================================
    // Ordinamento barre possibile su (valori stringa):
    // 'avgPower', 'avgPowerPerKg', 'avgHR', 'maxHR', 'startTime', 'bestStart',
    // 'dist', 'distKm', 'elevationGain', 'avgGrade', 'maxGrade',
    // 'rat_1', 'rat_2', 'ratio', 'ascentSpeed', 'avgHorizontalSpeed',
    // 'best5sWatts', 'best5sPerKg', 'TEORICWKG', 'TEORICVAM'
    SORT_BY: 'avgPower',
    BAR_TEXT_COLOR: '#000',                // Colore testo barre
    BAR_TEXT_FONT: { family: 'Arial Black', size: 13 }, // Font testo barre
    GRID_X_COLOR: '#eee',                  // Colore griglia X
    GRID_X_WIDTH: 1,                       // Spessore griglia X
    GRID_Y_COLOR: '#ccc',                  // Colore griglia Y
    GRID_Y_WIDTH: 1,                       // Spessore griglia Y
    VISIBLE_BARS: 7,                 // Numero barre visibili nel grafico

    ZONES: [
      { name: 'Z2', max: 76, color: '#4c72b0' },
      { name: 'Z3', max: 91, color: '#55a868' },
      { name: 'Z4', max: 106, color: '#dd8452' },
      { name: 'Z5', max: 126, color: '#c44e52' },
      { name: 'Z6', max: 151, color: '#a64d79' },
      { name: 'Z7', max: Infinity, color: '#8172b3' }
    ]
  };
// =====================
// FINE CONFIGURAZIONE
// =====================

// =====================
// LAYOUT GRAFICO
// =====================
const LAYOUT = {
  title: '',
  barmode: 'group',
  showlegend: false,
  height: 250,
  margin: {l: 40, r: 20, t: 40, b: 40},
  xaxis: {
    title: 'Effort',
    range: [0, CONFIG.VISIBLE_BARS - 0.5],
    fixedrange: false,
    autorange: false,
    tickmode: 'linear',
    tick0: 1,
    dtick: 1,
    showgrid: true,
    gridcolor: CONFIG.GRID_X_COLOR,
    gridwidth: CONFIG.GRID_X_WIDTH,
    scrollZoom: true
  },
  yaxis: {
    title: 'Avg Power (W)',
    dtick: 50,
    gridcolor: CONFIG.GRID_Y_COLOR,
    gridwidth: CONFIG.GRID_Y_WIDTH
  }
};

// =====================
// DATI ATTIVITÀ
// =====================
const activity = icu.activity;
const weight = activity.icu_weight;
const FTP = activity.icu_ftp;

function getStreamData(streamName) {
  const stream = icu.streams.get(streamName);
  return stream && stream.data ? stream.data.map(value => value ?? 0) : Array(icu.streams.get("time").data.length).fill(0);
}
const power = getStreamData("fixed_watts");

// Trova tutti gli sforzi non sovrapposti sopra una certa soglia
function getNonOverlappingEffortsAboveThreshold(data, n, threshold, samplingRate = 1) {
  const windowSize = n * samplingRate;
  let results = [];
  if (data.length < windowSize) return results;
  let sum = data.slice(0, windowSize).reduce((a, b) => a + b, 0);
  let candidates = [];
  if (sum / windowSize >= threshold) {
    candidates.push({ avg: sum / windowSize, start: 0 });
  }
  for (let i = 1; i <= data.length - windowSize; i++) {
    sum = sum - data[i - 1] + data[i + windowSize - 1];
    const avg = sum / windowSize;
    if (avg >= threshold) {
      candidates.push({ avg, start: i });
    }
  }
  candidates.sort((a, b) => b.avg - a.avg);
  let used = Array(data.length).fill(false);
  for (const cand of candidates) {
    let overlap = false;
    for (let j = cand.start; j < cand.start + windowSize; j++) {
      if (used[j]) {
        overlap = true;
        break;
      }
    }
    if (!overlap) {
      results.push(cand);
      for (let j = cand.start; j < cand.start + windowSize; j++) {
        used[j] = true;
      }
    }
  }
  results.sort((a, b) => a.start - b.start);
  return results;
}



let x = [];
let y = [];
let hover = [];
let effortData = [];
const heartrate = getStreamData("fixed_heartrate");
const time = getStreamData("time");
const distance = getStreamData("distance");
const altitude = getStreamData("fixed_altitude");
const grade = getStreamData("grade_smooth");

function secondsToHms(seconds) {
  seconds = Math.floor(seconds);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  let str = '';
  if (h > 0) str += String(h).padStart(2, '0') + ':';
  str += (h > 0 ? String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
  return str;
}

// Soglia in watt (da percentuale FTP)
const threshold = (CONFIG.MIN_EFFORT_INTENSITY_FTP / 100) * FTP;


const allEfforts = getNonOverlappingEffortsAboveThreshold(
  power,
  CONFIG.DURATION,
  threshold,
  1
);
for (const [idx, best] of allEfforts.entries()) {
  const bestStart = best.start;
  const bestEnd = bestStart + CONFIG.DURATION;
  const sectionHR = heartrate.slice(bestStart, bestEnd);
  const sectionDistance = distance.slice(bestStart, bestEnd);
  const sectionAltitude = altitude.slice(bestStart, bestEnd);
  const sectionGrade = grade.slice(bestStart, bestEnd);
  const avgHR = sectionHR.reduce((a, b) => a + b, 0) / sectionHR.length;
  const maxHR = Math.max(...sectionHR);
  const startTime = secondsToHms(time[bestStart]);
  const avgPower = best.avg;
  const avgPowerPerKg = avgPower / weight;
  const dist = sectionDistance[sectionDistance.length - 1] - sectionDistance[0];
  const distKm = dist / 1000;
  const elevationGain = sectionAltitude[sectionAltitude.length - 1] - sectionAltitude[0];
  const avgGrade = dist > 0 ? (elevationGain / dist * 100) : 0;
  const maxGrade = Math.max(...sectionGrade);
  // Ratio: prima metà, seconda metà, ratio
  const firstHalf = power.slice(bestStart, bestStart + CONFIG.DURATION/2);
  const secondHalf = power.slice(bestStart + CONFIG.DURATION/2, bestEnd);
  const rat_1 = firstHalf.reduce((a,b)=>a+b,0)/firstHalf.length;
  const rat_2 = secondHalf.reduce((a,b)=>a+b,0)/secondHalf.length;
  const ratio = rat_2 / rat_1;
  // VAM
  const climbTimeH = CONFIG.DURATION / 3600;
  const ascentSpeed = elevationGain / climbTimeH;
  const avgHorizontalSpeed = distKm / (CONFIG.DURATION / 3600);
  // Best 5s
  let best5sWatts = 0;
  for (let i = 0; i <= power.slice(bestStart, bestEnd).length - 5; i++) {
    const avg5 = power.slice(bestStart + i, bestStart + i + 5).reduce((a,b)=>a+b,0)/5;
    if (avg5 > best5sWatts) best5sWatts = avg5;
  }
  const best5sPerKg = best5sWatts / weight;
  // Teorici (come in PIAN HC)
  const gradientFactor = (2 + avgGrade / 10) * 100;
  const TEORICWKG = ascentSpeed / gradientFactor;
  const TEORICVAM = avgPowerPerKg * gradientFactor;
  effortData.push({
    idx,
    avgPower,
    avgPowerPerKg,
    avgHR,
    maxHR,
    startTime,
    bestStart,
    dist,
    distKm,
    elevationGain,
    avgGrade,
    maxGrade,
    rat_1,
    rat_2,
    ratio,
    ascentSpeed,
    avgHorizontalSpeed,
    best5sWatts,
    best5sPerKg,
    TEORICWKG,
    TEORICVAM
  });
}

// Ordina effort secondo la proprietà scelta in config
effortData.sort((a, b) => b[CONFIG.SORT_BY] - a[CONFIG.SORT_BY]);
for (const [i, effort] of effortData.entries()) {
  x.push(`${i+1}`);
  y.push(effort.avgPower);
  hover.push(
    `📏 ${(effort.dist / 1000).toFixed(2)} km (${effort.elevationGain.toFixed(0)} m)<br>`+
    `📈 ∅ ${effort.avgGrade.toFixed(1)}% | max. ${effort.maxGrade.toFixed(1)}%<br>`+
    `⚡ ${effort.avgPower.toFixed(0)} W | 5″ ${effort.best5sWatts.toFixed(0)} W<br>`+
    `⚖️ ${effort.avgPowerPerKg.toFixed(2)} W/kg | 5″ ${effort.best5sPerKg.toFixed(2)} W/kg<br>`+
    `🔀 ${effort.rat_1.toFixed(0)} W | ${effort.rat_2.toFixed(0)} W | ${(effort.ratio).toFixed(2)}<br>`+
    `❤️ ∅ ${effort.avgHR.toFixed(0)} bpm | max. ${effort.maxHR} bpm<br>`+
    `🚴‍♂️ ${effort.avgHorizontalSpeed.toFixed(1)} km/h | 🚵‍♂️ ${effort.ascentSpeed.toFixed(0)} m/h<br>`+
    `⏱️ ${effort.startTime}`
  );
}



// Restituisce il colore HEX della zona in base alla % FTP, usando la config
function getZoneColor(avgPower, ftp) {
  const percentage = (avgPower / ftp) * 100;
  for (const zone of CONFIG.ZONES) {
    if (percentage < zone.max) return zone.color;
  }
  // fallback (non dovrebbe mai servire)
  return '#000';
}

const barColors = y.map((v) => getZoneColor(v, FTP));


const data = [
  {
    x: x,
    y: y,
    type: 'bar',
    marker: {
      color: barColors
    },
    text: x.map((label, i) =>
      `${y[i].toFixed(0)} W | ${effortData[i].avgPowerPerKg.toFixed(2)} W/kg<br>`
      + `${effortData[i].rat_1.toFixed(0)} W | ${effortData[i].rat_2.toFixed(0)} W | ${effortData[i].ratio.toFixed(2)}<br>`
      + `∅ ${effortData[i].avgHR.toFixed(0)} bpm | ${effortData[i].maxHR} bpm<br>`
      + `${effortData[i].ascentSpeed.toFixed(0)} m/h | ∅ ${effortData[i].avgGrade.toFixed(1)}%<br>`
      + `${effortData[i].startTime}`
    ),
    textposition: 'inside',
    insidetextanchor: 'start',
    textfont: {
      color: CONFIG.BAR_TEXT_COLOR,
      size: CONFIG.BAR_TEXT_FONT.size,
      family: CONFIG.BAR_TEXT_FONT.family
    },
    hoverinfo: 'text',
    hovertext: hover,
    hoverlabel: { font: { color: CONFIG.BAR_TEXT_COLOR, family: CONFIG.BAR_TEXT_FONT.family, size: CONFIG.BAR_TEXT_FONT.size }, align: 'left' },
    name: 'Avg Power',
    visible: true
  }
];



// Aggiorna dinamicamente titolo e range xaxis in base alla config
const minEffort = CONFIG.MIN_EFFORT_INTENSITY_FTP;
const duration = CONFIG.DURATION;
const durationMin = duration % 60 === 0 ? (duration/60) + '′' : duration + 's';
LAYOUT.title = `${durationMin} efforts (>${minEffort}% FTP)`;
LAYOUT.xaxis.range = [0, CONFIG.VISIBLE_BARS - 0.5];

chart = { data: data, layout: LAYOUT };
chart;
})();
// Bar chart for all 30s efforts above 105% FTP
const DURATION_30sbar = 30;
const activity_30sbar = icu.activity;
const weight_30sbar = activity_30sbar.icu_weight;
const FTP_30sbar = activity_30sbar.icu_ftp;

function getStreamData_30sbar(streamName) {
    const stream = icu.streams.get(streamName);
    return stream && stream.data ? stream.data.map(value => value ?? 0) : Array(icu.streams.get("time").data.length).fill(0);
}
const power_30sbar = getStreamData_30sbar("fixed_watts");

// Get all non-overlapping 30s efforts above 105% FTP (exclude overlapping windows)
function getNonOverlappingEffortsAboveThreshold_30sbar(data, n, threshold, samplingRate = 1) {
    const windowSize = n * samplingRate;
    let results = [];
    let sum = 0;
    if (data.length < windowSize) return results;
    for (let i = 0; i < windowSize; i++) {
        sum += data[i];
    }
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
    // Sort by avg descending
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
    // Sort by start time ascending for display
    results.sort((a, b) => a.start - b.start);
    return results;
}


let x_30sbar = [];
let y_30sbar = [];
let hover_30sbar = [];
let effortData_30sbar = [];
const VISIBLE_BARS_30sbar = 7; // Number of bars visible at once
const heartrate_30sbar = getStreamData_30sbar("fixed_heartrate");
const time_30sbar = getStreamData_30sbar("time");
const distance_30sbar = getStreamData_30sbar("distance");
const altitude_30sbar = getStreamData_30sbar("fixed_altitude");
const grade_30sbar = getStreamData_30sbar("grade_smooth");
function secondsToHms_30sbar(seconds) {
    seconds = Math.floor(seconds);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    let str = '';
    if (h > 0) str += String(h).padStart(2, '0') + ':';
    str += (h > 0 ? String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
    return str;
}
const threshold_30sbar = 1.3 * FTP_30sbar; // EFFORT THRESHOLD

const allEfforts_30sbar = getNonOverlappingEffortsAboveThreshold_30sbar(power_30sbar, DURATION_30sbar, threshold_30sbar, 1);
for (const [idx, best] of allEfforts_30sbar.entries()) {
    const bestStart = best.start;
    const bestEnd = bestStart + DURATION_30sbar;
    const sectionHR = heartrate_30sbar.slice(bestStart, bestEnd);
    const sectionDistance = distance_30sbar.slice(bestStart, bestEnd);
    const sectionAltitude = altitude_30sbar.slice(bestStart, bestEnd);
    const sectionGrade = grade_30sbar.slice(bestStart, bestEnd);
    const avgHR = sectionHR.reduce((a, b) => a + b, 0) / sectionHR.length;
    const maxHR = Math.max(...sectionHR);
    const startTime = secondsToHms_30sbar(time_30sbar[bestStart]);
    const avgPower = best.avg;
    const avgPowerPerKg = avgPower / weight_30sbar;
    const dist = sectionDistance[sectionDistance.length - 1] - sectionDistance[0];
    const distKm = dist / 1000;
    const elevationGain = sectionAltitude[sectionAltitude.length - 1] - sectionAltitude[0];
    const avgGrade = elevationGain / dist * 100;
    const maxGrade = Math.max(...sectionGrade);
    // Ratio: primo 15s, secondo 15s, ratio
    const firstHalf = power_30sbar.slice(bestStart, bestStart + DURATION_30sbar/2);
    const secondHalf = power_30sbar.slice(bestStart + DURATION_30sbar/2, bestEnd);
    const rat_1 = firstHalf.reduce((a,b)=>a+b,0)/firstHalf.length;
    const rat_2 = secondHalf.reduce((a,b)=>a+b,0)/secondHalf.length;
    const ratio = rat_2 / rat_1;
    // VAM
    const climbTimeH = DURATION_30sbar / 3600;
    const ascentSpeed = elevationGain / climbTimeH;
    const avgHorizontalSpeed = distKm / (DURATION_30sbar / 3600);
    // Best 5s
    let best5sWatts = 0;
    for (let i = 0; i <= power_30sbar.slice(bestStart, bestEnd).length - 5; i++) {
        const avg5 = power_30sbar.slice(bestStart + i, bestStart + i + 5).reduce((a,b)=>a+b,0)/5;
        if (avg5 > best5sWatts) best5sWatts = avg5;
    }
    const best5sPerKg = best5sWatts / weight_30sbar;
    // Teorici (come in PIAN HC)
    const gradientFactor = (2 + avgGrade / 10) * 100;
    const TEORICWKG = ascentSpeed / gradientFactor;
    const TEORICVAM = avgPowerPerKg * gradientFactor;
    effortData_30sbar.push({
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

// Ordina per watt decrescente
effortData_30sbar.sort((a, b) => b.avgPower - a.avgPower);
for (const [i, effort] of effortData_30sbar.entries()) {
    x_30sbar.push(`${i+1}`);
    y_30sbar.push(effort.avgPower);
    hover_30sbar.push(
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


function getZoneColor_30sbar(avgPower, ftp) {
    const percentage = (avgPower / ftp) * 100;
    if (percentage < 141) return "4c72b0";        // Z2
    if (percentage < 161) return "55a868";         // Z3
    if (percentage < 201) return "dd8452";        // Z4 (ex gold, ora come Z3)
    if (percentage < 251) return "c44e52";           // Z5
    if (percentage < 301) return "a64d79";        // Z6
    return "8172b3";                                // Z7+;
}

const barColors_30sbar = y_30sbar.map((v) => getZoneColor_30sbar(v, FTP_30sbar));

const data_30sbar = [
  {
    x: x_30sbar,
    y: y_30sbar,
    type: 'bar',
    marker: {
      color: barColors_30sbar
    },
    text: x_30sbar.map((label, i) =>
      `${y_30sbar[i].toFixed(0)} W | ${effortData_30sbar[i].avgPowerPerKg.toFixed(2)} W/kg<br>`
      + `${effortData_30sbar[i].rat_1.toFixed(0)} W | ${effortData_30sbar[i].rat_2.toFixed(0)} W | ${effortData_30sbar[i].ratio.toFixed(2)}<br>`
      + `∅ ${effortData_30sbar[i].avgHR.toFixed(0)} bpm | ${effortData_30sbar[i].maxHR} bpm<br>`
      + `${effortData_30sbar[i].ascentSpeed.toFixed(0)} m/h | ∅ ${effortData_30sbar[i].avgGrade.toFixed(1)}%<br>`
      + `${effortData_30sbar[i].startTime}`
    ),
    textposition: 'inside',
    insidetextanchor: 'start',
    textfont: {
      color: '#000',
      size: 13,
      family: 'Arial Black'
    },
    hoverinfo: 'text',
    hovertext: hover_30sbar,
    hoverlabel: { font: { color: '#000', family: 'Arial', size: 13 }, align: 'left' },
    name: 'Avg Power',
    visible: true
  }
];


const layout_30sbar = {
  title: '30" efforts (>130% FTP)',
  barmode: 'group',
  showlegend: false,
  height: 250,
  margin: {l: 40, r: 20, t: 40, b: 40},
  xaxis: {
    title: 'Effort',
    range: [0, VISIBLE_BARS_30sbar - 0.5], // Show only n bars at a time
    fixedrange: false,
    autorange: false,
    tickmode: 'linear',
    tick0: 1,
    dtick: 1,
    showgrid: true,
    gridcolor: '#eee',
    gridwidth: 1,
    scrollZoom: true    // Show only n bars at a time
  },
  yaxis: {
    title: 'Avg Power (W)',
    dtick: 50, // Griglia ogni 50 watt
    gridcolor: '#ccc',
    gridwidth: 1
  },
};

chart = { data: data_30sbar, layout: layout_30sbar };
chart;
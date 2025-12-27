// Bar chart for all 30s efforts above 130% FTP
const DURATION_3mbar = 30;
const activity_3mbar = icu.activity;
const weight_3mbar = activity_3mbar.icu_weight;
const FTP_3mbar = activity_3mbar.icu_ftp;

function getStreamData_3mbar(streamName) {
    const stream = icu.streams.get(streamName);
    return stream && stream.data ? stream.data.map(value => value ?? 0) : Array(icu.streams.get("time").data.length).fill(0);
}
const power_3mbar = getStreamData_3mbar("fixed_watts");

// Get all non-overlapping 30s efforts above 130% FTP (exclude overlapping windows)
function getNonOverlappingEffortsAboveThreshold_3mbar(data, n, threshold, samplingRate = 1) {
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


let x_3mbar = [];
let y_3mbar = [];
let hover_3mbar = [];
let effortData_3mbar = [];
const VISIBLE_BARS_3mbar = 7; // Number of bars visible at once
const heartrate_3mbar = getStreamData_3mbar("fixed_heartrate");
const time_3mbar = getStreamData_3mbar("time");
const distance_3mbar = getStreamData_3mbar("distance");
const altitude_3mbar = getStreamData_3mbar("fixed_altitude");
const grade_3mbar = getStreamData_3mbar("grade_smooth");
function secondsToHms_3mbar(seconds) {
    seconds = Math.floor(seconds);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    let str = '';
    if (h > 0) str += String(h).padStart(2, '0') + ':';
    str += (h > 0 ? String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
    return str;
}
const threshold_3mbar = 1.3 * FTP_3mbar; // EFFORT THRESHOLD

const allEfforts_3mbar = getNonOverlappingEffortsAboveThreshold_3mbar(power_3mbar, DURATION_3mbar, threshold_3mbar, 1);
for (const [idx, best] of allEfforts_3mbar.entries()) {
    const bestStart = best.start;
    const bestEnd = bestStart + DURATION_3mbar;
    const sectionHR = heartrate_3mbar.slice(bestStart, bestEnd);
    const sectionDistance = distance_3mbar.slice(bestStart, bestEnd);
    const sectionAltitude = altitude_3mbar.slice(bestStart, bestEnd);
    const sectionGrade = grade_3mbar.slice(bestStart, bestEnd);
    const avgHR = sectionHR.reduce((a, b) => a + b, 0) / sectionHR.length;
    const maxHR = Math.max(...sectionHR);
    const startTime = secondsToHms_3mbar(time_3mbar[bestStart]);
    const avgPower = best.avg;
    const avgPowerPerKg = avgPower / weight_3mbar;
    const dist = sectionDistance[sectionDistance.length - 1] - sectionDistance[0];
    const distKm = dist / 1000;
    const elevationGain = sectionAltitude[sectionAltitude.length - 1] - sectionAltitude[0];
    const avgGrade = elevationGain / dist * 100;
    const maxGrade = Math.max(...sectionGrade);
    // Ratio: primo 15s, secondo 15s, ratio
    const firstHalf = power_3mbar.slice(bestStart, bestStart + DURATION_3mbar/2);
    const secondHalf = power_3mbar.slice(bestStart + DURATION_3mbar/2, bestEnd);
    const rat_1 = firstHalf.reduce((a,b)=>a+b,0)/firstHalf.length;
    const rat_2 = secondHalf.reduce((a,b)=>a+b,0)/secondHalf.length;
    const ratio = rat_2 / rat_1;
    // VAM
    const climbTimeH = DURATION_3mbar / 3600;
    const ascentSpeed = elevationGain / climbTimeH;
    const avgHorizontalSpeed = distKm / (DURATION_3mbar / 3600);
    // Best 5s
    let best5sWatts = 0;
    for (let i = 0; i <= power_3mbar.slice(bestStart, bestEnd).length - 5; i++) {
        const avg5 = power_3mbar.slice(bestStart + i, bestStart + i + 5).reduce((a,b)=>a+b,0)/5;
        if (avg5 > best5sWatts) best5sWatts = avg5;
    }
    const best5sPerKg = best5sWatts / weight_3mbar;
    // Teorici (come in PIAN HC)
    const gradientFactor = (2 + avgGrade / 10) * 100;
    const TEORICWKG = ascentSpeed / gradientFactor;
    const TEORICVAM = avgPowerPerKg * gradientFactor;
    effortData_3mbar.push({
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
effortData_3mbar.sort((a, b) => b.avgPower - a.avgPower);
for (const [i, effort] of effortData_3mbar.entries()) {
    x_3mbar.push(`${i+1}`);
    y_3mbar.push(effort.avgPower);
    hover_3mbar.push(
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


function getZoneColor_3mbar(avgPower, ftp) {
    const percentage = (avgPower / ftp) * 100;
    if (percentage < 141) return "4c72b0";        // Z2
    if (percentage < 161) return "55a868";         // Z3
    if (percentage < 201) return "dd8452";        // Z4 (ex gold, ora come Z3)
    if (percentage < 251) return "c44e52";           // Z5
    if (percentage < 301) return "a64d79";        // Z6
    return "8172b3";                                // Z7+;
}

const barColors_3mbar = y_3mbar.map((v) => getZoneColor_3mbar(v, FTP_3mbar));

const data_3mbar = [
  {
    x: x_3mbar,
    y: y_3mbar,
    type: 'bar',
    marker: {
      color: barColors_3mbar
    },
    text: x_3mbar.map((label, i) =>
      `${y_3mbar[i].toFixed(0)} W | ${effortData_3mbar[i].avgPowerPerKg.toFixed(2)} W/kg<br>`
      + `${effortData_3mbar[i].rat_1.toFixed(0)} W | ${effortData_3mbar[i].rat_2.toFixed(0)} W | ${effortData_3mbar[i].ratio.toFixed(2)}<br>`
      + `∅ ${effortData_3mbar[i].avgHR.toFixed(0)} bpm | ${effortData_3mbar[i].maxHR} bpm<br>`
      + `${effortData_3mbar[i].ascentSpeed.toFixed(0)} m/h | ∅ ${effortData_3mbar[i].avgGrade.toFixed(1)}%<br>`
      + `${effortData_3mbar[i].startTime}`
    ),
    textposition: 'inside',
    insidetextanchor: 'start',
    textfont: {
      color: '#000',
      size: 13,
      family: 'Arial Black'
    },
    hoverinfo: 'text',
    hovertext: hover_3mbar,
    hoverlabel: { font: { color: '#000', family: 'Arial', size: 13 }, align: 'left' },
    name: 'Avg Power',
    visible: true
  }
];


const layout_3mbar = {
  title: '30" efforts (>130% FTP)',
  barmode: 'group',
  showlegend: false,
  height: 250,
  margin: {l: 40, r: 20, t: 40, b: 40},
  xaxis: {
    title: 'Effort',
    range: [0, VISIBLE_BARS_3mbar - 0.5], // Show only n bars at a time
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

chart = { data: data_3mbar, layout: layout_3mbar };
chart;
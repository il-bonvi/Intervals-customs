// Bar chart for best 8 efforts (1 minute)
const DURATION_1mbar = 60;
const TOP_N_1mbar = 20; // Calculate top 20 efforts
const LABEL_1mbar = "1'";
const activity_1mbar = icu.activity;
const weight_1mbar = activity_1mbar.icu_weight;

function getStreamData_1mbar(streamName) {
    const stream = icu.streams.get(streamName);
    return stream && stream.data ? stream.data.map(value => value ?? 0) : Array(icu.streams.get("time").data.length).fill(0);
}
const power_1mbar = getStreamData_1mbar("fixed_watts");

function getTopNBestAveragesOverNSeconds_1mbar(data, n, topN = 8, samplingRate = 1) {
    const windowSize = n * samplingRate;
    let results = [];
    let sum = 0;
    for (let i = 0; i < windowSize; i++) {
        sum += data[i];
    }
    results.push({ avg: sum / windowSize, start: 0 });
    for (let i = 1; i <= data.length - windowSize; i++) {
        sum = sum - data[i - 1] + data[i + windowSize - 1];
        const avg = sum / windowSize;
        results.push({ avg, start: i });
    }
    results.sort((a, b) => b.avg - a.avg);
    let nonOverlapping = [];
    for (let i = 0; i < results.length && nonOverlapping.length < topN; i++) {
        if (nonOverlapping.every(r => Math.abs(r.start - results[i].start) >= windowSize)) {
            nonOverlapping.push(results[i]);
        }
    }
    return nonOverlapping;
}

let x_1mbar = [];
let y_1mbar = [];
let hover_1mbar = [];
let effortData_1mbar = [];
const VISIBLE_BARS = 7; // Number of bars visible at once
const heartrate_1mbar = getStreamData_1mbar("fixed_heartrate");
const time_1mbar = getStreamData_1mbar("time");
const distance_1mbar = getStreamData_1mbar("distance");
const altitude_1mbar = getStreamData_1mbar("fixed_altitude");
const grade_1mbar = getStreamData_1mbar("grade_smooth");
function secondsToHms_1mbar(seconds) {
    seconds = Math.floor(seconds);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    let str = '';
    if (h > 0) str += String(h).padStart(2, '0') + ':';
    str += (h > 0 ? String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
    return str;
}
for (const [idx, best] of getTopNBestAveragesOverNSeconds_1mbar(power_1mbar, DURATION_1mbar, TOP_N_1mbar, 1).entries()) {
    const bestStart = best.start;
    const bestEnd = bestStart + DURATION_1mbar;
    const sectionHR = heartrate_1mbar.slice(bestStart, bestEnd);
    const sectionDistance = distance_1mbar.slice(bestStart, bestEnd);
    const sectionAltitude = altitude_1mbar.slice(bestStart, bestEnd);
    const sectionGrade = grade_1mbar.slice(bestStart, bestEnd);
    const avgHR = sectionHR.reduce((a, b) => a + b, 0) / sectionHR.length;
    const maxHR = Math.max(...sectionHR);
    const startTime = secondsToHms_1mbar(time_1mbar[bestStart]);
    const avgPower = best.avg;
    const avgPowerPerKg = avgPower / weight_1mbar;
    const dist = sectionDistance[sectionDistance.length - 1] - sectionDistance[0];
    const distKm = dist / 1000;
    const elevationGain = sectionAltitude[sectionAltitude.length - 1] - sectionAltitude[0];
    const avgGrade = elevationGain / dist * 100;
    const maxGrade = Math.max(...sectionGrade);
    // Ratio: primo 30s, secondo 30s, ratio
    const firstHalf = power_1mbar.slice(bestStart, bestStart + DURATION_1mbar/2);
    const secondHalf = power_1mbar.slice(bestStart + DURATION_1mbar/2, bestEnd);
    const rat_1 = firstHalf.reduce((a,b)=>a+b,0)/firstHalf.length;
    const rat_2 = secondHalf.reduce((a,b)=>a+b,0)/secondHalf.length;
    const ratio = rat_2 / rat_1;
    // VAM
    const climbTimeH = DURATION_1mbar / 3600;
    const ascentSpeed = elevationGain / climbTimeH;
    const avgHorizontalSpeed = distKm / (DURATION_1mbar / 3600);
    // Best 5s
    let best5sWatts = 0;
    for (let i = 0; i <= power_1mbar.slice(bestStart, bestEnd).length - 5; i++) {
        const avg5 = power_1mbar.slice(bestStart + i, bestStart + i + 5).reduce((a,b)=>a+b,0)/5;
        if (avg5 > best5sWatts) best5sWatts = avg5;
    }
    const best5sPerKg = best5sWatts / weight_1mbar;
    // Teorici (come in PIAN HC)
    const gradientFactor = (2 + avgGrade / 10) * 100;
    const TEORICWKG = ascentSpeed / gradientFactor;
    const TEORICVAM = avgPowerPerKg * gradientFactor;
    effortData_1mbar.push({
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
effortData_1mbar.sort((a, b) => b.avgPower - a.avgPower);
for (const [i, effort] of effortData_1mbar.entries()) {
    x_1mbar.push(`${i+1}`); // Solo Effort 1, Effort 2, ...
    y_1mbar.push(effort.avgPower);
    hover_1mbar.push(
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

const FTP_1mbar = activity_1mbar.icu_ftp;
function getZoneColor_1mbar(avgPower, ftp) {
    const percentage = (avgPower / ftp) * 100;

    if (percentage < 76) return "4c72b0";        // Z2
    if (percentage < 91) return "55a868";         // Z3
    if (percentage < 106) return "dd8452";        // Z4 (ex gold, ora come Z3)
    if (percentage < 126) return "c44e52";           // Z5
    if (percentage < 151) return "a64d79";        // Z6
    return "8172b3";                                // Z7+;
}

const barColors_1mbar = y_1mbar.map((v) => getZoneColor_1mbar(v, FTP_1mbar));

const data_1mbar = [
  {
    x: x_1mbar,
    y: y_1mbar,
    type: 'bar',
    marker: {
      color: barColors_1mbar
    },
    text: x_1mbar.map((label, i) =>
      `${y_1mbar[i].toFixed(0)} W | ${effortData_1mbar[i].avgPowerPerKg.toFixed(2)} W/kg<br>`
      + `${effortData_1mbar[i].rat_1.toFixed(0)} W | ${effortData_1mbar[i].rat_2.toFixed(0)} W | ${effortData_1mbar[i].ratio.toFixed(2)}<br>`
      + `∅ ${effortData_1mbar[i].avgHR.toFixed(0)} bpm | ${effortData_1mbar[i].maxHR} bpm<br>`
      + `${effortData_1mbar[i].ascentSpeed.toFixed(0)} m/h | ∅ ${effortData_1mbar[i].avgGrade.toFixed(1)}%<br>`
      + `${effortData_1mbar[i].startTime}`
    ),
    textposition: 'inside',
    insidetextanchor: 'start',
    textfont: {
      color: '#000',
      size: 13,
      family: 'Arial Black'
    },
    hoverinfo: 'text',
    hovertext: hover_1mbar,
    hoverlabel: { font: { color: '#000', family: 'Arial', size: 13 }, align: 'left' },
    name: 'Avg Power',
    visible: true
  }
];


const layout_1mbar = {
  title: "1' efforts",
  barmode: 'group',
  showlegend: false,
  height: 250,
  margin: {l: 40, r: 20, t: 40, b: 40},
  xaxis: {
    title: 'Effort',
    range: [0, VISIBLE_BARS - 0.5], // Show only n bars at a time
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

chart = { data: data_1mbar, layout: layout_1mbar };
chart;
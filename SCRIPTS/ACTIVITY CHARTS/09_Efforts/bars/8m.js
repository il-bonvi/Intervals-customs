// Bar chart for best 5 efforts (8 minutes)
const DURATION_8mbar = 480;
const TOP_N_8mbar = 5;
const LABEL_8mbar = "8'";
const activity_8mbar = icu.activity;
const weight_8mbar = activity_8mbar.icu_weight;

function getStreamData_8mbar(streamName) {
    const stream = icu.streams.get(streamName);
    return stream && stream.data ? stream.data.map(value => value ?? 0) : Array(icu.streams.get("time").data.length).fill(0);
}
const power_8mbar = getStreamData_8mbar("fixed_watts");

function getTopNBestAveragesOverNSeconds_8mbar(data, n, topN = 5, samplingRate = 1) {
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

let x_8mbar = [];
let y_8mbar = [];
let hover_8mbar = [];
let effortData_8mbar = [];
const heartrate_8mbar = getStreamData_8mbar("fixed_heartrate");
const time_8mbar = getStreamData_8mbar("time");
const distance_8mbar = getStreamData_8mbar("distance");
const altitude_8mbar = getStreamData_8mbar("fixed_altitude");
const grade_8mbar = getStreamData_8mbar("grade_smooth");
function secondsToHms_8mbar(seconds) {
    seconds = Math.floor(seconds);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    let str = '';
    if (h > 0) str += String(h).padStart(2, '0') + ':';
    str += (h > 0 ? String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
    return str;
}
for (const [idx, best] of getTopNBestAveragesOverNSeconds_8mbar(power_8mbar, DURATION_8mbar, TOP_N_8mbar, 1).entries()) {
    const bestStart = best.start;
    const bestEnd = bestStart + DURATION_8mbar;
    const sectionHR = heartrate_8mbar.slice(bestStart, bestEnd);
    const sectionDistance = distance_8mbar.slice(bestStart, bestEnd);
    const sectionAltitude = altitude_8mbar.slice(bestStart, bestEnd);
    const sectionGrade = grade_8mbar.slice(bestStart, bestEnd);
    const avgHR = sectionHR.reduce((a, b) => a + b, 0) / sectionHR.length;
    const maxHR = Math.max(...sectionHR);
    const startTime = secondsToHms_8mbar(time_8mbar[bestStart]);
    const avgPower = best.avg;
    const avgPowerPerKg = avgPower / weight_8mbar;
    const dist = sectionDistance[sectionDistance.length - 1] - sectionDistance[0];
    const distKm = dist / 1000;
    const elevationGain = sectionAltitude[sectionAltitude.length - 1] - sectionAltitude[0];
    const avgGrade = elevationGain / dist * 100;
    const maxGrade = Math.max(...sectionGrade);
    // Ratio: prima metà, seconda metà, ratio
    const firstHalf = power_8mbar.slice(bestStart, bestStart + DURATION_8mbar/2);
    const secondHalf = power_8mbar.slice(bestStart + DURATION_8mbar/2, bestEnd);
    const rat_1 = firstHalf.reduce((a,b)=>a+b,0)/firstHalf.length;
    const rat_2 = secondHalf.reduce((a,b)=>a+b,0)/secondHalf.length;
    const ratio = rat_2 / rat_1;
    // VAM
    const climbTimeH = DURATION_8mbar / 3600;
    const ascentSpeed = elevationGain / climbTimeH;
    const avgHorizontalSpeed = distKm / (DURATION_8mbar / 3600);
    // Best 5s
    let best5sWatts = 0;
    for (let i = 0; i <= power_8mbar.slice(bestStart, bestEnd).length - 5; i++) {
        const avg5 = power_8mbar.slice(bestStart + i, bestStart + i + 5).reduce((a,b)=>a+b,0)/5;
        if (avg5 > best5sWatts) best5sWatts = avg5;
    }
    const best5sPerKg = best5sWatts / weight_8mbar;
    // Teorici (come in PIAN HC)
    const gradientFactor = (2 + avgGrade / 10) * 100;
    const TEORICWKG = ascentSpeed / gradientFactor;
    const TEORICVAM = avgPowerPerKg * gradientFactor;
    effortData_8mbar.push({
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
// Ordina per tempo di inizio (bestStart)
effortData_8mbar.sort((a, b) => a.bestStart - b.bestStart);
for (const [i, effort] of effortData_8mbar.entries()) {
    x_8mbar.push(`${i+1}`); // Solo Effort 1, Effort 2, ...
    y_8mbar.push(effort.avgPower);
    hover_8mbar.push(
        `📏 ${(effort.dist / 1000).toFixed(2)} km (${effort.elevationGain.toFixed(0)} m)<br>`+
        `📈 ∅ ${effort.avgGrade.toFixed(1)}% | max. ${effort.maxGrade.toFixed(1)}%<br>`+
        `⚡ ${effort.avgPower.toFixed(0)} W | 5″ ${effort.best5sWatts.toFixed(0)} W<br>`+
        `⚖️ ${effort.avgPowerPerKg.toFixed(2)} W/kg | 5″ ${effort.best5sPerKg.toFixed(2)} W/kg<br>`+
        `🔀 ${effort.rat_1.toFixed(0)} W | ${effort.rat_2.toFixed(0)} W | ${(effort.ratio).toFixed(2)}<br>`+
        `❤️ ∅ ${effort.avgHR.toFixed(0)} bpm | max. ${effort.maxHR} bpm<br>`+
        `🚴‍♂️ ${effort.avgHorizontalSpeed.toFixed(1)} km/h | 🚵‍♂️ ${effort.ascentSpeed.toFixed(0)} m/h<br>`+
        `🧮 ${effort.TEORICWKG.toFixed(2)} W/kg | ${effort.TEORICVAM.toFixed(0)} VAM`+
        `<br>⏱️ ${effort.startTime}`
    );
}

const FTP_8mbar = activity_8mbar.icu_ftp;
function getZoneColor_8mbar(avgPower, ftp) {
    const percentage = (avgPower / ftp) * 100;

    if (percentage < 76) return "4c72b0";        // Z2
    if (percentage < 91) return "55a868";         // Z3
    if (percentage < 106) return "dd8452";        // Z4 (ex gold, ora come Z3)
    if (percentage < 121) return "c44e52";           // Z5
    if (percentage < 151) return "a64d79";        // Z6
    return "8172b3";                                // Z7+;
}

const barColors_8mbar = y_8mbar.map((v) => getZoneColor_8mbar(v, FTP_8mbar));


const data_8mbar = [
  {
    x: x_8mbar,
    y: y_8mbar,
    type: 'bar',
    marker: {
      color: barColors_8mbar
    },
    text: x_8mbar.map((label, i) =>
      `${y_8mbar[i].toFixed(0)} W | ${effortData_8mbar[i].avgPowerPerKg.toFixed(2)} W/kg<br>`
      + `${effortData_8mbar[i].rat_1.toFixed(0)} W | ${effortData_8mbar[i].rat_2.toFixed(0)} W | ${effortData_8mbar[i].ratio.toFixed(2)}<br>`
      + `∅ ${effortData_8mbar[i].avgHR.toFixed(0)} bpm | max. ${effortData_8mbar[i].maxHR} bpm<br>`
      + `${effortData_8mbar[i].ascentSpeed.toFixed(0)} m/h | ∅ ${effortData_8mbar[i].avgGrade.toFixed(1)}%<br>`
      + `${effortData_8mbar[i].startTime}`
    ),
    textposition: 'inside',
    insidetextanchor: 'start',
    textfont: {
      color: '#000',
      size: 13,
      family: 'Arial Black'
    },
    hoverinfo: 'text',
    hovertext: hover_8mbar,
    hoverlabel: { font: { color: '#000', family: 'Arial', size: 13 }, align: 'left' },
    name: 'Avg Power',
    visible: true
  }
];

const layout_8mbar = {
  title: "8' efforts",
  barmode: 'group',
  showlegend: false,
  height: 250,
  margin: {l: 40, r: 20, t: 40, b: 40},
  xaxis: {title: 'Effort'},
  yaxis: {
    title: 'Avg Power (W)',
    dtick: 50, // Griglia ogni 50 watt
    gridcolor: '#ccc',
    gridwidth: 1
  },
};

chart = { data: data_8mbar, layout: layout_8mbar };
chart;
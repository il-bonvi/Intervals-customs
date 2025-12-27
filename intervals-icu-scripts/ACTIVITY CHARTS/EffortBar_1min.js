
const DURATION_2mbar = 120;
const TOP_N_2mbar = 5;
const LABEL_2mbar = "2'";
const activity_2mbar = icu.activity;
const weight_2mbar = activity_2mbar.icu_weight;

function getStreamData_2mbar(streamName) {
    const stream = icu.streams.get(streamName);
    return stream && stream.data ? stream.data.map(value => value ?? 0) : Array(icu.streams.get("time").data.length).fill(0);
}
const power_2mbar = getStreamData_2mbar("fixed_watts");

function getTopNBestAveragesOverNSeconds_2mbar(data, n, topN = 5, samplingRate = 1) {
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

let x_2mbar = [];
let y_2mbar = [];
let hover_2mbar = [];
let effortData_2mbar = [];
const heartrate_2mbar = getStreamData_2mbar("fixed_heartrate");
const time_2mbar = getStreamData_2mbar("time");
const distance_2mbar = getStreamData_2mbar("distance");
const altitude_2mbar = getStreamData_2mbar("fixed_altitude");
const grade_2mbar = getStreamData_2mbar("grade_smooth");
function secondsToHms_2mbar(seconds) {
    seconds = Math.floor(seconds);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    let str = '';
    if (h > 0) str += String(h).padStart(2, '0') + ':';
    str += (h > 0 ? String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
    return str;
}
for (const [idx, best] of getTopNBestAveragesOverNSeconds_2mbar(power_2mbar, DURATION_2mbar, TOP_N_2mbar, 1).entries()) {
    const bestStart = best.start;
    const bestEnd = bestStart + DURATION_2mbar;
    const sectionHR = heartrate_2mbar.slice(bestStart, bestEnd);
    const sectionDistance = distance_2mbar.slice(bestStart, bestEnd);
    const sectionAltitude = altitude_2mbar.slice(bestStart, bestEnd);
    const sectionGrade = grade_2mbar.slice(bestStart, bestEnd);
    const avgHR = sectionHR.reduce((a, b) => a + b, 0) / sectionHR.length;
    const maxHR = Math.max(...sectionHR);
    const startTime = secondsToHms_2mbar(time_2mbar[bestStart]);
    const avgPower = best.avg;
    const avgPowerPerKg = avgPower / weight_2mbar;
    const dist = sectionDistance[sectionDistance.length - 1] - sectionDistance[0];
    const distKm = dist / 1000;
    const elevationGain = sectionAltitude[sectionAltitude.length - 1] - sectionAltitude[0];
    const avgGrade = elevationGain / dist * 100;
    const maxGrade = Math.max(...sectionGrade);
    // Ratio: primo minuto, secondo minuto, ratio
    const firstHalf = power_2mbar.slice(bestStart, bestStart + DURATION_2mbar/2);
    const secondHalf = power_2mbar.slice(bestStart + DURATION_2mbar/2, bestEnd);
    const rat_1 = firstHalf.reduce((a,b)=>a+b,0)/firstHalf.length;
    const rat_2 = secondHalf.reduce((a,b)=>a+b,0)/secondHalf.length;
    const ratio = rat_2 / rat_1;
    // VAM
    const climbTimeH = DURATION_2mbar / 3600;
    const ascentSpeed = elevationGain / climbTimeH;
    const avgHorizontalSpeed = distKm / (DURATION_2mbar / 3600);
    // Best 5s
    let best5sWatts = 0;
    for (let i = 0; i <= power_2mbar.slice(bestStart, bestEnd).length - 5; i++) {
        const avg5 = power_2mbar.slice(bestStart + i, bestStart + i + 5).reduce((a,b)=>a+b,0)/5;
        if (avg5 > best5sWatts) best5sWatts = avg5;
    }
    const best5sPerKg = best5sWatts / weight_2mbar;
    // Teorici (come in PIAN HC)
    const gradientFactor = (2 + avgGrade / 10) * 100;
    const TEORICWKG = ascentSpeed / gradientFactor;
    const TEORICVAM = avgPowerPerKg * gradientFactor;
    effortData_2mbar.push({
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
effortData_2mbar.sort((a, b) => a.bestStart - b.bestStart);
for (const [i, effort] of effortData_2mbar.entries()) {
    x_2mbar.push(`${i+1}`); // Solo Effort 1, Effort 2, ...
    y_2mbar.push(effort.avgPower);
    hover_2mbar.push(
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

const FTP_2mbar = activity_2mbar.icu_ftp;
function getZoneColor_2mbar(avgPower, ftp) {
    const percentage = (avgPower / ftp) * 100;
    if (percentage < 55) return "#444";              // Z1: grigio scuro
    if (percentage < 76) return "lightskyblue";        // Z2
    if (percentage < 91) return "lightgreen";         // Z3
    if (percentage < 106) return "limegreen";        // Z4 (ex gold, ora come Z3)
    if (percentage < 121) return "orange";           // Z5
    if (percentage < 151) return "orangered";        // Z6
    return "crimson";                                // Z7+
}

const barColors_2mbar = y_2mbar.map((v) => getZoneColor_2mbar(v, FTP_2mbar));

const data_2mbar = [
  {
    x: x_2mbar,
    y: y_2mbar,
    type: 'bar',
    marker: {
      color: barColors_2mbar
    },
    text: x_2mbar.map((label, i) =>
      `${y_2mbar[i].toFixed(0)} W | ${effortData_2mbar[i].avgPowerPerKg.toFixed(2)} W/kg<br>`
      + `${effortData_2mbar[i].rat_1.toFixed(0)} W | ${effortData_2mbar[i].rat_2.toFixed(0)} W | ${effortData_2mbar[i].ratio.toFixed(2)}<br>`
      + `∅ ${effortData_2mbar[i].avgHR.toFixed(0)} bpm | max. ${effortData_2mbar[i].maxHR} bpm<br>`
      + `${effortData_2mbar[i].ascentSpeed.toFixed(0)} m/h | ∅ ${effortData_2mbar[i].avgGrade.toFixed(1)}%<br>`
      + `${effortData_2mbar[i].startTime}`
    ),
    textposition: 'inside',
    insidetextanchor: 'start',
    textfont: {
      color: '#fff',
      size: 13,
      family: 'Arial Black'
    },
    hoverinfo: 'text',
    hovertext: hover_2mbar,
    name: 'Avg Power',
    visible: true
  }
];

const layout_2mbar = {
  title: "2' efforts",
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

chart = { data: data_2mbar, layout: layout_2mbar };
chart;
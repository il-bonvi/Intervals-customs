// Table of best 5 efforts for 5 minutes
const DURATION_2m = 300; // 5 minutes
const TOP_N_2m = 5;
const LABEL_2m = "5'";
const activity_2m = icu.activity;
const weight_2m = activity_2m.icu_weight;

function getStreamData_2m(streamName) {
    const stream = icu.streams.get(streamName);
    return stream && stream.data ? stream.data.map(value => value ?? 0) : Array(icu.streams.get("time").data.length).fill(0);
}
const power_2m = getStreamData_2m("fixed_watts");
const heartrate_2m = getStreamData_2m("fixed_heartrate");
const time_2m = getStreamData_2m("time");
const distance_2m = getStreamData_2m("distance"); // meters
const altitude_2m = getStreamData_2m("fixed_altitude");

function getTopNBestAveragesOverNSeconds_2m(data, n, topN = 5, samplingRate = 1) {
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

function secondsToHms_2m(seconds) {
    seconds = Math.floor(seconds);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    let str = '';
    if (h > 0) str += h + ':';
    str += (h > 0 ? String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
    return str;
}

let header_2m = ['Effort', 'Avg Power (W)', 'Avg Power (W/kg)', 'Avg HR', 'VAM', 'Avg Speed (km/h)', 'Start (h:m:s)'];
let cells_2m = [[], [], [], [], [], [], []];

const bests_2m = getTopNBestAveragesOverNSeconds_2m(power_2m, DURATION_2m, TOP_N_2m, 1);
bests_2m.forEach((best, idx) => {
    const bestStart = best.start;
    const bestEnd = bestStart + DURATION_2m;
    const sectionPower = power_2m.slice(bestStart, bestEnd);
    const sectionHR = heartrate_2m.slice(bestStart, bestEnd);
    const sectionTime = time_2m.slice(bestStart, bestEnd);
    const sectionDistance = distance_2m.slice(bestStart, bestEnd);
    const sectionAltitude = altitude_2m.slice(bestStart, bestEnd);
    const avgPower = best.avg;
    const avgPowerPerKg = avgPower / weight_2m;
    const avgHR = sectionHR.reduce((a, b) => a + b, 0) / sectionHR.length;
    // VAM calculation
    const elevationGain = sectionAltitude[sectionAltitude.length - 1] - sectionAltitude[0];
    const vam = (elevationGain * 3600) / DURATION_2m;
    // Avg speed
    const dist = sectionDistance[sectionDistance.length - 1] - sectionDistance[0];
    const avgSpeed = (dist / 1000) / (DURATION_2m / 3600);
    // Start time formatted
    const startTime = secondsToHms_2m(time_2m[bestStart]);
    cells_2m[0].push(`${LABEL_2m} #${idx+1}`);
    cells_2m[1].push(avgPower.toFixed(0));
    cells_2m[2].push(avgPowerPerKg.toFixed(2));
    cells_2m[3].push(avgHR.toFixed(0));
    cells_2m[4].push(vam.toFixed(0));
    cells_2m[5].push(avgSpeed.toFixed(1));
    cells_2m[6].push(startTime);
});

const data_2m = [{
    type: 'table',
    header: {
        values: header_2m,
        align: 'center',
        font: {size: 14, color: 'white'},
        fill: {color: '#1f77b4'}
    },
    cells: {
        values: cells_2m,
        align: 'center',
        font: {size: 13},
        fill: {color: ['#f9f9f9', '#f2f2f2']}
    }
}];

const layout_2m = {
    title: "Best 5 Efforts Table (5 minutes)",
    margin: {l: 20, r: 20, t: 40, b: 20},
    height: 400
};

chart = { data: data_2m, layout: layout_2m };
chart;
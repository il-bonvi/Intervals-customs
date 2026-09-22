// Table of best 20 efforts for 8 seconds (surge8)
const DURATION_surge8 = 8;
const TOP_N_surge8 = 20;
const activity_surge8 = icu.activity;
const weight_surge8 = activity_surge8.icu_weight;

function getStreamData_surge8(streamName) {
    const stream = icu.streams.get(streamName);
    return stream && stream.data ? stream.data.map(value => value ?? 0) : Array(icu.streams.get("time").data.length).fill(0);
}
const power_surge8 = getStreamData_surge8("fixed_watts");
const heartrate_surge8 = getStreamData_surge8("fixed_heartrate");
const time_surge8 = getStreamData_surge8("time");
const distance_surge8 = getStreamData_surge8("distance"); // meters

function getTopNBestAveragesOverNSeconds_surge8(data, n, topN = 20, samplingRate = 1) {
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

function secondsToHms_surge8(seconds) {
    seconds = Math.floor(seconds);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    let str = '';
    if (h > 0) str += String(h).padStart(2, '0') + ':';
    str += (h > 0 ? String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
    return str;
}

// Prepare data for table
let header_surge8 = ['# (by watts)', 'Power (W)', 'W/kg', 'Drop 2"', 'Drop 2/2', 'HR', 'Avg Speed (km/h)', 'Start (h:m:s)', '# (chronological)'];
let cells_surge8 = [[], [], [], [], [], [], [], [], []];

// Get best 20 by watts
const bests_surge8 = getTopNBestAveragesOverNSeconds_surge8(power_surge8, DURATION_surge8, TOP_N_surge8, 1);
// For chronological order, sort a copy by start
const bests_surge8_chrono = [...bests_surge8].sort((a, b) => a.start - b.start);

bests_surge8.forEach((best, idx) => {
    const bestStart = best.start;
    const bestEnd = bestStart + DURATION_surge8;
    const sectionPower = power_surge8.slice(bestStart, bestEnd);
    const sectionHR = heartrate_surge8.slice(bestStart, bestEnd);
    const sectionTime = time_surge8.slice(bestStart, bestEnd);
    const sectionDistance = distance_surge8.slice(bestStart, bestEnd);
    const avgPower = best.avg;
    const avgPowerPerKg = avgPower / weight_surge8;
    // Drop 2/2: ultimi 2" / primi 2"
    const first2 = sectionPower.slice(0, 2).reduce((a, b) => a + b, 0) / 2;
    const last2 = sectionPower.slice(-2).reduce((a, b) => a + b, 0) / 2;
    const drop2 = (first2 - last2).toFixed(0); // differenza assoluta primi 2" - ultimi 2"
    const drop2_2 = (last2 / first2) * 100;
    // HR
    const avgHR = sectionHR.reduce((a, b) => a + b, 0) / sectionHR.length;
    // Avg speed
    const dist = sectionDistance[sectionDistance.length - 1] - sectionDistance[0];
    const avgSpeed = (dist / 1000) / (DURATION_surge8 / 3600);
    // Start time formatted
    const startTime = secondsToHms_surge8(time_surge8[bestStart]);
    // Find chronological index (1-based)
    const chronoIdx = bests_surge8_chrono.findIndex(b => b.start === best.start) + 1;
    // Fill table
    cells_surge8[0].push(idx + 1); // # by watts
    cells_surge8[1].push(avgPower.toFixed(0));
    cells_surge8[2].push(avgPowerPerKg.toFixed(2));
    cells_surge8[3].push(drop2); // nuova colonna differenza assoluta
    cells_surge8[4].push(drop2_2.toFixed(1) + '%');
    cells_surge8[5].push(avgHR.toFixed(0));
    cells_surge8[6].push(avgSpeed.toFixed(1));
    cells_surge8[7].push(startTime);
    cells_surge8[8].push(chronoIdx); // # chronological
});

const data_surge8 = [{
    type: 'table',
    header: {
        values: header_surge8,
        align: 'center',
        font: {size: 14, color: 'white'},
        fill: {color: '#1f77b4'}
    },
    cells: {
        values: cells_surge8,
        align: 'center',
        font: {size: 13},
        fill: {color: ['#f9f9f9', '#f2f2f2']}
    }
}];

const layout_surge8 = {
    title: "8s surges",
    margin: {l: 20, r: 20, t: 40, b: 20},
    height: 500
};

chart = { data: data_surge8, layout: layout_surge8 };
chart;
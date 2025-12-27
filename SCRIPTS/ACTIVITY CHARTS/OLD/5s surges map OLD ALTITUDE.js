
// --- CONFIGURATION ---
// Main parameters for customization
// Effort window duration in seconds (e.g. 5 = 5 seconds)
const WINDOW_SECONDS_5schart = 5;
// Minimum intensity as a fraction of FTP (e.g. 2.2 = 220% FTP)
const MIN_EFFORT_INTENSITY_FTP_5schart = 2.2;
// Activity FTP
const FTP_5schart = icu.activity.icu_ftp;
// Zone color configuration: edit threshold, color, and label as needed
const ZONE_COLORS_5schart = [
    { threshold: 251, color: "#4c72b0", label: "Z2" },
    { threshold: 301, color: "#55a868", label: "Z3" },
    { threshold: 351, color: "#dd8452", label: "Z4" },
    { threshold: 401, color: "#c44e52", label: "Z5" },
    { threshold: 451, color: "#a64d79", label: "Z6" },
];
// Default color for zones above threshold
const ZONE_COLOR_DEFAULT_5schart = { color: "#8172b3", label: "Z7+" };

// --- END CONFIGURATION ---

// Helper: format seconds as HH:MM:SS
function formatSecondsToHHMMSS(seconds) {
    const sec = Math.floor(seconds % 60);
    const min = Math.floor((seconds / 60) % 60);
    const hr = Math.floor(seconds / 3600);
    return `${hr.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

// --- STREAMS & ACTIVITY DATA ---
// Helper to get stream data or fallback to zero array
function getStreamData_5schart(streamName) {
    const stream = icu.streams.get(streamName);
    return stream && stream.data ? stream.data.map(value => value ?? 0) : Array(icu.streams.get("time").data.length).fill(0);
}

// Extract activity streams
const altitude_5schart   = getStreamData_5schart("fixed_altitude");
const distance_5schart   = getStreamData_5schart("distance");
const distanceKm_5schart = distance_5schart.map(d => d / 1000);
const power_5schart      = getStreamData_5schart("fixed_watts");
const heartrate_5schart  = getStreamData_5schart("fixed_heartrate");
const grade_5schart      = getStreamData_5schart("grade_smooth");
const time_5schart       = getStreamData_5schart("time");
const weight_5schart     = icu.activity.icu_weight;

// Fix initial altitude values (replace zeros with first non-zero value)
const firstNonZeroAltitude_5schart = altitude_5schart.find(value => value !== 0);
if (firstNonZeroAltitude_5schart !== undefined) {
    for (let i = 0; i < altitude_5schart.length; i++) {
        if (altitude_5schart[i] === 0) {
            altitude_5schart[i] = firstNonZeroAltitude_5schart;
        } else {
            break;
        }
    }
}

// --- CHART DATA & LAYOUT ---
// Chart traces and annotations initialization
let traces_5schart = [
    {
        x: distanceKm_5schart,
        y: altitude_5schart,
        text: altitude_5schart.map(alt => `${alt.toFixed(1)} m`),
        hoverinfo: 'text',
        fill: 'tozeroy',
        type: 'scatter',
        fillcolor: 'whitesmoke',
        mode: 'none',
        name: 'Elevation'
    }
];
let annotations_5schart = [];
// Find all non-overlapping efforts above threshold
function getAllNonOverlappingEffortsAboveThreshold_5schart(data, n, threshold, samplingRate = 1) {
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

const threshold_5schart = MIN_EFFORT_INTENSITY_FTP_5schart * FTP_5schart;
const allEfforts_5schart = getAllNonOverlappingEffortsAboveThreshold_5schart(power_5schart, WINDOW_SECONDS_5schart, threshold_5schart, 1);
// Sort efforts by average power descending for legend order
const sortedEfforts_5schart = allEfforts_5schart.slice().sort((a, b) => b.avg - a.avg);
sortedEfforts_5schart.forEach((best, idx) => {
    const avgPower = best.avg;
    const bestStart = best.start;
    const bestEnd = bestStart + WINDOW_SECONDS_5schart;
    const sectionPower = power_5schart.slice(bestStart, bestEnd);
    const sectionHR = heartrate_5schart.slice(bestStart, bestEnd);
    const sectionAltitude = altitude_5schart.slice(bestStart, bestEnd);
    const sectionDistance = distance_5schart.slice(bestStart, bestEnd);
    const sectionDistanceKm = distanceKm_5schart.slice(bestStart, bestEnd);
    const sectionGrade = grade_5schart.slice(bestStart, bestEnd);
    const sectionTime = time_5schart.slice(bestStart, bestEnd);

    // --- Effort metrics ---
    // Calculate effort metrics: heart rate, elevation, grade, power, speed, time, energy
    const minHR = Math.min(...sectionHR);
    const maxHR = Math.max(...sectionHR);
    const elevationGain = sectionAltitude[sectionAltitude.length - 1] - sectionAltitude[0];
    const dist = sectionDistance[sectionDistance.length - 1] - sectionDistance[0];
    const avgGrade = elevationGain / dist * 100;
    const avgPowerPerKg = avgPower / weight_5schart;
    const maxGrade = Math.max(...sectionGrade);
    // --- Speed metrics ---
    let v1 = '', v2 = '';
    if (sectionDistanceKm.length >= 2) {
        v1 = ((sectionDistanceKm[1] - sectionDistanceKm[0]) * 3600).toFixed(1);
        v2 = ((sectionDistanceKm[sectionDistanceKm.length-1] - sectionDistanceKm[sectionDistanceKm.length-2]) * 3600).toFixed(1);
    }
    // --- Effort start time ---
    let startTime = '';
    if (sectionTime && sectionTime.length > 0) {
        startTime = sectionTime[0].toFixed(1);
    }
    // --- Power min/max ---
    let minWatt = null, maxWatt = null;
    if (sectionPower.length > 0) {
        minWatt = Math.min(...sectionPower);
        maxWatt = Math.max(...sectionPower);
    }
    // --- Energy metrics up to effort start ---
    const bgColor = getZoneColor(avgPower, FTP_5schart);
    let joules = 0, joulesOverCP = 0;
    if (power_5schart && time_5schart && bestStart !== undefined && bestStart < power_5schart.length && FTP_5schart) {
        for (let i = 0; i < bestStart; i++) {
            let w = power_5schart[i];
            let secs = time_5schart[i] - (i > 0 ? time_5schart[i - 1] : 0);
            if (secs < 30) {
                joules += w * secs;
                if (w >= FTP_5schart) joulesOverCP += w * secs;
            }
        }
    }
    const hours = (time_5schart && bestStart !== undefined && time_5schart[bestStart]) ? (time_5schart[bestStart] / 3600) : 0;
    let kJ_h_kg = (weight_5schart && hours > 0) ? (joules/1000) / hours / weight_5schart : 0;
    let kJ_h_kg_overCP = (weight_5schart && hours > 0) ? (joulesOverCP/1000) / hours / weight_5schart : 0;
    // --- Cadence metrics ---
    const sectionCadence = getStreamData_5schart("cadence").slice(bestStart, bestEnd);
    let avgCadence = sectionCadence.length ? sectionCadence.reduce((a,b)=>a+b,0)/sectionCadence.length : 0;
    let minCadence = sectionCadence.length ? Math.min(...sectionCadence) : 0;
    let maxCadence = sectionCadence.length ? Math.max(...sectionCadence) : 0;
    // ...existing code...

    // Build trace text for hover/legend (original format)
    const traceText = [
        `#${idx + 1}`,
        `⚡ ${avgPower.toFixed(0)} W  ⚖️ ${avgPowerPerKg.toFixed(2)} W/kg`,
        `⚡ 🔺${maxWatt !== null ? maxWatt : ''} W |🔻${minWatt !== null ? minWatt : ''} W`,
        `🌀 ∅${avgCadence.toFixed(0)} rpm | 🔻${minCadence} rpm | 🔺${maxCadence} rpm`,
        `❤️ 🔻${minHR.toFixed(0)} bpm |🔺${maxHR} bpm`,
        v1 && v2 ? `➡️ ${v1} km/h | ${v2} km/h` : '',
        `📏 ∅ ${avgGrade.toFixed(1)}% max. ${maxGrade.toFixed(1)}%`,
        startTime ? `🕒 ${formatSecondsToHHMMSS(Number(startTime))}` : '',
        `🔋 ${Math.round(joules/1000)} kJ | ${Math.round(joulesOverCP/1000)} kJ > CP`,
        `🔥 ${kJ_h_kg.toFixed(1)} kJ/h/kg | ${kJ_h_kg_overCP.toFixed(1)} kJ/h/kg > CP`
    ].filter(Boolean).join('<br>');
    traces_5schart.push({
        x: sectionDistanceKm,
        y: sectionAltitude,
        type: 'scatter',
        mode: 'lines',
        line: { color: bgColor, width: 2 },
        name: `${avgPower.toFixed(0)} W | #${idx + 1}`,
        hoverinfo: 'text',
        visible: true,
        hoverlabel: { align: 'left' },
        text: traceText
    });

    // Offset annotation positions to avoid overlap
    // Add annotation for each effort
    annotations_5schart.push({
        x: (sectionDistanceKm[0] + sectionDistanceKm[sectionDistanceKm.length - 1]) / 2 + (idx % 2 === 0 ? -1 : 1) * idx * 0.003,
        y: Math.max(...sectionAltitude) + 50 + idx * 25,
        text: `#${idx + 1}<br>⚡ ${avgPower.toFixed(0)}`,
        showarrow: false,
        font: { family: 'Arial', size: 12, color: 'white' },
        align: 'center',
        bgcolor: bgColor,
        opacity: 0.9
    });
});

// Chart layout configuration
const layout_5schart = {
    title: `All ${WINDOW_SECONDS_5schart}" Power Efforts >${(MIN_EFFORT_INTENSITY_FTP_5schart*100).toFixed(0)}% CP` ,
    xaxis: { title: 'Distance (km)' },
    yaxis: { title: 'Altitude (m)' },
    annotations: annotations_5schart,
    hovermode: 'x unified',
    showlegend: true,
    margin: { t: 100, l: 50, r: 50, b: 50 },
    height: 500
};

// Final chart object for Intervals.icu
const chart_5schart = { data: traces_5schart, layout: layout_5schart };
chart_5schart;

// Returns the color for the given power zone
function getZoneColor(avgPower, FTP) {
    if (!FTP || FTP <= 0) return ZONE_COLOR_DEFAULT_5schart.color;
    const percentage = (avgPower / FTP) * 100;
    for (const zone of ZONE_COLORS_5schart) {
        if (percentage < zone.threshold) return zone.color;
    }
    return ZONE_COLOR_DEFAULT_5schart.color;
}
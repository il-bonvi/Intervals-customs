(function() {
const CONFIG_5smap = {
// =====================
// CONFIGURAZIONE PRINCIPALE
// =====================
  WINDOW_SECONDS: 5,                // Durata finestra sforzo (secondi)
  MIN_EFFORT_INTENSITY_FTP: 220,    // Soglia minima effort (% FTP)
// ============================================================================
  ZONES: [
    { name: 'Z2', max: 251, color: '#4c72b0' },
    { name: 'Z3', max: 301, color: '#55a868' },
    { name: 'Z4', max: 351, color: '#dd8452' },
    { name: 'Z5', max: 401, color: '#c44e52' },
    { name: 'Z6', max: 451, color: '#a64d79' },
    { name: 'Z7', max: Infinity, color: '#8172b3' }
  ],
  BAR_TEXT_COLOR: '#000000',
  BAR_TEXT_FONT: { family: 'Arial Black', size: 13 },
  GRID_X_COLOR: '#EEEEEE',
  GRID_X_WIDTH: 1,
  GRID_Y_COLOR: '#CCCCCC',
  GRID_Y_WIDTH: 1,
};
// =====================
// FINE CONFIGURAZIONE
function getBestAverageOverNSeconds(data, n, samplingRate = 1) {
    const windowSize = n * samplingRate;
    let bestAvg = 0;
    let bestStart = 0;
    let sum = 0;
    // Initialize sum of the first window
    for (let i = 0; i < windowSize; i++) {
        sum += data[i];
    }
    bestAvg = sum / windowSize;
    // Slide the window
    for (let i = 1; i <= data.length - windowSize; i++) {
        sum = sum - data[i - 1] + data[i + windowSize - 1];
        const avg = sum / windowSize;
        if (avg > bestAvg) {
            bestAvg = avg;
            bestStart = i;
        }
    }
    return { bestAvg, bestStart };
}

function getTopNBestAveragesOverNSeconds(data, n, topN = 2, samplingRate = 1) {
    const windowSize = n * samplingRate;
    let results = [];
    let sum = 0;
    // Initialize sum of the first window
    for (let i = 0; i < windowSize; i++) {
        sum += data[i];
    }
    results.push({ avg: sum / windowSize, start: 0 });
    // Slide the window
    for (let i = 1; i <= data.length - windowSize; i++) {
        sum = sum - data[i - 1] + data[i + windowSize - 1];
        const avg = sum / windowSize;
        results.push({ avg, start: i });
    }
    // Sort by avg descending, filter out overlapping windows
    results.sort((a, b) => b.avg - a.avg);
    let nonOverlapping = [];
    for (let i = 0; i < results.length && nonOverlapping.length < topN; i++) {
        if (nonOverlapping.every(r => Math.abs(r.start - results[i].start) >= windowSize)) {
            nonOverlapping.push(results[i]);
        }
    }
    return nonOverlapping;
}

{
    // Configurazione
    const WINDOW_SECONDS = CONFIG_5smap.WINDOW_SECONDS;
    const FTP = icu.activity.icu_ftp;

    function getStreamData(streamName) {
        const stream = icu.streams.get(streamName);
        return stream && stream.data ? stream.data.map(value => value ?? 0) : Array(icu.streams.get("time").data.length).fill(0);
    }

    const altitude = getStreamData("fixed_altitude");
    const distance = getStreamData("distance");
    const distanceKm = distance.map(d => d / 1000);
    const power = getStreamData("fixed_watts");
    const heartrate = getStreamData("fixed_heartrate");
    const grade = getStreamData("grade_smooth");
    const time = getStreamData("time");
    const weight = icu.activity.icu_weight;

    // Fix initial altitude values
    const firstNonZeroAltitude = altitude.find(value => value !== 0);
    if (firstNonZeroAltitude !== undefined) {
        for (let i = 0; i < altitude.length; i++) {
            if (altitude[i] === 0) {
                altitude[i] = firstNonZeroAltitude;
            } else {
                break;
            }
        }
    }

    let traces = [
        {
            x: distanceKm,
            y: altitude,
            text: altitude.map(alt => `${alt.toFixed(1)} m`),
            hoverinfo: 'text',
            fill: 'tozeroy',
            type: 'scatter',
            fillcolor: 'whitesmoke',
            mode: 'none',
            name: 'Elevation'
        }
    ];
    let annotations = [];
    // Trova tutti gli sforzi non sovrapposti sopra la soglia configurata
    function getAllNonOverlappingEffortsAboveThreshold(data, n, threshold, samplingRate = 1) {
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

    const threshold = (CONFIG_5smap.MIN_EFFORT_INTENSITY_FTP / 100) * FTP;
    const allEfforts = getAllNonOverlappingEffortsAboveThreshold(power, WINDOW_SECONDS, threshold, 1);
    // Sort allEfforts by avgPower descending for legend order
    const sortedEfforts = allEfforts.slice().sort((a, b) => b.avg - a.avg);
    sortedEfforts.forEach((best, idx) => {
        const avgPower = best.avg;
        const bestStart = best.start;
        const bestEnd = bestStart + WINDOW_SECONDS;
        const sectionPower = power.slice(bestStart, bestEnd);
        const sectionHR = heartrate.slice(bestStart, bestEnd);
        const sectionAltitude = altitude.slice(bestStart, bestEnd);
        const sectionDistance = distance.slice(bestStart, bestEnd);
        const sectionDistanceKm = distanceKm.slice(bestStart, bestEnd);
        const sectionGrade = grade.slice(bestStart, bestEnd);
        const sectionTime = time.slice(bestStart, bestEnd);

        // --- Metrics block ---
        const minHR = Math.min(...sectionHR);
        const maxHR = Math.max(...sectionHR);
        const elevationGain = sectionAltitude[sectionAltitude.length - 1] - sectionAltitude[0];
        const dist = sectionDistance[sectionDistance.length - 1] - sectionDistance[0];
        const avgGrade = elevationGain / dist * 100;
        const avgPowerPerKg = avgPower / weight;
        const maxGrade = Math.max(...sectionGrade);
        const climbTimeInSeconds = sectionTime[sectionTime.length - 1] - sectionTime[0] + 1;
        const ascentSpeed = elevationGain / (climbTimeInSeconds / 3600);
        // --- Speed details ---
        let v1 = '', v2 = '';
        if (sectionDistanceKm.length >= 2) {
            v1 = ((sectionDistanceKm[1] - sectionDistanceKm[0]) * 3600).toFixed(1); // km/h primo secondo
            v2 = ((sectionDistanceKm[sectionDistanceKm.length-1] - sectionDistanceKm[sectionDistanceKm.length-2]) * 3600).toFixed(1); // km/h ultimo secondo
        }
        // --- Start time ---
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
        // --- kJ and kJ/h/kg up to effort start ---
        let bgColor = getZoneColor(avgPower, FTP);
        if (bgColor && !bgColor.startsWith('#')) bgColor = '#' + bgColor;
        let joules = 0, joulesOverCP = 0;
        if (power && time && bestStart !== undefined && bestStart < power.length && FTP) {
            for (let i = 0; i < bestStart; i++) {
                let w = power[i];
                let secs = time[i] - (i > 0 ? time[i - 1] : 0);
                if (secs < 30) {
                    joules += w * secs;
                    if (w >= FTP) joulesOverCP += w * secs;
                }
            }
        }
        const hours = (time && bestStart !== undefined && time[bestStart]) ? (time[bestStart] / 3600) : 0;
        let kJ_h_kg = (weight && hours > 0) ? (joules/1000) / hours / weight : 0;
        let kJ_h_kg_overCP = (weight && hours > 0) ? (joulesOverCP/1000) / hours / weight : 0;
        // --- Trace text layout (organized) ---
        function formatSecondsToHHMMSS(seconds) {
            const sec = Math.floor(seconds % 60);
            const min = Math.floor((seconds / 60) % 60);
            const hr = Math.floor(seconds / 3600);
            return `${hr.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
        }
        const traceText = [
            `#${idx + 1}`,
            `⚡ ${avgPower.toFixed(0)} W  ⚖️ ${avgPowerPerKg.toFixed(2)} W/kg`,
            `⚡ 🔺${maxWatt !== null ? maxWatt : ''} W |🔻${minWatt !== null ? minWatt : ''} W`,
            `❤️ 🔻${minHR.toFixed(0)} bpm |🔺${maxHR} bpm`,
            v1 && v2 ? `➡️ ${v1} km/h | ${v2} km/h` : '',
            `📏 ∅ ${avgGrade.toFixed(1)}% max. ${maxGrade.toFixed(1)}%`,
            startTime ? `🕒 ${formatSecondsToHHMMSS(Number(startTime))}` : '',
            `🔋 ${Math.round(joules/1000)} kJ | ${Math.round(joulesOverCP/1000)} kJ > CP`,
            `🔥 ${kJ_h_kg.toFixed(1)} kJ/h/kg | ${kJ_h_kg_overCP.toFixed(1)} kJ/h/kg > CP`
        ].filter(Boolean).join('<br>');
        traces.push({
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
        annotations.push({
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

    const layout = {
        title: `All ${CONFIG_5smap.WINDOW_SECONDS}" Power Efforts >${CONFIG_5smap.MIN_EFFORT_INTENSITY_FTP}% FTP` ,
        xaxis: { title: 'Distance (km)' },
        yaxis: { title: 'Altitude (m)' },
        annotations: annotations,
        hovermode: 'x unified',
        showlegend: true,
        margin: { t: 100, l: 50, r: 50, b: 50 },
        height: 500
    };

    const chart = { data: traces, layout: layout };
    globalThis.chart = chart;
    return chart;
}

function getZoneColor(avgPower, FTP) {
    if (!FTP || FTP <= 0) return 'grey';
    const percentage = (avgPower / FTP) * 100;
    for (const zone of CONFIG_5smap.ZONES) {
        if (percentage < zone.max) return zone.color;
    }
    return '#000'; // fallback
}
})();
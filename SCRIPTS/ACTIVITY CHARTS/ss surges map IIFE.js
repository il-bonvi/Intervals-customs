(function() {
const CONFIG_surges = {
// =====================
// CONFIGURAZIONE PRINCIPALE
// =====================
  MIN_EFFORT_INTENSITY_FTP: 220,    // Soglia minima effort (% FTP)
        // Rilevamento per secondo: considera solo secondi >= soglia
        // MIN_SURGE_SECONDS: durata minima (in secondi) di un surge per essere considerato
        MIN_SURGE_SECONDS: 3,
        // Se due surges sono separati da meno di questo valore (secondi) vengono uniti
        MERGE_GAP_SECONDS: 1,
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

{
    // Configurazione
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
        const cadence = getStreamData("cadence");
        const torque = getStreamData("torque");

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
    // Nuovo rilevamento: trova run di secondi sopra la soglia, scarta quelli corti (< MIN), poi unisce run vicini (gap <= MERGE_GAP_SECONDS)
    // Compute typical sample interval (seconds) from `time` stream using median of deltas
    function computeSampleInterval(timeArr) {
        if (!timeArr || timeArr.length < 2) return 1;
        const deltas = [];
        for (let i = 1; i < timeArr.length; i++) {
            const d = timeArr[i] - timeArr[i - 1];
            if (d > 0 && isFinite(d)) deltas.push(d);
        }
        if (deltas.length === 0) return 1;
        deltas.sort((a, b) => a - b);
        const mid = Math.floor(deltas.length / 2);
        return deltas.length % 2 === 1 ? deltas[mid] : (deltas[mid - 1] + deltas[mid]) / 2;
    }

    // Get clusters in samples (minSamples, mergeGapSamples are counts of samples)
    function getSurgeClusters(data, threshold, minSamples = 3, mergeGapSamples = 3) {
        const above = data.map(v => (v >= threshold));
        const runs = [];
        let i = 0;
        while (i < above.length) {
            if (above[i]) {
                let start = i;
                while (i + 1 < above.length && above[i + 1]) i++;
                let end = i;
                const len = end - start + 1;
                if (len >= minSamples) runs.push({ start, end, length: len });
            }
            i++;
        }

        if (runs.length === 0) return [];

        // Merge runs that are close (gap <= mergeGapSamples)
        const clusters = [];
        let current = { runs: [runs[0]], start: runs[0].start, end: runs[0].end };
        for (let r = 1; r < runs.length; r++) {
            const gap = runs[r].start - current.end - 1;
            if (gap <= mergeGapSamples) {
                current.runs.push(runs[r]);
                current.end = runs[r].end;
            } else {
                clusters.push(current);
                current = { runs: [runs[r]], start: runs[r].start, end: runs[r].end };
            }
        }
        clusters.push(current);

        // Compute aggregate stats for each cluster (avg weighted by sample count, total duration = sum of runs)
        for (const cl of clusters) {
            let totalSamples = 0;
            let totalPower = 0;
            for (const r of cl.runs) {
                totalSamples += (r.end - r.start + 1);
                for (let k = r.start; k <= r.end; k++) totalPower += data[k];
            }
            cl.avg = totalSamples > 0 ? totalPower / totalSamples : 0;
            cl.duration = totalSamples; // in seconds since sampling 1Hz
        }

        return clusters;
    }

    const threshold = (CONFIG_surges.MIN_EFFORT_INTENSITY_FTP / 100) * FTP;
    // Determine typical sample interval (seconds) and convert configured seconds to samples
    const sampleInterval = computeSampleInterval(time) || 1; // sec per sample (float)
    const minSamples = Math.max(1, Math.round(CONFIG_surges.MIN_SURGE_SECONDS / sampleInterval));
    const mergeGapSamples = Math.max(0, Math.round(CONFIG_surges.MERGE_GAP_SECONDS / sampleInterval));
    const clusters = getSurgeClusters(power, threshold, minSamples, mergeGapSamples);
    // Sort clusters by avg power desc for legend order
    const sortedClusters = clusters.slice().sort((a, b) => b.avg - a.avg);
    sortedClusters.forEach((cluster, idx) => {
    const avgPower = cluster.avg;
    const bestStart = cluster.start;
    const bestEnd = cluster.end + 1;
    const displayDurationSec = Math.round(cluster.duration * sampleInterval);
        // For metrics we need to aggregate across all runs in the cluster
    let sectionPower = [];
    let sectionHR = [];
    let sectionAltitude = [];
    let sectionDistance = [];
    let sectionDistanceKm = [];
    let sectionGrade = [];
    let sectionTime = [];
    let sectionCadence = [];
    let sectionTorque = [];
        for (const r of cluster.runs) {
            sectionPower = sectionPower.concat(power.slice(r.start, r.end + 1));
            sectionHR = sectionHR.concat(heartrate.slice(r.start, r.end + 1));
            sectionAltitude = sectionAltitude.concat(altitude.slice(r.start, r.end + 1));
            sectionDistance = sectionDistance.concat(distance.slice(r.start, r.end + 1));
            sectionDistanceKm = sectionDistanceKm.concat(distanceKm.slice(r.start, r.end + 1));
            sectionGrade = sectionGrade.concat(grade.slice(r.start, r.end + 1));
            sectionTime = sectionTime.concat(time.slice(r.start, r.end + 1));
            sectionCadence = sectionCadence.concat(cadence.slice(r.start, r.end + 1));
            sectionTorque = sectionTorque.concat(torque.slice(r.start, r.end + 1));
        }

        // --- Metrics block ---
    const minHR = Math.min(...sectionHR);
    const maxHR = Math.max(...sectionHR);
    // cadence and torque min/max (if streams available)
    const minCadence = sectionCadence.length ? Math.min(...sectionCadence) : null;
    const maxCadence = sectionCadence.length ? Math.max(...sectionCadence) : null;
    const minTorque = sectionTorque.length ? Math.min(...sectionTorque) : null;
    const maxTorque = sectionTorque.length ? Math.max(...sectionTorque) : null;
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
        // averages for cadence and torque
        const avgCadence = sectionCadence.length ? sectionCadence.reduce((a,b)=>a+b,0)/sectionCadence.length : null;
        const avgTorque = sectionTorque.length ? sectionTorque.reduce((a,b)=>a+b,0)/sectionTorque.length : null;
        // helper: find first global index in cluster where power equals value
        function findIndexForPowerValue(cluster, value) {
            if (value === null || value === undefined) return -1;
            for (const r of cluster.runs) {
                for (let k = r.start; k <= r.end; k++) {
                    const p = power[k];
                    if (Math.abs(p - value) < 1e-6) return k;
                }
            }
            return -1;
        }
        const maxIdx = findIndexForPowerValue(cluster, maxWatt);
        const minIdx = findIndexForPowerValue(cluster, minWatt);
        const rpmAtMax = (maxIdx >= 0 && cadence && cadence[maxIdx] != null) ? Math.round(cadence[maxIdx]) : '';
        const torqueAtMax = (maxIdx >= 0 && torque && torque[maxIdx] != null) ? Math.round(torque[maxIdx]) : '';
        const rpmAtMin = (minIdx >= 0 && cadence && cadence[minIdx] != null) ? Math.round(cadence[minIdx]) : '';
        const torqueAtMin = (minIdx >= 0 && torque && torque[minIdx] != null) ? Math.round(torque[minIdx]) : '';
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
            `#${idx + 1}    ∅${avgCadence !== null ? Math.round(avgCadence) : ''} rpm | ∅${avgTorque !== null ? Math.round(avgTorque) : ''} Nm | ${displayDurationSec} s`,
            `⚡ 🔺${maxWatt !== null ? maxWatt : ''} W at ${rpmAtMax} rpm @ ${torqueAtMax} Nm`,
            `⚡ 🔻${minWatt !== null ? minWatt : ''} W at ${rpmAtMin} rpm @ ${torqueAtMin} Nm`,
            `🌀 🔺${minCadence !== null ? Math.round(maxCadence) : ''} rpm | 🔻${maxCadence !== null ? Math.round(minCadence) : ''} rpm`,
            `⚙️ 🔺${minTorque !== null ? Math.round(maxTorque) : ''} Nm | 🔻${maxTorque !== null ? Math.round(minTorque) : ''} Nm`,
            `❤️ 🔻${minHR.toFixed(0)} bpm |🔺${maxHR} bpm`,
            v1 && v2 ? `➡️ ${v1} km/h | ${v2} km/h` : '',
            `📏 ∅ ${avgGrade.toFixed(1)}% max. ${maxGrade.toFixed(1)}%`,
            startTime ? `🕒 ${formatSecondsToHHMMSS(Number(startTime))}` : '',
            `🔋 ${Math.round(joules/1000)} kJ | ${Math.round(joulesOverCP/1000)} kJ > CP`,
            `🔥 ${kJ_h_kg.toFixed(1)} kJ/h/kg | ${kJ_h_kg_overCP.toFixed(1)} kJ/h/kg > CP`
        ].filter(Boolean).join('<br>');
        // Create one trace per run (subsegment) to avoid connecting below-threshold gaps
        cluster.runs.forEach((r, runIdx) => {
            const segX = distanceKm.slice(r.start, r.end + 1);
            const segY = altitude.slice(r.start, r.end + 1);
            traces.push({
                x: segX,
                y: segY,
                type: 'scatter',
                mode: 'lines',
                line: { color: bgColor, width: 2 },
                // use cluster-level name but mark run index if cluster has multiple runs
                name: `${avgPower.toFixed(0)} W | ${displayDurationSec}s | #${idx + 1}${cluster.runs.length>1?(' (part '+(runIdx+1)+')'):''}`,
                hoverinfo: 'text',
                visible: true,
                hoverlabel: { align: 'left' },
                text: traceText
            });
        });

        // Offset annotation positions to avoid overlap
        // Place annotation near the middle of the cluster (use first run midpoint)
        const firstRun = cluster.runs[0];
        const lastRun = cluster.runs[cluster.runs.length-1];
        const midIdx = Math.floor((firstRun.start + lastRun.end) / 2);
        const annX = distanceKm[midIdx] || ((distanceKm[firstRun.start] + distanceKm[lastRun.end]) / 2);
        const annY = Math.max(...cluster.runs.flatMap(r => altitude.slice(r.start, r.end + 1))) + 50 + idx * 25;
        annotations.push({
            x: annX,
            y: annY,
            text: `#${idx + 1}<br>⚡ ${avgPower.toFixed(0)} W<br>⏱ ${displayDurationSec}s`,
            showarrow: false,
            font: { family: 'Arial', size: 12, color: 'white' },
            align: 'center',
            bgcolor: bgColor,
            opacity: 0.9
        });
    });

    const layout = {
    title: `Surges ≥${CONFIG_surges.MIN_SURGE_SECONDS}s >${CONFIG_surges.MIN_EFFORT_INTENSITY_FTP}% FTP`,
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
    for (const zone of CONFIG_surges.ZONES) {
        if (percentage < zone.max) return zone.color;
    }
    return '#000'; // fallback
}
})();
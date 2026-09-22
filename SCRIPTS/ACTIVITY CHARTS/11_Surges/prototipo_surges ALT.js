(function() {
const CONFIG_surges = {
// =====================
// CONFIGURAZIONE PRINCIPALE
// =====================
  MIN_EFFORT_INTENSITY_FTP: 220,
  MIN_SURGE_SECONDS: 5,
  MERGE_GAP_SECONDS: 1,

  // Lookback
  LOOKBACK_SECONDS: 4,
  SMOOTH_SECONDS: 2,
  LOW_POWER_THRESHOLD_FTP: 130,
  MIN_SPEED_RISE: 2,

  // Velocità di entrata
  ENTRY_SPEED_SECONDS: 5,

//COLORS
  ZONES: [
    { name: 'Z2', max: 251, color: '#4c72b0' },
    { name: 'Z3', max: 301, color: '#55a868' },
    { name: 'Z4', max: 351, color: '#dd8452' },
    { name: 'Z5', max: 401, color: '#c44e52' },
    { name: 'Z6', max: 451, color: '#a64d79' },
    { name: 'Z7', max: Infinity, color: '#8172b3' }
  ]
};
// =====================
// FINE CONFIGURAZIONE

{
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

    const firstNonZeroAltitude = altitude.find(v => v !== 0);
    if (firstNonZeroAltitude !== undefined) {
        for (let i = 0; i < altitude.length; i++) {
            if (altitude[i] === 0) altitude[i] = firstNonZeroAltitude;
            else break;
        }
    }

    let traces = [{
        x: distanceKm,
        y: altitude,
        text: altitude.map(alt => `${alt.toFixed(1)} m`),
        hoverinfo: 'text',
        fill: 'tozeroy',
        type: 'scatter',
        fillcolor: 'whitesmoke',
        mode: 'none',
        name: 'Elevation'
    }];
    let annotations = [];

    function computeSampleInterval(timeArr) {
        if (!timeArr || timeArr.length < 2) return 1;
        const deltas = [];
        for (let i = 1; i < timeArr.length; i++) {
            const d = timeArr[i] - timeArr[i-1];
            if (d > 0 && isFinite(d)) deltas.push(d);
        }
        if (!deltas.length) return 1;
        deltas.sort((a,b) => a-b);
        const mid = Math.floor(deltas.length/2);
        return deltas.length % 2 ? deltas[mid] : (deltas[mid-1] + deltas[mid]) / 2;
    }

    function getSurgeClusters(data, threshold, minSamples, mergeGapSamples) {
        const above = data.map(v => v >= threshold);
        const runs = [];
        let i = 0;
        while (i < above.length) {
            if (above[i]) {
                let start = i;
                while (i+1 < above.length && above[i+1]) i++;
                if (i - start + 1 >= minSamples) runs.push({start, end: i});
            }
            i++;
        }
        if (!runs.length) return [];

        const clusters = [];
        let cur = {runs: [runs[0]], start: runs[0].start, end: runs[0].end};
        for (let r = 1; r < runs.length; r++) {
            if (runs[r].start - cur.end - 1 <= mergeGapSamples) {
                cur.runs.push(runs[r]);
                cur.end = runs[r].end;
            } else {
                clusters.push(cur);
                cur = {runs: [runs[r]], start: runs[r].start, end: runs[r].end};
            }
        }
        clusters.push(cur);

        for (const cl of clusters) {
            let totS = 0, totP = 0;
            for (const r of cl.runs) {
                totS += r.end - r.start + 1;
                for (let k = r.start; k <= r.end; k++) totP += data[k];
            }
            cl.avg = totS ? totP / totS : 0;
            cl.duration = totS;
            cl.originalStart = cl.start;
        }
        return clusters;
    }

    function findBetterStartBySpeedMin(powerStart, powerEnd, lookbackSamples, smoothSamples, lowPowerThr, minRise) {
        const from = Math.max(0, powerStart - lookbackSamples);

        const rawSpeed = [];
        for (let i = from; i <= powerEnd; i++) {
            if (i === 0) { rawSpeed.push(0); continue; }
            const dd = distanceKm[i] - distanceKm[i-1];
            const dt = time[i] - time[i-1];
            rawSpeed.push(dt > 0 ? (dd / dt) * 3600 : 0);
        }

        const smooth = [];
        for (let i = 0; i < rawSpeed.length; i++) {
            let sum = 0, cnt = 0;
            for (let k = Math.max(0, i - Math.floor(smoothSamples/2)); k <= Math.min(rawSpeed.length-1, i + Math.floor(smoothSamples/2)); k++) {
                sum += rawSpeed[k];
                cnt++;
            }
            smooth.push(sum / cnt);
        }

        const lookbackLen = powerStart - from;
        if (lookbackLen < 2) return powerStart;

        let minVal = Infinity;
        let minIdx = lookbackLen;
        for (let i = 0; i < lookbackLen; i++) {
            if (smooth[i] < minVal) {
                minVal = smooth[i];
                minIdx = i;
            }
        }

        const speedAtPowerStart = smooth[lookbackLen] || smooth[smooth.length-1];
        if (speedAtPowerStart - minVal < minRise) return powerStart;

        let candidate = from + minIdx;
        while (candidate < powerStart && power[candidate] < lowPowerThr) candidate++;
        return Math.min(candidate + 1, powerStart);
    }

    const threshold = (CONFIG_surges.MIN_EFFORT_INTENSITY_FTP / 100) * FTP;
    const lowThr = (CONFIG_surges.LOW_POWER_THRESHOLD_FTP / 100) * FTP;
    const sampleInterval = computeSampleInterval(time) || 1;
    const minSamples = Math.max(1, Math.round(CONFIG_surges.MIN_SURGE_SECONDS / sampleInterval));
    const mergeGapSamples = Math.max(0, Math.round(CONFIG_surges.MERGE_GAP_SECONDS / sampleInterval));
    const lookbackSamples = Math.round(CONFIG_surges.LOOKBACK_SECONDS / sampleInterval);
    const smoothSamples = Math.max(1, Math.round(CONFIG_surges.SMOOTH_SECONDS / sampleInterval));

    const clusters = getSurgeClusters(power, threshold, minSamples, mergeGapSamples);

    clusters.forEach(cl => {
        const better = findBetterStartBySpeedMin(
            cl.start, cl.end, lookbackSamples, smoothSamples, lowThr, CONFIG_surges.MIN_SPEED_RISE
        );
        if (better < cl.start) {
            cl.start = better;
            if (cl.runs && cl.runs.length) cl.runs[0].start = better;

            let totS = 0, totP = 0;
            for (const r of cl.runs) {
                totS += r.end - r.start + 1;
                for (let k = r.start; k <= r.end; k++) totP += power[k];
            }
            cl.avg = totS ? totP / totS : 0;
            cl.duration = totS;
        }
    });

    const sortedClusters = clusters.slice().sort((a, b) => b.avg - a.avg);

    sortedClusters.forEach((cluster, idx) => {
        const avgPower = cluster.avg;
        const bestStart = cluster.start;
        const displayDurationSec = Math.round(cluster.duration * sampleInterval);

        let sectionPower = [], sectionHR = [], sectionAltitude = [], sectionDistance = [];
        let sectionDistanceKm = [], sectionGrade = [], sectionTime = [];
        let sectionCadence = [], sectionTorque = [];

        for (const r of cluster.runs) {
            sectionPower      = sectionPower.concat(power.slice(r.start, r.end+1));
            sectionHR         = sectionHR.concat(heartrate.slice(r.start, r.end+1));
            sectionAltitude   = sectionAltitude.concat(altitude.slice(r.start, r.end+1));
            sectionDistance   = sectionDistance.concat(distance.slice(r.start, r.end+1));
            sectionDistanceKm = sectionDistanceKm.concat(distanceKm.slice(r.start, r.end+1));
            sectionGrade      = sectionGrade.concat(grade.slice(r.start, r.end+1));
            sectionTime       = sectionTime.concat(time.slice(r.start, r.end+1));
            sectionCadence    = sectionCadence.concat(cadence.slice(r.start, r.end+1));
            sectionTorque     = sectionTorque.concat(torque.slice(r.start, r.end+1));
        }

        const minHR = Math.min(...sectionHR);
        const maxHR = Math.max(...sectionHR);
        const minCadence = sectionCadence.length ? Math.min(...sectionCadence) : null;
        const maxCadence = sectionCadence.length ? Math.max(...sectionCadence) : null;
        const minTorque = sectionTorque.length ? Math.min(...sectionTorque) : null;
        const maxTorque = sectionTorque.length ? Math.max(...sectionTorque) : null;
        const elevationGain = sectionAltitude[sectionAltitude.length-1] - sectionAltitude[0];
        const dist = sectionDistance[sectionDistance.length-1] - sectionDistance[0];
        const avgGrade = dist > 0 ? (elevationGain / dist * 100) : 0;
        const maxGrade = Math.max(...sectionGrade);

        // ========== SPEED & ACCELERATIONS ==========
        function speedAt(idx) {
            if (idx <= 0 || idx >= distanceKm.length) return 0;
            const dd = distanceKm[idx] - distanceKm[idx - 1];
            const dt = time[idx] - time[idx - 1];
            return dt > 0 ? (dd / dt) * 3600 : 0;
        }

        // v entrata = media degli N secondi prima
        const entryWindow = CONFIG_surges.ENTRY_SPEED_SECONDS || 5;
        let vEntrySum = 0, vEntryCount = 0;
        for (let k = Math.max(1, bestStart - entryWindow); k < bestStart; k++) {
            vEntrySum += speedAt(k);
            vEntryCount++;
        }
        const vEntry = vEntryCount > 0 ? vEntrySum / vEntryCount : speedAt(bestStart);

        // v uscita
        const lastIdx = cluster.end;
        const vExit = (speedAt(lastIdx) + speedAt(Math.max(lastIdx - 1, bestStart))) / 2;

        // Vmax + indice
        let vMax = 0;
        let vMaxIdx = bestStart;
        for (let k = bestStart; k <= cluster.end; k++) {
            const s = speedAt(k);
            if (s > vMax) {
                vMax = s;
                vMaxIdx = k;
            }
        }

        const deltaV = vExit - vEntry;
        const totalTimeSec = sectionTime[sectionTime.length-1] - sectionTime[0];
        const avgAcc = totalTimeSec > 0 ? deltaV / totalTimeSec : 0;

        // Acc 2→5s
        let acc_2_5 = null, v_at_2 = null, v_at_5 = null;
        if (displayDurationSec >= 6) {
            v_at_2 = speedAt(bestStart + 2);
            v_at_5 = speedAt(bestStart + 5);
            acc_2_5 = (v_at_5 - v_at_2) / 3;
        }

        // Acc entrata → 5s
        let acc_entry_5 = null;
        let v_at_5s = null;
        if (displayDurationSec >= 5) {
            v_at_5s = speedAt(bestStart + 5);
            acc_entry_5 = (v_at_5s - vEntry) / 5;
        }

        // Acc entrata → Vmax
        const timeToVmax = time[vMaxIdx] - time[bestStart];
        const acc_entry_vmax = timeToVmax > 0 ? (vMax - vEntry) / timeToVmax : 0;
        // ===========================================

        // ========== POWER METRICS ==========
        // Power di entrata
        const powerEntry = (power[bestStart] + (power[bestStart + 1] || power[bestStart])) / 2;

        // Power minima DOPO almeno 2 secondi + secondo in cui avviene
        let minWattAfter2 = null;
        let minWattAfter2Idx = -1;
        let minWattAfter2Sec = null;

        if (cluster.end >= bestStart + 2) {
            minWattAfter2 = Infinity;
            for (let k = bestStart + 2; k <= cluster.end; k++) {
                if (power[k] < minWattAfter2) {
                    minWattAfter2 = power[k];
                    minWattAfter2Idx = k;
                    minWattAfter2Sec = k - bestStart;   // secondo relativo dallo start (0-based)
                }
            }
        }

        const maxWatt = sectionPower.length ? Math.max(...sectionPower) : null;

        function findIndexForPowerValue(cl, value) {
            if (value == null) return -1;
            for (const r of cl.runs) {
                for (let k = r.start; k <= r.end; k++) {
                    if (Math.abs(power[k] - value) < 1e-6) return k;
                }
            }
            return -1;
        }

        const rpmAtEntry = cadence[bestStart] != null ? Math.round(cadence[bestStart]) : '';
        const torqueAtEntry = torque[bestStart] != null ? Math.round(torque[bestStart]) : '';

        const rpmAtMinAfter2 = (minWattAfter2Idx >= 0 && cadence[minWattAfter2Idx] != null) ? Math.round(cadence[minWattAfter2Idx]) : '';
        const torqueAtMinAfter2 = (minWattAfter2Idx >= 0 && torque[minWattAfter2Idx] != null) ? Math.round(torque[minWattAfter2Idx]) : '';

        const maxIdx = findIndexForPowerValue(cluster, maxWatt);
        const maxWattSec = maxIdx >= 0 ? maxIdx - bestStart : null;
        const rpmAtMax = (maxIdx >= 0 && cadence[maxIdx] != null) ? Math.round(cadence[maxIdx]) : '';
        const torqueAtMax = (maxIdx >= 0 && torque[maxIdx] != null) ? Math.round(torque[maxIdx]) : '';

        const avgCadence = sectionCadence.length ? sectionCadence.reduce((a,b)=>a+b,0)/sectionCadence.length : null;
        const avgTorque  = sectionTorque.length ? sectionTorque.reduce((a,b)=>a+b,0)/sectionTorque.length : null;
        // ==================================

        let bgColor = getZoneColor(avgPower, FTP);
        if (bgColor && !bgColor.startsWith('#')) bgColor = '#' + bgColor;

        let joules = 0, joulesOverCP = 0;
        if (power && time && bestStart < power.length && FTP) {
            for (let i = 0; i < bestStart; i++) {
                const w = power[i];
                const secs = time[i] - (i > 0 ? time[i-1] : 0);
                if (secs < 30) {
                    joules += w * secs;
                    if (w >= FTP) joulesOverCP += w * secs;
                }
            }
        }
        const hours = (time && time[bestStart]) ? time[bestStart]/3600 : 0;
        const kJ_h_kg = (weight && hours > 0) ? (joules/1000)/hours/weight : 0;
        const kJ_h_kg_overCP = (weight && hours > 0) ? (joulesOverCP/1000)/hours/weight : 0;

        const startTime = sectionTime.length ? sectionTime[0].toFixed(1) : '';

        function formatSecondsToHHMMSS(seconds) {
            const sec = Math.floor(seconds % 60);
            const min = Math.floor((seconds / 60) % 60);
            const hr = Math.floor(seconds / 3600);
            return `${String(hr).padStart(2,'0')}:${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
        }

        const traceText = [
            `#${idx+1} | Ø ${avgCadence != null ? Math.round(avgCadence) : ''} rpm | Ø ${avgTorque != null ? Math.round(avgTorque) : ''} Nm | ⏱ ${displayDurationSec} s`,
            `⬅️ ${powerEntry.toFixed(0)} W @ ${rpmAtEntry} rpm | ${torqueAtEntry} Nm`,
            maxWatt != null ? `⚡ 🔺 ${maxWatt.toFixed(0)} W (${maxWattSec} s) @ ${rpmAtMax} rpm | ${torqueAtMax} Nm` : '',
            minWattAfter2 != null ? `⚡ 🔻 ${minWattAfter2.toFixed(0)} W (${minWattAfter2Sec} s) @ ${rpmAtMinAfter2} rpm | ${torqueAtMinAfter2} Nm` : '',
            `🌀 🔺 ${maxCadence != null ? Math.round(maxCadence) : ''} rpm | 🔻 ${minCadence != null ? Math.round(minCadence) : ''} rpm`,
            `⚙️ 🔺 ${maxTorque != null ? Math.round(maxTorque) : ''} Nm | 🔻 ${minTorque != null ? Math.round(minTorque) : ''} Nm`,
            `❤️ 🔻 ${minHR.toFixed(0)} bpm | 🔺 ${maxHR} bpm`,
            `🚀 ⬅️ ${vEntry.toFixed(1)} km/h | 🏁 ${vExit.toFixed(1)} km/h | Δ ${deltaV>=0?'+':''}${deltaV.toFixed(1)} km/h`,
            `📈 Ø acc ${avgAcc.toFixed(2)} km/h/s | Vmax ${vMax.toFixed(1)} km/h`,
            acc_2_5 != null ? `📈 2→5s: ${acc_2_5.toFixed(2)} km/h/s (${v_at_2.toFixed(1)} → ${v_at_5.toFixed(1)} km/h)` : '',
            acc_entry_5 != null ? `🚀 ⬅️→5s: ${acc_entry_5.toFixed(2)} km/h/s (${vEntry.toFixed(1)} → ${v_at_5s.toFixed(1)} km/h)` : '',
            `🚀 ⬅️→Vmax: ${acc_entry_vmax.toFixed(2)} km/h/s (${vEntry.toFixed(1)} → ${vMax.toFixed(1)} km/h)`,
            `📏 Ø ${avgGrade.toFixed(1)}% | 🔺 ${maxGrade.toFixed(1)}%`,
            startTime ? `🕒 ${formatSecondsToHHMMSS(+startTime)}` : '',
            `🔋 ${Math.round(joules/1000)} kJ | ${Math.round(joulesOverCP/1000)} kJ > CP`,
            `🔥 ${kJ_h_kg.toFixed(1)} kJ/h/kg | ${kJ_h_kg_overCP.toFixed(1)} kJ/h/kg > CP`
        ].filter(Boolean).join('<br>');

        cluster.runs.forEach((r, runIdx) => {
            traces.push({
                x: distanceKm.slice(r.start, r.end+1),
                y: altitude.slice(r.start, r.end+1),
                type: 'scatter',
                mode: 'lines',
                line: {color: bgColor, width: 2},
                name: `${avgPower.toFixed(0)} W | ${displayDurationSec}s | #${idx+1}${cluster.runs.length>1 ? ' (p'+(runIdx+1)+')' : ''}`,
                hoverinfo: 'text',
                hoverlabel: {align: 'left'},
                text: traceText
            });
        });

        const firstRun = cluster.runs[0];
        const lastRun = cluster.runs[cluster.runs.length-1];
        const midIdx = Math.floor((firstRun.start + lastRun.end)/2);
        const annX = distanceKm[midIdx] || (distanceKm[firstRun.start] + distanceKm[lastRun.end])/2;
        const annY = Math.max(...cluster.runs.flatMap(r => altitude.slice(r.start, r.end+1))) + 50 + idx*25;

        annotations.push({
            x: annX,
            y: annY,
            text: `#${idx+1}<br>⚡ ${avgPower.toFixed(0)} W<br>⏱ ${displayDurationSec}s<br>Δv ${deltaV>=0?'+':''}${deltaV.toFixed(1)}`,
            showarrow: false,
            font: {family: 'Arial', size: 11, color: 'white'},
            align: 'center',
            bgcolor: bgColor,
            opacity: 0.9
        });
    });

    const layout = {
        title: `Surges ≥${CONFIG_surges.MIN_SURGE_SECONDS}s >${CONFIG_surges.MIN_EFFORT_INTENSITY_FTP}% FTP`,
        xaxis: {title: 'Distance (km)'},
        yaxis: {title: 'Altitude (m)'},
        annotations,
        hovermode: 'x unified',
        showlegend: true,
        margin: {t: 100, l: 50, r: 50, b: 50},
        height: 520
    };

    const chart = {data: traces, layout};
    globalThis.chart = chart;
    return chart;
}

function getZoneColor(avgPower, FTP) {
    if (!FTP || FTP <= 0) return 'grey';
    const pct = (avgPower / FTP) * 100;
    for (const z of CONFIG_surges.ZONES) {
        if (pct < z.max) return z.color;
    }
    return '#000';
}
})();
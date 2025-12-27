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
    // Configuration
    const WINDOW_SECONDS_3mmap = 180; // 3 minuti
    const FTP_3mmap = icu.activity.icu_ftp;

    function getStreamData_5schart(streamName) {
        const stream = icu.streams.get(streamName);
        return stream && stream.data ? stream.data.map(value => value ?? 0) : Array(icu.streams.get("time").data.length).fill(0);
    }

    const altitude_3mmap = getStreamData_3mmap("fixed_altitude");
    const distance_3mmap = getStreamData_3mmap("distance");
    const distanceKm_3mmap = distance_3mmap.map(d => d / 1000);
    const power_3mmap = getStreamData_3mmap("fixed_watts");
    const heartrate_3mmap = getStreamData_3mmap("fixed_heartrate");
    const grade_3mmap = getStreamData_3mmap("grade_smooth");
    const time_3mmap = getStreamData_3mmap("time");
    const weight_3mmap = icu.activity.icu_weight;

    // Fix initial altitude values
    const firstNonZeroAltitude_3mmap = altitude_3mmap.find(value => value !== 0);
    if (firstNonZeroAltitude_3mmap !== undefined) {
        for (let i = 0; i < altitude_3mmap.length; i++) {
            if (altitude_3mmap[i] === 0) {
                altitude_3mmap[i] = firstNonZeroAltitude_3mmap;
            } else {
                break;
            }
        }
    }

    let traces_3mmap = [
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
    let annotations_3mmap = [];
    // Find all non-overlapping 5s efforts above 200% FTP
    function getAllNonOverlappingEffortsAboveThreshold_5schart(data, n, threshold, samplingRate = 1) {
    function getAllNonOverlappingEffortsAboveThreshold_3mmap(data, n, threshold, samplingRate = 1) {
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

    const threshold_3mmap = 1.0 * FTP_3mmap;
    const allEfforts_3mmap = getAllNonOverlappingEffortsAboveThreshold_3mmap(power_3mmap, WINDOW_SECONDS_3mmap, threshold_3mmap, 1);
    // Sort allEfforts_3mmap by avgPower descending for legend order
    const sortedEfforts_3mmap = allEfforts_3mmap.slice().sort((a, b) => b.avg - a.avg);
    sortedEfforts_3mmap.forEach((best, idx) => {
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

        // --- Metrics block ---
        const minHR = Math.min(...sectionHR);
        const maxHR = Math.max(...sectionHR);
        const elevationGain = sectionAltitude[sectionAltitude.length - 1] - sectionAltitude[0];
        const dist = sectionDistance[sectionDistance.length - 1] - sectionDistance[0];
        // ...le variabili sono già dichiarate sopra, rimuovo duplicati...
        // Calcolo watt massimi/minimi 5"
        let maxWatt5s = '', minWatt5s = '';
        if (sectionPower.length >= 5) {
            let maxW = -Infinity;
            let minW = Infinity;
            for (let i = 0; i <= sectionPower.length - 5; i++) {
                const avg5 = sectionPower.slice(i, i + 5).reduce((a,b)=>a+b,0)/5;
                if (avg5 > maxW) maxW = avg5;
                if (avg5 < minW) minW = avg5;
            }
            maxWatt5s = Math.round(maxW);
            minWatt5s = Math.round(minW);
        }
        // Calcolo battiti medi
        const avgHR = sectionHR.length > 0 ? sectionHR.reduce((a,b)=>a+b,0)/sectionHR.length : 0;
        // Calcolo avg speed e VAM
        const avgSpeed = dist / (climbTimeInSeconds / 3600) / 1000;
        const vam = elevationGain / (climbTimeInSeconds / 3600);
        // --- kJ and kJ/h/kg up to effort start ---
        const bgColor = getZoneColor(avgPower, FTP_3mmap);
        let joules = 0, joulesOverCP = 0;
        if (power_3mmap && time_3mmap && bestStart !== undefined && bestStart < power_3mmap.length && FTP_3mmap) {
            for (let i = 0; i < bestStart; i++) {
                let w = power_3mmap[i];
                let secs = time_3mmap[i] - (i > 0 ? time_3mmap[i - 1] : 0);
                if (secs < 30) {
                    joules += w * secs;
                    if (w >= FTP_3mmap) joulesOverCP += w * secs;
                }
            }
        }
        const hours = (time_3mmap && bestStart !== undefined && time_3mmap[bestStart]) ? (time_3mmap[bestStart] / 3600) : 0;
        let kJ_h_kg = (weight_3mmap && hours > 0) ? (joules/1000) / hours / weight_3mmap : 0;
        let kJ_h_kg_overCP = (weight_3mmap && hours > 0) ? (joulesOverCP/1000) / hours / weight_3mmap : 0;
        function formatSecondsToHHMMSS(seconds) {
            const sec = Math.floor(seconds % 60);
            const min = Math.floor((seconds / 60) % 60);
            const hr = Math.floor(seconds / 3600);
            return `${hr.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
        }

        const traceText = [
            `#${idx + 1}`,
            `⚡ ${avgPower.toFixed(0)} W  ⚖️ ${avgPowerPerKg.toFixed(2)} W/kg`,
            `⚡ 🔺${maxWatt5s !== '' ? maxWatt5s : ''} W |🔻${minWatt5s !== '' ? minWatt5s : ''} W`,
            `❤️ ∅${avgHR.toFixed(0)} bpm |🔺${maxHR} bpm`,
            `🚴‍♂️ ${avgSpeed.toFixed(1)} km/h | 🚵‍♂️ ${vam.toFixed(0)} m/h`,
            `📏 ∅ ${avgGrade.toFixed(1)}% max. ${maxGrade.toFixed(1)}%`,
            startTime ? `🕒 ${formatSecondsToHHMMSS(Number(startTime))}` : '',
            `🔋 ${Math.round(joules/1000)} kJ | ${Math.round(joulesOverCP/1000)} kJ > CP`,
            `🔥 ${kJ_h_kg.toFixed(1)} kJ/h/kg | ${kJ_h_kg_overCP.toFixed(1)} kJ/h/kg > CP`
        ].filter(Boolean).join('<br>');
            });


    const layout_3mmap = {
        title: `All 3m Power Efforts >100% FTP`,
        xaxis: { title: 'Distance (km)' },
        yaxis: { title: 'Altitude (m)' },
        annotations: annotations_3mmap,
        hovermode: 'x unified',
        showlegend: true,
        margin: { t: 100, l: 50, r: 50, b: 50 },
        height: 500
    };

    const chart_3mmap = { data: traces_3mmap, layout: layout_3mmap };
    chart_3mmap;
    };

    const chart_3mmap = { data: traces_3mmap, layout: layout_3mmap };
}

function getZoneColor(avgPower, FTP) {
    if (!FTP || FTP <= 0) return 'grey';
    const percentage = (avgPower / FTP) * 100;

    if (percentage < 76) return "4c72b0";        // Z2
    if (percentage < 91) return "55a868";         // Z3
    if (percentage < 106) return "dd8452";        // Z4 (ex gold, ora come Z3)
    if (percentage < 126) return "c44e52";           // Z5
    if (percentage < 151) return "a64d79";        // Z6
    return "8172b3";                                // Z7+;
}

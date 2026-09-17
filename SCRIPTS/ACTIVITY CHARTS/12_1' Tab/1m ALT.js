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

{
    // Configuration
    const WINDOW_SECONDS = 60; // 1 minute
    const TOP_N = 10;
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
    // Find all non-overlapping 60s efforts above 120% FTP
    function getAllNonOverlappingEffortsAboveThreshold_1min(data, n, threshold, samplingRate = 1) {
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

    const threshold_1min = 1.2 * FTP;
    const allEfforts_1min = getAllNonOverlappingEffortsAboveThreshold_1min(power, WINDOW_SECONDS, threshold_1min, 1);
    let idx = 0;
    let annotations = [];
    // Sort efforts in descending order of avgPower for legend (highest first)
    allEfforts_1min.sort((a, b) => b.avg - a.avg);
    allEfforts_1min.forEach((best) => {
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

        const avgHR = sectionHR.reduce((a, b) => a + b, 0) / sectionHR.length;
        const maxHR = Math.max(...sectionHR);
        const elevationGain = sectionAltitude[sectionAltitude.length - 1] - sectionAltitude[0];
        const dist = sectionDistance[sectionDistance.length - 1] - sectionDistance[0];
        const avgGrade = elevationGain / dist * 100;
        const avgPowerPerKg = best.avg / weight;
        const maxGrade = Math.max(...sectionGrade);
        const climbTimeInSeconds = sectionTime[sectionTime.length - 1] - sectionTime[0] + 1;
        const ascentSpeed = elevationGain / (climbTimeInSeconds / 3600);
        const avgHorizontalSpeed = (dist / 1000) / (climbTimeInSeconds / 3600);
        const bgColor = getZoneColor(avgPower, FTP);
        // 5s best power in this window
        const best5s = getBestAverageOverNSeconds(sectionPower, 5, 1);
        const best5sWatts = best5s.bestAvg;
        const best5sPerKg = best5sWatts / weight;
        // Theoretical values (as in your climb code)
        const gradientFactor = (2 + avgGrade / 10) * 100;
        const TEORICWKG = ascentSpeed / gradientFactor;
        const TEORICVAM = avgPowerPerKg * gradientFactor;

        // Calculate 3x20s avg watts for the 1' effort
        let avg20s1 = 0, avg20s2 = 0, avg20s3 = 0;
        if (sectionPower.length >= 60) {
            avg20s1 = sectionPower.slice(0, 20).reduce((a, b) => a + b, 0) / 20;
            avg20s2 = sectionPower.slice(20, 40).reduce((a, b) => a + b, 0) / 20;
            avg20s3 = sectionPower.slice(40, 60).reduce((a, b) => a + b, 0) / 20;
        }
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
            text: [
                `#${idx + 1}`,
                `📏 ${(dist / 1000).toFixed(2)} km (${elevationGain.toFixed(0)} m)`,
                `📈 ∅ ${avgGrade.toFixed(1)}% | max. ${maxGrade.toFixed(1)}%`,
                `⚡ ${avgPower.toFixed(0)} W | 5″ ${best5sWatts.toFixed(0)} W`,
                `🔀 ${avg20s1.toFixed(0)} | ${avg20s2.toFixed(0)} | ${avg20s3.toFixed(0)}`,
                `⚖️ ${avgPowerPerKg.toFixed(2)} W/kg | 5″ ${best5sPerKg.toFixed(2)} W/kg`,
                `❤️ ∅ ${avgHR.toFixed(0)} bpm | max. ${maxHR} bpm` ,
                `🚴‍♂️ ${avgHorizontalSpeed.toFixed(1)} km/h | 🚵‍♂️ ${ascentSpeed.toFixed(0)} m/h`
            ].join('<br>')
        });

        // Offset annotation positions to avoid overlap
        annotations.push({
            // Add a small horizontal offset and lower the annotation closer to the profile
            x: (sectionDistanceKm[0] + sectionDistanceKm[sectionDistanceKm.length - 1]) / 2 + (idx % 2 === 0 ? -1 : 1) * idx * 0.003, // alternate left/right, small step
            y: Math.max(...sectionAltitude) + 50+ idx * 25, // lowered from 130 to 60
            text: `#${idx + 1}<br>⚡ ${avgPower.toFixed(0)}`,
            showarrow: false,
            font: { family: 'Arial', size: 12, color: 'white' },
            align: 'center',
            bgcolor: bgColor,
            opacity: 0.9
        });
        idx++;
        // No limit: show all non-overlapping efforts above 120% FTP
    });


    const layout = {
        title: `1' Power Efforts >120% FTP` ,
        xaxis: { title: 'Distance (km)' },
        yaxis: { title: 'Altitude (m)' },
        annotations: annotations,
        hovermode: 'x unified',
        showlegend: true,
        margin: { t: 100, l: 50, r: 50, b: 50 },
        height: 500
    };

    const chart = { data: traces, layout };
    chart;
}
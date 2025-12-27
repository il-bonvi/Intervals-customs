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
    const WINDOW_SECONDS_30schart = 30; // 30 seconds
    const TOP_N_30schart = 25;
    const FTP_30schart = icu.activity.icu_ftp;

    function getStreamData_30schart(streamName) {
        const stream = icu.streams.get(streamName);
        return stream && stream.data ? stream.data.map(value => value ?? 0) : Array(icu.streams.get("time").data.length).fill(0);
    }

    const altitude_30schart = getStreamData_30schart("fixed_altitude");
    const distance_30schart = getStreamData_30schart("distance");
    const distanceKm_30schart = distance_30schart.map(d => d / 1000);
    const power_30schart = getStreamData_30schart("fixed_watts");
    const heartrate_30schart = getStreamData_30schart("fixed_heartrate");
    const grade_30schart = getStreamData_30schart("grade_smooth");
    const time_30schart = getStreamData_30schart("time");
    const weight_30schart = icu.activity.icu_weight;

    // Fix initial altitude values
    const firstNonZeroAltitude_30schart = altitude_30schart.find(value => value !== 0);
    if (firstNonZeroAltitude_30schart !== undefined) {
        for (let i = 0; i < altitude_30schart.length; i++) {
            if (altitude_30schart[i] === 0) {
                altitude_30schart[i] = firstNonZeroAltitude_30schart;
            } else {
                break;
            }
        }
    }

    let traces_30schart = [
        {
            x: distanceKm_30schart,
            y: altitude_30schart,
            text: altitude_30schart.map(alt => `${alt.toFixed(1)} m`),
            hoverinfo: 'text',
            fill: 'tozeroy',
            type: 'scatter',
            fillcolor: 'whitesmoke',
            mode: 'none',
            name: 'Elevation'
        }
    ];
    let annotations_30schart = [];
    const bests_30schart = getTopNBestAveragesOverNSeconds(power_30schart, WINDOW_SECONDS_30schart, TOP_N_30schart, 1);
    bests_30schart.forEach((best, idx) => {

        const avgPower = best.avg;
        // Filter: only show efforts >= 105% FTP
        if (avgPower < 1.05 * FTP_30schart) {
            return;
        }

        const bestStart = best.start;
        const bestEnd = bestStart + WINDOW_SECONDS_30schart;
        const sectionPower = power_30schart.slice(bestStart, bestEnd);
        const sectionHR = heartrate_30schart.slice(bestStart, bestEnd);
        const sectionAltitude = altitude_30schart.slice(bestStart, bestEnd);
        const sectionDistance = distance_30schart.slice(bestStart, bestEnd);
        const sectionDistanceKm = distanceKm_30schart.slice(bestStart, bestEnd);
        const sectionGrade = grade_30schart.slice(bestStart, bestEnd);
        const sectionTime = time_30schart.slice(bestStart, bestEnd);

        const avgHR = sectionHR.reduce((a, b) => a + b, 0) / sectionHR.length;
        const maxHR = Math.max(...sectionHR);
        const elevationGain = sectionAltitude[sectionAltitude.length - 1] - sectionAltitude[0];
        const dist = sectionDistance[sectionDistance.length - 1] - sectionDistance[0];
        const avgGrade = elevationGain / dist * 100;
        const avgPowerPerKg = avgPower / weight_30schart;
        const maxGrade = Math.max(...sectionGrade);
        const climbTimeInSeconds = sectionTime[sectionTime.length - 1] - sectionTime[0] + 1;
        const ascentSpeed = elevationGain / (climbTimeInSeconds / 3600);
        const avgHorizontalSpeed = (dist / 1000) / (climbTimeInSeconds / 3600);
        const bgColor = getZoneColor(avgPower, FTP_30schart);
        // 5s best power in this window
        const best5s = getBestAverageOverNSeconds(sectionPower, 5, 1);
        const best5sWatts = best5s.bestAvg;
        const best5sPerKg = best5sWatts / weight_30schart;
        // Theoretical values (as in your climb code)
        const gradientFactor = (2 + avgGrade / 10) * 100;
        const TEORICWKG = ascentSpeed / gradientFactor;
        const TEORICVAM = avgPowerPerKg * gradientFactor;

        // Calculate 3x10s avg watts for the 30" effort
        let avg10s1 = 0, avg10s2 = 0, avg10s3 = 0;
        if (sectionPower.length >= 30) {
            avg10s1 = sectionPower.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
            avg10s2 = sectionPower.slice(10, 20).reduce((a, b) => a + b, 0) / 10;
            avg10s3 = sectionPower.slice(20, 30).reduce((a, b) => a + b, 0) / 10;
        }
        traces_30schart.push({
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
                `🔀 ${avg10s1.toFixed(0)} | ${avg10s2.toFixed(0)} | ${avg10s3.toFixed(0)}`,
                `⚖️ ${avgPowerPerKg.toFixed(2)} W/kg | 5″ ${best5sPerKg.toFixed(2)} W/kg`,
                `❤️ ∅ ${avgHR.toFixed(0)} bpm | max. ${maxHR} bpm`,
                `🚴‍♂️ ${avgHorizontalSpeed.toFixed(1)} km/h | 🚵‍♂️ ${ascentSpeed.toFixed(0)} m/h`
            ].join('<br>')
        });

        // Offset annotation positions to avoid overlap
        annotations_30schart.push({
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
    });

    const layout_30schart = {
        title: `Top 25 Best 30" Power Efforts` ,
        xaxis: { title: 'Distance (km)' },
        yaxis: { title: 'Altitude (m)' },
        annotations: annotations_30schart,
        hovermode: 'x unified',
        showlegend: true,
        margin: { t: 100, l: 50, r: 50, b: 50 },
        height: 500
    };

    const chart_30schart = { data: traces_30schart, layout: layout_30schart };
    chart_30schart;
}

function getZoneColor(avgPower, FTP) {
    if (!FTP || FTP <= 0) return 'grey';
    const percentage = (avgPower / FTP) * 100;

    if (percentage < 141) return "4c72b0";        // Z2
    if (percentage < 161) return "55a868";         // Z3
    if (percentage < 201) return "dd8452";        // Z4 (ex gold, ora come Z3)
    if (percentage < 251) return "c44e52";           // Z5
    if (percentage < 301) return "a64d79";        // Z6
    return "8172b3";                                // Z7+;
}
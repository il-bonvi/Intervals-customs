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
    // Durations to analyze (in seconds)
    const DURATIONS = [180, 300, 600]; // 3', 5', 10'
    const TOP_N = 2;
    const FTP = icu.activity.icu_ftp 
    const COLORS = ['#1f77b4', '#ff7f0e', '#2ca02c']; // blue, orange, green

    // Function to retrieve stream data
    function getStreamData(streamName) {
        const stream = icu.streams.get(streamName);
        return stream && stream.data ? stream.data.map(value => value ?? 0) : Array(icu.streams.get("time").data.length).fill(0);
    }

    // Retrieve data streams
    const altitude = getStreamData("fixed_altitude");
    const distance = getStreamData("distance"); // meters
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

    // Chart traces
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
    // Remove overlap check, show all annotations
    DURATIONS.forEach((WINDOW_SECONDS, dIdx) => {
        const bests = getTopNBestAveragesOverNSeconds(power, WINDOW_SECONDS, TOP_N, 1);
        bests.forEach((best, idx) => {
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
            const formattedTime = `${Math.floor(climbTimeInSeconds / 60)}m${climbTimeInSeconds % 60}s`;
            const ascentSpeed = elevationGain / (climbTimeInSeconds / 3600);
            const avgHorizontalSpeed = (dist / 1000) / (climbTimeInSeconds / 3600);
            const avgPower = best.avg;
            // 5s best power in this window
            const best5s = getBestAverageOverNSeconds(sectionPower, 5, 1);
            const best5sWatts = best5s.bestAvg;
            const best5sPerKg = best5sWatts / weight;
            // Theoretical values (as in your climb code)
            const gradientFactor = (2 + avgGrade / 10) * 100;
            const TEORICWKG = ascentSpeed / gradientFactor;
            const TEORICVAM = avgPowerPerKg * gradientFactor;
            // VAM arrow logic as in PIAN HC
            const vamDiff = ascentSpeed - TEORICVAM;
            let vamArrow = '';
            if (vamDiff > 10) {
                vamArrow = ` 🔺+${vamDiff.toFixed(0)} m/h`;
            } else if (vamDiff < -10) {
                vamArrow = ` 🔻${vamDiff.toFixed(0)} m/h`;
            } else {
                vamArrow = ` ↔️ ${vamDiff.toFixed(0)} m/h`;
            }
            // Difficulty coefficient (for annotation, not used for filtering)
            const difficultyCoefficient = Math.pow(avgGrade, 2) * (dist / 1000);

            // Calculate first and second half average power and their ratio
            const half = Math.floor(sectionPower.length / 2);
            const rat_1 = sectionPower.slice(0, half).reduce((a, b) => a + b, 0) / half;
            const rat_2 = sectionPower.slice(half).reduce((a, b) => a + b, 0) / (sectionPower.length - half);
            const ratio = rat_2 / rat_1;

            // Set line width: 3' = 3, 5' = 2, 10' = 1
            const lineWidths = [3, 2, 1];
            traces.push({
                x: sectionDistanceKm,
                y: sectionAltitude,
                type: 'scatter',
                mode: 'lines',
                line: { color: COLORS[dIdx % COLORS.length], width: lineWidths[dIdx], opacity: 0.5 },
                opacity: 0.5,
                name: `${WINDOW_SECONDS/60}' Effort #${idx + 1}`,
                hoverinfo: 'text',
                visible: true,
                hoverlabel: { align: 'left' },
                text: [
                    `${WINDOW_SECONDS/60}' Effort #${idx + 1}`,
                    `📏 ${(dist / 1000).toFixed(2)} km | 🔼 ${elevationGain.toFixed(0)}m`,
                    `📈 ∅ ${avgGrade.toFixed(1)}% | max. ${maxGrade.toFixed(1)}%`,
                    `⚡ ${avgPower.toFixed(0)} W | 5″ ${best5sWatts.toFixed(0)} W`,
                    `⚖️ ${avgPowerPerKg.toFixed(2)} W/kg | 5″ ${best5sPerKg.toFixed(2)} W/kg`,
                    `🔀 ${rat_1.toFixed(0)} W | ${rat_2.toFixed(0)} W | ${(ratio).toFixed(2)}`,
                    `❤️ ∅ ${avgHR.toFixed(0)} bpm | max. ${maxHR} bpm`,
                    `⏱️ ${formattedTime} | 🚴‍♂️ ${avgHorizontalSpeed.toFixed(1)} km/h`,
                    `🚵‍♂️ ${ascentSpeed.toFixed(0)} m/h${vamArrow}`,
                    `🧮 ${TEORICWKG.toFixed(2)} W/kg | ${TEORICVAM.toFixed(0)} VAM`
                ].join('<br>')
            });
            // Alternate annotation arrow direction
            let ax = 0, ay = 0;
            switch ((dIdx * TOP_N + idx) % 4) {
                case 0: ax = -15; ay = -50; break; // up-left
                case 1: ax = 15; ay = -50; break;  // up-right
                case 2: ax = -15; ay = 50; break;  // down-left
                case 3: ax = 15; ay = 50; break;   // down-right
            }
            annotations.push({
                x: (sectionDistanceKm[0] + sectionDistanceKm[sectionDistanceKm.length - 1]) / 2,
                y: Math.max(...sectionAltitude) -40,
                text: `${WINDOW_SECONDS / 60}' #${idx + 1}<br>⚡ ${avgPower.toFixed(0)} <br>❤ ${avgHR.toFixed(0)}`,
                showarrow: true,
                ax: ax,
                ay: ay,
                arrowhead: 5,
                arrowsize: 0.7,
                arrowwidth: 2,
                arrowcolor: COLORS[dIdx % COLORS.length],
                font: { family: 'Arial', size: 12, color: 'white' },
                align: 'center',
                bgcolor: COLORS[dIdx % COLORS.length],
                opacity: 0.9
            });
        });
    });

    // Layout
    const layout = {
        title: `Top ${TOP_N} Best Power Efforts (3', 5', 10')` ,
        xaxis: { title: 'Distance (km)' },
        yaxis: { title: 'Altitude (m)' },
        annotations: annotations,
        hovermode: 'x unified',
        showlegend: true, // Show the legend on the right
        margin: { t: 100, l: 50, r: 50, b: 50 },
        height: 600
    };

    // Chart
    const chart = { data: traces, layout };
    chart;
}
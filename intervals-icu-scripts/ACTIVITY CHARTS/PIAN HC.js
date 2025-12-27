function getBestAverageOverNSeconds(data, n, samplingRate = 1) {
    const windowSize = n * samplingRate;
    let bestAvg = 0;
    for (let i = 0; i <= data.length - windowSize; i++) {
        const window = data.slice(i, i + windowSize);
        const avg = window.reduce((a, b) => a + b, 0) / window.length;
        if (avg > bestAvg) bestAvg = avg;
    }
    return bestAvg;
}
{

    const SECTION_LENGTH = 25;
    const MIN_SEGMENTS = 40;
    const MIN_GRADE = 5;
    const MAX_GRADE_END = 2;
    const MAX_GAP_SEGMENTS = 20;
    const MIN_DIFFICULTY = 25;
    const MAX_FLAT_SEGMENTS_IN_CLIMB = 6; // Numero massimo di segmenti consecutivi "troppo piatti" accettabili all'interno di una salita

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

    let sections = [];
    let currentStartIndex = 0;

    for (let i = 1; i < distance.length; i++) {
        const distDiff = distance[i] - distance[currentStartIndex];
        if (distDiff >= SECTION_LENGTH || i === distance.length - 1) {
            const altDiff = altitude[i] - altitude[currentStartIndex];
            const sectionGrade = (altDiff / distDiff) * 100;

            sections.push({
                sectionIndex: sections.length,
                startIndex: currentStartIndex,
                endIndex: i,
                distance: distDiff,
                elevation: altDiff,
                grade: sectionGrade
            });

            currentStartIndex = i;
        }
    }

    let climbs = [];
    let currentClimb = { startSegment: null, endSegment: null };
    let flatSegmentCount = 0;

    sections.forEach((section, index) => {
        if (currentClimb.startSegment === null && section.grade >= MIN_GRADE) {
            currentClimb.startSegment = section.sectionIndex;
            flatSegmentCount = 0;
        } else if (currentClimb.startSegment !== null) {
            if (section.grade >= MIN_GRADE) {
                flatSegmentCount = 0;
            } else if (section.grade < MAX_GRADE_END) {
                flatSegmentCount++;
                if (flatSegmentCount > MAX_FLAT_SEGMENTS_IN_CLIMB || index === sections.length - 1) {
                    currentClimb.endSegment = section.sectionIndex - flatSegmentCount;

                    if (currentClimb.endSegment - currentClimb.startSegment >= MIN_SEGMENTS) {
                        climbs.push({ ...currentClimb });
                    }

                    currentClimb = { startSegment: null, endSegment: null };
                    flatSegmentCount = 0;
                }
            }
        }
    });

    for (let i = 1; i < climbs.length; i++) {
        const prevClimb = climbs[i - 1];
        const currentClimb = climbs[i];
        const gapSegments = currentClimb.startSegment - prevClimb.endSegment;

        if (gapSegments <= MAX_GAP_SEGMENTS) {
            prevClimb.endSegment = currentClimb.endSegment;
            climbs.splice(i, 1);
            i--;
        }
    }

    let annotations = [];
    let traces = [];
    let climbNo = 0;

    climbs.forEach(climb => {
        const startIndex = sections[climb.startSegment].startIndex;
        const endIndex = sections[climb.endSegment].endIndex;
        const climbSections = sections.slice(climb.startSegment, climb.endSegment + 1);

        const dist = climbSections.reduce((sum, section) => sum + section.distance, 0);
        const elevationGain = climbSections.reduce((sum, section) => sum + section.elevation, 0);
        const avgGrade = elevationGain / dist * 100;
        const difficultyCoefficient = Math.pow(avgGrade, 2) * (dist / 1000);

        if (difficultyCoefficient < MIN_DIFFICULTY) return;

        climbNo++;

        const sectionPower = power.slice(startIndex, endIndex);
        const sectionHRs = heartrate.slice(startIndex, endIndex);
        const avgPower = sectionPower.reduce((a, b) => a + b, 0) / sectionPower.length;
        const hasHR = sectionHRs.some(hr => hr > 0);
        const avgHR = hasHR ? sectionHRs.reduce((a, b) => a + b, 0) / sectionHRs.length : null;
        const best5sWatts = getBestAverageOverNSeconds(sectionPower, 5);
        const maxHR = hasHR ? Math.max(...sectionHRs) : null;
        const climbTimeInSeconds = time[endIndex] - time[startIndex];
        const formattedTime = `${Math.floor(climbTimeInSeconds / 60)}m${climbTimeInSeconds % 60}s`;
        const ascentSpeed = elevationGain / (climbTimeInSeconds / 3600);
        const avgHorizontalSpeed = (dist / 1000) / (climbTimeInSeconds / 3600);
        const maxGrade = Math.max(...grade.slice(startIndex, endIndex));
        const weight = icu.activity.icu_weight;
        const FTP = icu.activity.icu_ftp;
        const avgPowerPerKg = avgPower / weight;
        const best5sPerKg = best5sWatts / weight;
        const gradientFactor = (2 + avgGrade / 10) * 100;
        const TEORICWKG = ascentSpeed / gradientFactor;
        const TEORICVAM = avgPowerPerKg * gradientFactor;
        const vamDiff = ascentSpeed - TEORICVAM;
                // Calculate first and second half average power and their ratio
        const half = Math.floor(sectionPower.length / 2);
        const rat_1 = sectionPower.slice(0, half).reduce((a, b) => a + b, 0) / half;
        const rat_2 = sectionPower.slice(half).reduce((a, b) => a + b, 0) / (sectionPower.length - half);
        const ratio = rat_2 / rat_1;


        
                let vamArrow = '';
if (vamDiff > 10) {
  vamArrow = ` 🔺+${vamDiff.toFixed(0)} m/h`;
} else if (vamDiff < -10) {
  vamArrow = ` 🔻${vamDiff.toFixed(0)} m/h`;
} else {
  vamArrow = ` ↔️ ${vamDiff.toFixed(0)} m/h`;
}


        let bgColor = "grey";
        if (difficultyCoefficient >= 25 && difficultyCoefficient < 75) bgColor = "yellowgreen";
        else if (difficultyCoefficient >= 75 && difficultyCoefficient < 150) bgColor = "orange";
        else if (difficultyCoefficient >= 150 && difficultyCoefficient < 300) bgColor = "darkorange";
        else if (difficultyCoefficient >= 300 && difficultyCoefficient < 600) bgColor = "orangered";
        else if (difficultyCoefficient >= 600 && difficultyCoefficient < 900) bgColor = "firebrick";
        else if (difficultyCoefficient >= 900 && difficultyCoefficient < 1200) bgColor = "maroon";
        else if (difficultyCoefficient >= 1200) bgColor = "black";

        let hrText = hasHR ? `❤️ ∅ ${avgHR.toFixed(0)} bpm | max. ${maxHR} bpm<br>` : '';
        traces.push({
            x: distanceKm.slice(startIndex, endIndex),
            y: altitude.slice(startIndex, endIndex),
            type: 'scatter',
            mode: 'lines',
            line: { color: bgColor, width: 2 },
            name: `Anstieg ${climbNo}`,
            hoverinfo: 'text',
            text: `Climb ${climbNo}<br>
📏 ${(dist / 1000).toFixed(2)} km (${elevationGain.toFixed(0)} hm)<br>
📈 ∅ ${avgGrade.toFixed(1)}% | max. ${maxGrade.toFixed(1)}%<br>
⚡ ${avgPower.toFixed(0)} W | 5″ ${best5sWatts.toFixed(0)} W<br>
⚖️ ${avgPowerPerKg.toFixed(2)} W/kg | 5″ ${best5sPerKg.toFixed(2)} W/kg<br> 
🔀 ${rat_1.toFixed(0)} W | ${rat_2.toFixed(0)} W | ${(ratio).toFixed(2)}<br>
${hrText}
🚴‍♂️ ${avgHorizontalSpeed.toFixed(1)} km/h<br> 
⏱️ ${formattedTime}<br>
🚵‍♂️ ${ascentSpeed.toFixed(0)} m/h<br>
🧮 ${TEORICWKG.toFixed(2)} W/kg | ${TEORICVAM.toFixed(0)} VAM`
        });

        let hrAnn = hasHR ? `❤ ${avgHR.toFixed(0)} <br>` : '';
        annotations.push({
            x: (distanceKm[startIndex] + distanceKm[endIndex]) / 2,
            y: Math.max(...altitude) + 130,
            text: `QDH ${difficultyCoefficient.toFixed(0)}<br>⚡ ${avgPower.toFixed(0)} <br>${hrAnn}⏱️ ${Math.floor(climbTimeInSeconds / 60)}m${climbTimeInSeconds % 60}s`,
            showarrow: false,
            font: {
                family: 'Arial',
                size: 12,
                color: 'white'
            },
            align: 'center',
            bgcolor: bgColor,
            bordercolor: difficultyCoefficient > 900 ? 'red' : null,
            borderwidth: difficultyCoefficient > 900 ? 2 : 0,
            opacity: 0.9
        });
    });

    traces.unshift({
        x: distanceKm,
        y: altitude,
        text: altitude.map(alt => `${alt.toFixed(1)} m`),
        hoverinfo: 'text',
        fill: 'tozeroy',
        type: 'scatter',
        fillcolor: 'whitesmoke',
        mode: 'none',
        name: 'Höhe'
    });

    const layout = {
        title: 'Elevation profile',
        xaxis: { title: 'Distance (km)' },
        yaxis: { title: 'Altitude (m)' },
        annotations: annotations,
        hovermode: 'x unified',
        showlegend: false,
        margin: {
            t: 100,
            l: 50,
            r: 50,
            b: 50
        }
    };

    const chart = { data: traces, layout };
    chart;
}
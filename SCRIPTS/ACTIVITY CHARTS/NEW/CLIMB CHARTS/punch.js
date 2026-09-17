// =====================
// CONFIGURAZIONE INIZIALE
// Modifica qui per cambiare facilmente i parametri principali
const CONFIG = {
    SECTION_LENGTH: 25, // lunghezza sezione in metri
    MIN_SEGMENTS: 2,    // numero minimo di segmenti per una salita valida
    MIN_GRADE: 4,       // pendenza minima per considerare salita (%)
    MAX_GRADE_END: 4,   // pendenza massima per considerare la fine salita (%)
    MAX_GAP_SEGMENTS: 2, // massimo gap tra due salite per unirle
    MIN_DIFFICULTY: 1,   // coefficiente minimo di difficoltà per mostrare salita
    MAX_FLAT_SEGMENTS_IN_CLIMB: 1, // max segmenti consecutivi "troppo piatti" accettabili
    // Colori per zona potenza media salita
    COLORS: [
        { min: 151, color: "#DC143C" },
        { min: 121, color: "#FF4500" },
        { min: 106, color: "#FFA500" },
        { min: 91, color: "#FFD700" },
        { min: 76, color: "#32CD32" },
        { min: 55, color: "#90EE90" },
        { min: 0, color: "#87CEFA" }
    ]
};
// =====================

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
        if (distDiff >= CONFIG.SECTION_LENGTH || i === distance.length - 1) {
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
        if (currentClimb.startSegment === null && section.grade >= CONFIG.MIN_GRADE) {
            currentClimb.startSegment = section.sectionIndex;
            flatSegmentCount = 0;
        } else if (currentClimb.startSegment !== null) {
            if (section.grade >= CONFIG.MIN_GRADE) {
                flatSegmentCount = 0;
            } else if (section.grade < CONFIG.MAX_GRADE_END) {
                flatSegmentCount++;
                if (flatSegmentCount > CONFIG.MAX_FLAT_SEGMENTS_IN_CLIMB || index === sections.length - 1) {
                    currentClimb.endSegment = section.sectionIndex - flatSegmentCount;
                    if (currentClimb.endSegment - currentClimb.startSegment >= CONFIG.MIN_SEGMENTS) {
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
        if (gapSegments <= CONFIG.MAX_GAP_SEGMENTS) {
            prevClimb.endSegment = currentClimb.endSegment;
            climbs.splice(i, 1);
            i--;
        }
    }

    let annotations = [];
    let traces = [];
    let climbNo = 0;


    // Funzione per colorazione zona potenza secondo la CONFIG
    function getZoneColor(avgPower, ftp) {
        const percentage = (avgPower / ftp) * 100;
        for (let i = 0; i < CONFIG.COLORS.length; i++) {
            if (percentage >= CONFIG.COLORS[i].min) {
                return CONFIG.COLORS[i].color;
            }
        }
        return CONFIG.COLORS[CONFIG.COLORS.length - 1].color;
    }

    climbs.forEach(climb => {
        const startIndex = sections[climb.startSegment].startIndex;
        const endIndex = sections[climb.endSegment].endIndex;
        const climbSections = sections.slice(climb.startSegment, climb.endSegment + 1);

        const dist = climbSections.reduce((sum, section) => sum + section.distance, 0);
        const elevationGain = climbSections.reduce((sum, section) => sum + section.elevation, 0);
        const avgGrade = elevationGain / dist * 100;
        const difficultyCoefficient = Math.pow(avgGrade, 2) * (dist / 1000);
        if (difficultyCoefficient < CONFIG.MIN_DIFFICULTY) return;
        climbNo++;
        const sectionPower = power.slice(startIndex, endIndex);
        const sectionHRs = heartrate.slice(startIndex, endIndex);
        // Calcoli robusti su array vuoti
        const avgPower = sectionPower.length > 0 ? sectionPower.reduce((a, b) => a + b, 0) / sectionPower.length : 0;
        const avgHR = sectionHRs.length > 0 ? sectionHRs.reduce((a, b) => a + b, 0) / sectionHRs.length : 0;
        const best5sWatts = sectionPower.length > 0 ? getBestAverageOverNSeconds(sectionPower, 5) : 0;
        const maxHR = sectionHRs.length > 0 ? Math.max(...sectionHRs) : 0;
        const climbTimeInSeconds = time[endIndex] - time[startIndex];
        const formattedTime = `${Math.floor(climbTimeInSeconds / 60)}m${climbTimeInSeconds % 60}s`;
        const ascentSpeed = climbTimeInSeconds > 0 ? elevationGain / (climbTimeInSeconds / 3600) : 0;
        const avgHorizontalSpeed = climbTimeInSeconds > 0 ? (dist / 1000) / (climbTimeInSeconds / 3600) : 0;
        const maxGrade = grade.length > 0 ? Math.max(...grade.slice(startIndex, endIndex)) : 0;
        const weight = icu.activity.icu_weight || 1;
        const FTP = icu.activity.icu_ftp || 1;
        const avgPowerPerKg = avgPower / weight;
        const best5sPerKg = best5sWatts / weight;
        const gradientFactor = (2 + avgGrade / 10) * 100;
        const TEORICWKG = gradientFactor !== 0 ? ascentSpeed / gradientFactor : 0;
        const TEORICVAM = avgPowerPerKg * gradientFactor;
        const vamDiff = ascentSpeed - TEORICVAM;
        // Calculate first and second half average power and their ratio
        let rat_1 = 0, rat_2 = 0, ratio = 0;
        if (sectionPower.length > 1) {
            const half = Math.floor(sectionPower.length / 2);
            rat_1 = half > 0 ? sectionPower.slice(0, half).reduce((a, b) => a + b, 0) / half : 0;
            rat_2 = (sectionPower.length - half) > 0 ? sectionPower.slice(half).reduce((a, b) => a + b, 0) / (sectionPower.length - half) : 0;
            ratio = rat_1 !== 0 ? rat_2 / rat_1 : 0;
        }
        // VAM arrow (solo testo, nessuna emoji)
        let vamArrow = '';
        if (vamDiff > 10) {
            vamArrow = ` +${vamDiff.toFixed(0)} m/h`;
        } else if (vamDiff < -10) {
            vamArrow = ` -${vamDiff.toFixed(0)} m/h`;
        } else {
            vamArrow = ` ~${vamDiff.toFixed(0)} m/h`;
        }
        let bgColor = getZoneColor(avgPower, FTP);
        let hrText = '';
        if (sectionHRs.length > 0 && sectionHRs.some(hr => hr > 0)) {
            hrText = `❤️ ∅ ${avgHR.toFixed(0)} bpm | max. ${maxHR} bpm<br>`;
        }
        traces.push({
            x: distanceKm.slice(startIndex, endIndex),
            y: altitude.slice(startIndex, endIndex),
            type: 'scatter',
            mode: 'lines',
            line: { color: bgColor, width: 2 },
            name: `Anstieg ${climbNo}`,
            hoverinfo: 'text',
            text: `Climb ${climbNo}<br>
📏 ${(dist / 1000).toFixed(2)} km | 🔼 ${elevationGain.toFixed(0)}m <br>
📈 ∅ ${avgGrade.toFixed(1)}% | max. ${maxGrade.toFixed(1)}%<br>
⚡ ${avgPower.toFixed(0)} W | 5s ${best5sWatts.toFixed(0)} W<br>
⚖️ ${avgPowerPerKg.toFixed(2)} W/kg | 5s ${best5sPerKg.toFixed(2)} W/kg<br> 
🔀 ${rat_1.toFixed(0)} W | ${rat_2.toFixed(0)} W | ${(ratio).toFixed(2)}<br>
${hrText}
⏱️ ${formattedTime} | 🚴‍♂️ ${avgHorizontalSpeed.toFixed(1)} km/h<br>
🚵‍♂️ ${ascentSpeed.toFixed(0)} m/h${vamArrow}`
        });

        let hrAnn = '';
        if (sectionHRs.length > 0 && sectionHRs.some(hr => hr > 0)) {
            hrAnn = `❤ ${avgHR.toFixed(0)} <br>`;
        }
        annotations.push({
            x: (distanceKm[startIndex] + distanceKm[endIndex]) / 2,
            y: Math.max(...altitude) + 130,
            text: `QDH ${difficultyCoefficient.toFixed(0)}<br>⚡ ${avgPower.toFixed(0)} <br>${hrAnn}⏱️ ${climbTimeInSeconds.toFixed(0)} s`,
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
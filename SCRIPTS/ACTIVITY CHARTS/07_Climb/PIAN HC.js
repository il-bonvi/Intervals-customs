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
   // Variabili di configurazione
    const SECTION_LENGTH = 25;
    const MIN_SEGMENTS = 40;
    const MIN_GRADE = 5;
    const MAX_GRADE_END = 2;
    const MAX_GAP_SEGMENTS = 20;
    const MIN_DIFFICULTY = 25;
    const MAX_FLAT_SEGMENTS_IN_CLIMB = 6;


    // Funzione per recuperare i dati dei flussi
    function getStreamData(streamName) {
        const stream = icu.streams.get(streamName);
        return stream && stream.data ? stream.data.map(value => value ?? 0) : Array(icu.streams.get("time").data.length).fill(0);
    }
    
    // Recupero dei flussi dati
    const altitude = getStreamData("fixed_altitude");
    const distance = getStreamData("distance"); // Flusso distanza in metri
    const distanceKm = distance.map(d => d / 1000); // Conversione distanza in chilometri
    const power = getStreamData("fixed_watts"); // Flusso potenza in watt
    const heartrate = getStreamData("fixed_heartrate"); // Flusso frequenza cardiaca in bpm
    const grade = getStreamData("grade_smooth");
    const time = getStreamData("time"); // Flusso tempo (in secondi)
    
    // Correggi i valori iniziali del profilo altimetrico
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
    
    // Suddivisione in sezioni
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
    
    // Identificazione delle salite in base ai criteri
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
      
    // Unisci salite e gap come parte della salita
    for (let i = 1; i < climbs.length; i++) {
        const prevClimb = climbs[i - 1];
        const currentClimb = climbs[i];
        const gapSegments = currentClimb.startSegment - prevClimb.endSegment;
    
        if (gapSegments <= MAX_GAP_SEGMENTS) {
            // Unisci gap e salite
            prevClimb.endSegment = currentClimb.endSegment;
            climbs.splice(i, 1);
            i--; // Aggiorna l'indice perché una salita è stata rimossa
        }
    }
    
    // Visualizzazione delle salite identificate
    let annotations = [];
    let traces = [];
    let climbNo = 0;
    //climbs.forEach((climb, climbNo) => {
    climbs.forEach(climb => {
        const startIndex = sections[climb.startSegment].startIndex;
        const endIndex = sections[climb.endSegment].endIndex;
    const climbSections = sections.slice(climb.startSegment, climb.endSegment);
    // Calcolo dati salita: distanza e dislivello come differenza tra quota finale e iniziale
    const dist = distance[endIndex] - distance[startIndex];
    const elevationGain = altitude[endIndex] - altitude[startIndex];
    const avgGrade = elevationGain / dist * 100;
        const difficultyCoefficient = Math.pow(avgGrade, 2) * (dist / 1000);

        // Filtra le salite con difficoltà inferiore a 5
        if (difficultyCoefficient < MIN_DIFFICULTY) {
            return; // Ignora questa salita
        }

        climbNo++; 
    const climbPowers = power.slice(startIndex, endIndex);
    // Calcolo potenza media prima e seconda metà salita e rapporto
    const half = Math.floor(climbPowers.length / 2);
    const rat_1 = half > 0 ? climbPowers.slice(0, half).reduce((a, b) => a + b, 0) / half : 0;
    const rat_2 = (climbPowers.length - half) > 0 ? climbPowers.slice(half).reduce((a, b) => a + b, 0) / (climbPowers.length - half) : 0;
    const ratio = rat_1 > 0 ? rat_2 / rat_1 : 0;

    // climbPowers già dichiarato sopra
        const climbHRs = heartrate.slice(startIndex, endIndex);
        const climbCadence = getStreamData("cadence").slice(startIndex, endIndex);
        const avgPower = climbPowers.reduce((a, b) => a + b, 0) / climbPowers.length;
        const best5sWatts = getBestAverageOverNSeconds(climbPowers, 5);
    const hasHR = climbHRs.some(hr => hr > 0);
    const avgHR = hasHR ? climbHRs.reduce((a, b) => a + b, 0) / climbHRs.length : null;
    const maxHR = hasHR ? Math.max(...climbHRs) : null;
        const avgCadence = climbCadence.length ? climbCadence.reduce((a, b) => a + b, 0) / climbCadence.length : 0;
        const climbTimeInSeconds = time[endIndex] - time[startIndex];
        function formatSecondsToHHMMSS(seconds) {
            const sec = Math.floor(seconds % 60);
            const min = Math.floor((seconds / 60) % 60);
            const hr = Math.floor(seconds / 3600);
            return `${hr.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
        }
        const formattedTime = `${Math.floor(climbTimeInSeconds / 60)}m${climbTimeInSeconds % 60}s`;
        const formattedTimeHHMMSS = formatSecondsToHHMMSS(climbTimeInSeconds);
        const ascentSpeed = elevationGain / (climbTimeInSeconds / 3600);
        const avgHorizontalSpeed = (dist / 1000) / (climbTimeInSeconds / 3600);
        const maxGrade = Math.max(...grade.slice(startIndex, endIndex));
        const weight = icu.activity.icu_weight;
        const avgPowerPerKg = weight ? avgPower / weight : 0;
        const best5sPerKg = weight ? best5sWatts / weight : 0;
        const gradientFactor = (2 + avgGrade / 10) * 100;
        const TEORICWKG = ascentSpeed / gradientFactor;
        const TEORICVAM = avgPowerPerKg * gradientFactor;
        const vamDiff = ascentSpeed - TEORICVAM;
        let vamArrow = '';
        if (vamDiff > 10) {
            vamArrow = ` 🔺+${vamDiff.toFixed(0)} m/h`;
        } else if (vamDiff < -10) {
            vamArrow = ` 🔻${vamDiff.toFixed(0)} m/h`;
        } else {
            vamArrow = ` ↔️ ${vamDiff.toFixed(0)} m/h`;
        }

        // Calcolo percentuale differenza tra TEORICWKG e avgPowerPerKg
        let teoricWkgDiffPerc = '';
        if (TEORICWKG && avgPowerPerKg) {
            teoricWkgDiffPerc = ((avgPowerPerKg - TEORICWKG) / avgPowerPerKg * 100).toFixed(1) + '%';
        }
        // Calcolo kJ accumulati fino all'inizio della salita
        let kJ_accum = 0, kJ_accum_overCP = 0;
        const FTP = icu.activity.icu_ftp;
        for (let i = 1; i < startIndex; i++) {
            const dt = time[i] - time[i - 1];
            kJ_accum += power[i] * dt / 1000;
            if (power[i] >= FTP) kJ_accum_overCP += power[i] * dt / 1000;
        }
        const hours = time[startIndex] / 3600;
        const kJ_per_h_kg = (weight && hours > 0) ? kJ_accum / hours / weight : 0;
        const kJ_overCP_per_h_kg = (weight && hours > 0) ? kJ_accum_overCP / hours / weight : 0;
        
        // Determina il colore secondo la scala
        let bgColor = "grey";
        if (difficultyCoefficient >= 25 && difficultyCoefficient < 75) bgColor = "yellowgreen";
        else if (difficultyCoefficient >= 75 && difficultyCoefficient < 150) bgColor = "orange";
        else if (difficultyCoefficient >= 150 && difficultyCoefficient < 300) bgColor = "darkorange";
        else if (difficultyCoefficient >= 300 && difficultyCoefficient < 600) bgColor = "orangered";
        else if (difficultyCoefficient >= 600 && difficultyCoefficient < 900) bgColor = "firebrick";
        else if (difficultyCoefficient >= 900 && difficultyCoefficient < 1200) bgColor = "maroon";
        else if(difficultyCoefficient >= 1200) bgColor = "black";
        
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
⚡ ${avgPower.toFixed(0)} W | 5″ ${best5sWatts.toFixed(0)} W 🌀 ∅ ${avgCadence.toFixed(0)} rpm<br>
⚖️ ${avgPowerPerKg.toFixed(2)} W/kg | 5″ ${best5sPerKg.toFixed(2)} W/kg<br>
🔀 ${rat_1.toFixed(0)} W | ${rat_2.toFixed(0)} W | ${ratio.toFixed(2)}<br>
${hasHR ? `❤️ ∅ ${avgHR.toFixed(0)} bpm | max. ${maxHR} bpm<br>` : ''}
⏱️ ${formattedTimeHHMMSS} | 🚴‍♂️ ${avgHorizontalSpeed.toFixed(1)} km/h<br>
🚵‍♂️ ${ascentSpeed.toFixed(0)} m/h${vamArrow} | ${(avgPowerPerKg - TEORICWKG).toFixed(2)} W/kg<br>
🧮 ${TEORICWKG.toFixed(2)} W/kg | ${TEORICVAM.toFixed(0)} VAM | ${teoricWkgDiffPerc}<br>
⏱️ ${formatSecondsToHHMMSS(time[startIndex])}<br>
🔋 ${Math.round(kJ_accum)} kJ | ${Math.round(kJ_accum_overCP)} kJ > CP<br>
🔥 ${kJ_per_h_kg.toFixed(1)} kJ/h/kg | ${kJ_overCP_per_h_kg.toFixed(1)} kJ/h/kg > CP`
        });

        // Annotazione permanente: coefficiente di difficoltà (scala colori)
        annotations.push({
            x: (distanceKm[startIndex] + distanceKm[endIndex]) / 2,
            y: Math.max(...altitude) + 130,
text: `QDH ${difficultyCoefficient.toFixed(0)}<br>⚡ ${avgPower.toFixed(0)} <br>❤ ${avgHR.toFixed(0)} <br>⏱️ ${Math.floor(climbTimeInSeconds / 60)}m${climbTimeInSeconds % 60}s`,
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
    
    // Aggiungi il profilo altimetrico di sfondo
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
    
    // Crea il layout Plotly
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
    
    // Crea il grafico
    const chart = { data: traces, layout };
    chart;
    
}
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
    // ─── PARAMETRI RILEVAMENTO SALITE (metodo prominenza di gara.html) ───
    const CLIMB_PARAMS = {
        minSegments: 7,        // × 50 m = lunghezza minima
        minDifficulty: 25,     // pendenza² × km (filtra salitelle) — come originale
        smoothM: 30,           // m — raggio di media sull'altimetria
        refGrade: 3,           // % — sotto questa un tratto non è salita
        dropTol: 12,           // m — dislivello "perso" che chiude la salita
        minAvgGrade: 2,        // % — scarta lunghi tratti troppo dolci (allineato a MIN_GRADE originale)
        mergePausePct: 15,     // % della più corta delle due salite (0 = non unire)
        mergeDropPct: 5        // % del dislivello della più piccola, perso nella pausa
    };

    const SECTION_LENGTH = 50; // metri

    // ─── Helper prominenza (da gara.html) ───
    function smoothByDistance(values, distances, radiusMeters) {
        const n = values.length;
        if (!(radiusMeters > 0)) return values.slice();
        const smoothed = new Array(n);
        let lo = 0, hi = 0, sum = 0, count = 0;
        for (let i = 0; i < n; i++) {
            const center = distances[i];
            while (hi < n && distances[hi] <= center + radiusMeters) { sum += values[hi]; count++; hi++; }
            while (lo < n && distances[lo] < center - radiusMeters) { sum -= values[lo]; count--; lo++; }
            smoothed[i] = count > 0 ? sum / count : values[i];
        }
        return smoothed;
    }

    function zigzagPivots(f, tol) {
        const piv = [];
        const n = f.length;
        if (n < 2) return piv;
        let dir = 0, minI = 0, maxI = 0, extI = 0;
        for (let i = 1; i < n; i++) {
            if (dir === 0) {
                if (f[i] < f[minI]) minI = i;
                if (f[i] > f[maxI]) maxI = i;
                if (f[i] - f[minI] >= tol)      { piv.push({ i: minI, t: 'min' }); dir = 1;  extI = i; }
                else if (f[maxI] - f[i] >= tol) { piv.push({ i: maxI, t: 'max' }); dir = -1; extI = i; }
            } else if (dir === 1) {
                if (f[i] > f[extI]) extI = i;
                else if (f[extI] - f[i] >= tol) { piv.push({ i: extI, t: 'max' }); dir = -1; extI = i; }
            } else {
                if (f[i] < f[extI]) extI = i;
                else if (f[i] - f[extI] >= tol) { piv.push({ i: extI, t: 'min' }); dir = 1;  extI = i; }
            }
        }
        if (dir !== 0) piv.push({ i: extI, t: dir === 1 ? 'max' : 'min' });
        return piv;
    }

    function detectClimbsByProminence(altitude, distance, opts) {
        const eleS = smoothByDistance(altitude, distance, opts.smoothM);
        const g0 = opts.refGrade / 100;
        const f = eleS.map((e, i) => e - g0 * distance[i]);

        const piv = zigzagPivots(f, opts.dropTol);
        const MIN_LAST = 25;
        const sections = [];
        const climbs = [];

        const cand = [];
        for (let k = 0; k + 1 < piv.length; k++) {
            if (piv[k].t === 'min' && piv[k + 1].t === 'max' && piv[k + 1].i > piv[k].i) {
                cand.push({ s: piv[k].i, e: piv[k + 1].i });
            }
        }

        if (opts.mergePausePct > 0) {
            let merged = true;
            while (merged) {
                merged = false;
                for (let k = 0; k + 1 < cand.length; k++) {
                    const A = cand[k], B = cand[k + 1];
                    const lenA = distance[A.e] - distance[A.s];
                    const lenB = distance[B.e] - distance[B.s];
                    const gap = distance[B.s] - distance[A.e];
                    const gainA = eleS[A.e] - eleS[A.s];
                    const gainB = eleS[B.e] - eleS[B.s];
                    let minEle = eleS[A.e];
                    for (let i = A.e; i <= B.s; i++) if (eleS[i] < minEle) minEle = eleS[i];
                    const drop = eleS[A.e] - minEle;
                    if (gap <= (opts.mergePausePct / 100) * Math.min(lenA, lenB) &&
                        drop <= (opts.mergeDropPct / 100) * Math.min(gainA, gainB)) {
                        cand.splice(k, 2, { s: A.s, e: B.e });
                        merged = true;
                        break;
                    }
                }
            }
        }

        for (const { s, e } of cand) {
            const bounds = [s];
            let cs = s;
            for (let i = s + 1; i <= e; i++) {
                if (distance[i] - distance[cs] >= SECTION_LENGTH || i === e) {
                    bounds.push(i);
                    cs = i;
                }
            }
            if (bounds.length > 2 && distance[bounds[bounds.length - 1]] - distance[bounds[bounds.length - 2]] < MIN_LAST) {
                bounds.splice(bounds.length - 2, 1);
            }

            const firstSeg = sections.length;
            for (let b = 0; b + 1 < bounds.length; b++) {
                const a = bounds[b], z = bounds[b + 1];
                const d = distance[z] - distance[a];
                const dz = altitude[z] - altitude[a];
                sections.push({
                    sectionIndex: sections.length,
                    startIndex: a,
                    endIndex: z,
                    distance: d,
                    elevation: dz,
                    grade: d > 0 ? (dz / d) * 100 : 0
                });
            }
            if (sections.length - 1 >= firstSeg) {
                climbs.push({ startSegment: firstSeg, endSegment: sections.length - 1 });
            }
        }
        return { sections, climbs };
    }

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

    // ─── Rilevamento salite (prominenza) ───
    const { sections, climbs } = detectClimbsByProminence(altitude, distance, CLIMB_PARAMS);
    
    // Visualizzazione delle salite identificate
    let annotations = [];
    let traces = [];
    let climbNo = 0;

    climbs.forEach(climb => {
        const startIndex = sections[climb.startSegment].startIndex;
        const endIndex = sections[climb.endSegment].endIndex;
        const climbSections = sections.slice(climb.startSegment, climb.endSegment + 1);
        // Calcolo dati salita: distanza e dislivello come differenza tra quota finale e iniziale
        const dist = distance[endIndex] - distance[startIndex];
        const elevationGain = altitude[endIndex] - altitude[startIndex];
        const avgGrade = dist > 0 ? elevationGain / dist * 100 : 0;
        const difficultyCoefficient = Math.pow(avgGrade, 2) * (dist / 1000);

        // Filtra le salite (stessi criteri di stile originale + params)
        if (difficultyCoefficient < CLIMB_PARAMS.minDifficulty) {
            return;
        }
        if (dist < CLIMB_PARAMS.minSegments * SECTION_LENGTH) {
            return;
        }
        if (avgGrade < CLIMB_PARAMS.minAvgGrade) {
            return;
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
        const hasHR = climbHRs.some(hr => hr > 0);
        const climbCadence = getStreamData("cadence").slice(startIndex, endIndex);
        const avgPower = climbPowers.length ? climbPowers.reduce((a, b) => a + b, 0) / climbPowers.length : 0;
        const best5sWatts = getBestAverageOverNSeconds(climbPowers, 5);
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
        const ascentSpeed = climbTimeInSeconds > 0 ? elevationGain / (climbTimeInSeconds / 3600) : 0;
        const avgHorizontalSpeed = climbTimeInSeconds > 0 ? (dist / 1000) / (climbTimeInSeconds / 3600) : 0;
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
        
        // Determina il colore secondo la scala (identica all'originale)
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
🚵 ${ascentSpeed.toFixed(0)} m/h${vamArrow} | ${(avgPowerPerKg - TEORICWKG).toFixed(2)} W/kg<br>
🧮 ${TEORICWKG.toFixed(2)} W/kg | ${TEORICVAM.toFixed(0)} VAM | ${teoricWkgDiffPerc}<br>
⏱️ ${formatSecondsToHHMMSS(time[startIndex])}<br>
🔋 ${Math.round(kJ_accum)} kJ | ${Math.round(kJ_accum_overCP)} kJ > CP<br>
🔥 ${kJ_per_h_kg.toFixed(1)} kJ/h/kg | ${kJ_overCP_per_h_kg.toFixed(1)} kJ/h/kg > CP`
        });

        // Annotazione permanente: coefficiente di difficoltà (scala colori)
        annotations.push({
            x: (distanceKm[startIndex] + distanceKm[endIndex]) / 2,
            y: Math.max(...altitude) + 130,
text: `QDH ${difficultyCoefficient.toFixed(0)}<br>⚡ ${avgPower.toFixed(0)} <br>${hasHR ? `❤ ${avgHR.toFixed(0)}` : ''} <br>⏱️ ${Math.floor(climbTimeInSeconds / 60)}m${climbTimeInSeconds % 60}s`,
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

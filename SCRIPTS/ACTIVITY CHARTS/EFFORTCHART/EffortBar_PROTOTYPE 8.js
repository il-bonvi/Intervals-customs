(() => {

    // === CONFIGURAZIONE INIZIALE ===
    // Parametri principali
    const MERGE_POWER_DIFF_PERCENT = 15; // % diff. potenza per unire sezioni (es: 15)
    const WINDOW_SECONDS = 60;           // Durata finestra analisi (s)
    const MIN_EFFORT_INTENSITY_FTP = 100; // Soglia minima intensità (% FTP)
    const FTP = icu.activity.icu_ftp;    // FTP dell'attività

    // Limatura
    const TRIM_WINDOW_SECONDS = 10;      // Finestra limatura (s)
    const TRIM_LOW_PERCENT = 85;         // Soglia limatura (% della media effort)
    // Estensione
    const EXTEND_WINDOW_SECONDS = 15;    // Finestra estensione (s)
    const EXTEND_LOW_PERCENT = 80;       // Soglia estensione (% della media effort)

    // Colori zone potenza
    const ZONE_COLORS = [
        { threshold: 106, color: "#1f77b4", label: "CP–just above" },
        { threshold: 116, color: "#3eb33eff", label: "Threshold+" },
        { threshold: 126, color: "#ff7f0e", label: "VO₂max" },
        { threshold: 136, color: "#da2fbdff", label: "High VO₂max / MAP" },
        { threshold: 151, color: "#7315caff", label: "Supra-MAP" },
    ];
    const ZONE_COLOR_DEFAULT = { color: "#000000ff", label: "Anaerobico" };

    // Utility
    const fmt = (num, digits = 0) => Number(num).toFixed(digits);
    // === FINE CONFIGURAZIONE ===

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

    function getZoneColor(avgPower, FTP) {
        if (!FTP || FTP <= 0) return 'grey';
        const percentage = (avgPower / FTP) * 100;
        for (const zone of ZONE_COLORS) {
            if (percentage < zone.threshold) return zone.color;
        }
        return ZONE_COLOR_DEFAULT.color;
    }


    // --- LOGICA: finestre NON sovrapposte da WINDOW_SECONDS (step = window) + MERGE ---
    function mergeConsecutiveWindows(power, windowSec, mergePercent) {
        const samplingRate = 1; // 1Hz
        const windowSize = windowSec * samplingRate;
        const windows = [];
        for (let i = 0; i <= power.length - windowSize; i += windowSize) {
            let sum = 0;
            for (let j = 0; j < windowSize; j++) sum += power[i + j];
            let avg = sum / windowSize;
            windows.push({ start: i, end: i + windowSize, sum, avg, len: windowSize });
        }
        // Merge consecutive windows se la differenza percentuale è sotto soglia
        const efforts = [];
        let idx = 0;
        while (idx < windows.length) {
            let curr = windows[idx];
            let sum = curr.sum;
            let len = curr.len;
            let start = curr.start;
            let end = curr.end;
            let avg = curr.avg;
            let nextIdx = idx + 1;
            while (nextIdx < windows.length) {
                let next = windows[nextIdx];
                let diff = Math.abs(next.avg - avg);
                let percDiff = avg !== 0 ? (diff / avg) * 100 : 0;
                if (percDiff <= mergePercent) {
                    sum += next.sum;
                    len += next.len;
                    end = next.end;
                    avg = sum / len;
                    nextIdx++;
                } else {
                    break;
                }
            }
            efforts.push({ start, end, avg });
            idx = nextIdx;
        }
        return efforts;
    }

    // Limatura inizio/fine effort con finestre da TRIM_WINDOW_SECONDS
    function trimEffort(power, start, end, avg, trimWindowSec, trimLowPercent) {
        const samplingRate = 1; // 1Hz
        const trimWindow = trimWindowSec * samplingRate;
        let newStart = start;
        let newEnd = end;
        let canTrim = true;
        while (canTrim && newEnd - newStart >= trimWindow * 2) {
            canTrim = false;
            // Limatura inizio
            while (newEnd - newStart >= trimWindow * 2) {
                const currPower = power.slice(newStart, newEnd);
                const currAvg = currPower.reduce((a,b)=>a+b,0) / (currPower.length || 1);
                const win = power.slice(newStart, newStart + trimWindow);
                const winAvg = win.reduce((a,b)=>a+b,0) / win.length;
                if (winAvg < (trimLowPercent / 100) * currAvg) {
                    newStart += trimWindow;
                    canTrim = true;
                } else {
                    break;
                }
            }
            // Limatura fine
            while (newEnd - newStart >= trimWindow * 2) {
                const currPower = power.slice(newStart, newEnd);
                const currAvg = currPower.reduce((a,b)=>a+b,0) / (currPower.length || 1);
                const win = power.slice(newEnd - trimWindow, newEnd);
                const winAvg = win.reduce((a,b)=>a+b,0) / win.length;
                if (winAvg < (trimLowPercent / 100) * currAvg) {
                    newEnd -= trimWindow;
                    canTrim = true;
                } else {
                    break;
                }
            }
        }
        // Se la limatura ha eliminato tutto, restituisci l'effort originale
        if (newEnd - newStart < trimWindow * 2) return { start, end };
        return { start: newStart, end: newEnd };
    }


    // 1. Crea finestre fisse
    let efforts = mergeConsecutiveWindows(power, WINDOW_SECONDS, MERGE_POWER_DIFF_PERCENT);

    // 2. Applica limatura PRIMA del merge (con parametri limatura)
    efforts = efforts.map(eff => {
        const trimmed = trimEffort(power, eff.start, eff.end, eff.avg, TRIM_WINDOW_SECONDS, TRIM_LOW_PERCENT);
        const trimmedPower = power.slice(trimmed.start, trimmed.end);
        const trimmedAvg = trimmedPower.reduce((a,b)=>a+b,0) / (trimmedPower.length || 1);
        return { ...eff, start: trimmed.start, end: trimmed.end, avg: trimmedAvg };
    });

    // 3. Filtra solo effort sopra la soglia percentuale di FTP
    efforts = efforts.filter(eff => eff.avg > (MIN_EFFORT_INTENSITY_FTP / 100) * FTP);

    // Merge + estensione iterativi finché la lista non cambia più
    // (estensione con parametri estensione)
    function mergeEffortsPostTrim(efforts, power, mergePercent) {
        if (efforts.length === 0) return [];
        // Ordina per inizio
        const sorted = efforts.slice().sort((a, b) => a.start - b.start);
        const merged = [];
        let curr = { ...sorted[0] };
        for (let i = 1; i < sorted.length; i++) {
            const next = sorted[i];
            // Unisci se si sovrappongono anche solo parzialmente (next.start < curr.end)
            if (next.start < curr.end) {
                const allPower = power.slice(Math.min(curr.start, next.start), Math.max(curr.end, next.end));
                const avg = allPower.reduce((a,b)=>a+b,0) / allPower.length;
                const percDiff = Math.abs(curr.avg - next.avg) / ((curr.avg + next.avg) / 2) * 100;
                if (percDiff <= mergePercent) {
                    curr.start = Math.min(curr.start, next.start);
                    curr.end = Math.max(curr.end, next.end);
                    curr.avg = avg;
                    continue;
                }
            }
            merged.push(curr);
            curr = { ...next };
        }
        merged.push(curr);
        return merged;
    }

let changed = true;
while (changed) {
    changed = false;
    const prevEfforts = JSON.stringify(efforts);
    // Merge
    efforts = mergeEffortsPostTrim(efforts, power, MERGE_POWER_DIFF_PERCENT);
    // Estensione in testa e in coda (con parametri estensione)
    efforts = efforts.map(eff => {
        let { start, end } = eff;
        // Estensione in testa
        let extChanged = true;
        while (extChanged) {
            extChanged = false;
            if (start - EXTEND_WINDOW_SECONDS >= 0) {
                const extWin = power.slice(start - EXTEND_WINDOW_SECONDS, start);
                const extAvg = extWin.reduce((a,b)=>a+b,0) / extWin.length;
                const currPower = power.slice(start, end);
                const currAvg = currPower.reduce((a,b)=>a+b,0) / (currPower.length || 1);
                if (extAvg >= (EXTEND_LOW_PERCENT / 100) * currAvg) {
                    start -= EXTEND_WINDOW_SECONDS;
                    extChanged = true;
                }
            }
        }
        // Estensione in coda
        extChanged = true;
        while (extChanged) {
            extChanged = false;
            if (end + EXTEND_WINDOW_SECONDS <= power.length) {
                const extWin = power.slice(end, end + EXTEND_WINDOW_SECONDS);
                const extAvg = extWin.reduce((a,b)=>a+b,0) / extWin.length;
                const currPower = power.slice(start, end);
                const currAvg = currPower.reduce((a,b)=>a+b,0) / (currPower.length || 1);
                if (extAvg >= (EXTEND_LOW_PERCENT / 100) * currAvg) {
                    end += EXTEND_WINDOW_SECONDS;
                    extChanged = true;
                }
            }
        }
        // Limatura dopo merge+estensione (con parametri limatura)
        // Calcola la media aggiornata dopo l'estensione
        const updatedPower = power.slice(start, end);
        const updatedAvg = updatedPower.reduce((a,b)=>a+b,0) / (updatedPower.length || 1);
        const trimmed = trimEffort(power, start, end, updatedAvg, TRIM_WINDOW_SECONDS, TRIM_LOW_PERCENT);
        const trimmedPower = power.slice(trimmed.start, trimmed.end);
        const trimmedAvg = trimmedPower.reduce((a,b)=>a+b,0) / (trimmedPower.length || 1);
        return { ...eff, start: trimmed.start, end: trimmed.end, avg: trimmedAvg };
    });

    if (JSON.stringify(efforts) !== prevEfforts) changed = true;
}

// --- SPLIT: se un effort è completamente contenuto in un altro, splitta il più lungo in 3 parti ---

function splitEffortsOnInclusion(efforts, power) {
    // Ordina per inizio
    let result = efforts.slice().sort((a, b) => a.start - b.start);
    let changed = true;
    while (changed) {
        changed = false;
        outer: for (let i = 0; i < result.length; i++) {
            for (let j = 0; j < result.length; j++) {
                if (i === j) continue;
                const a = result[i];
                const b = result[j];
                // b è incluso in a (anche se inizia o finisce nello stesso punto, ma non entrambi)
                if (
                    a.start < b.start && b.end < a.end && b.start < b.end
                    // b completamente dentro a
                ) {
                    const newEfforts = [];
                    // Prima di b
                    if (b.start > a.start) {
                        const pow1 = power.slice(a.start, b.start);
                        if (pow1.length > 0) {
                            newEfforts.push({ start: a.start, end: b.start, avg: pow1.reduce((x,y)=>x+y,0)/pow1.length });
                        }
                    }
                    // b stesso
                    newEfforts.push(b);
                    // Dopo b
                    if (b.end < a.end) {
                        const pow2 = power.slice(b.end, a.end);
                        if (pow2.length > 0) {
                            newEfforts.push({ start: b.end, end: a.end, avg: pow2.reduce((x,y)=>x+y,0)/pow2.length });
                        }
                    }
                    // Sostituisci a e b con i nuovi segmenti
                    result = result.filter((_, idx) => idx !== i && idx !== j).concat(newEfforts);
                    result = result.sort((x, y) => x.start - y.start);
                    changed = true;
                    break outer;
                }
                // b inizia o finisce esattamente come a (ma non entrambi)
                // Caso 1: b.start === a.start && b.end < a.end
                if (b.start === a.start && b.end < a.end) {
                    const newEfforts = [];
                    // b stesso
                    newEfforts.push(b);
                    // Dopo b
                    if (b.end < a.end) {
                        const pow2 = power.slice(b.end, a.end);
                        if (pow2.length > 0) {
                            newEfforts.push({ start: b.end, end: a.end, avg: pow2.reduce((x,y)=>x+y,0)/pow2.length });
                        }
                    }
                    result = result.filter((_, idx) => idx !== i && idx !== j).concat(newEfforts);
                    result = result.sort((x, y) => x.start - y.start);
                    changed = true;
                    break outer;
                }
                // Caso 2: b.end === a.end && b.start > a.start
                if (b.end === a.end && b.start > a.start) {
                    const newEfforts = [];
                    // Prima di b
                    if (b.start > a.start) {
                        const pow1 = power.slice(a.start, b.start);
                        if (pow1.length > 0) {
                            newEfforts.push({ start: a.start, end: b.start, avg: pow1.reduce((x,y)=>x+y,0)/pow1.length });
                        }
                    }
                    // b stesso
                    newEfforts.push(b);
                    result = result.filter((_, idx) => idx !== i && idx !== j).concat(newEfforts);
                    result = result.sort((x, y) => x.start - y.start);
                    changed = true;
                    break outer;
                }
            }
        }
    }
    // Dopo lo split, assicurati che non ci siano sovrapposizioni: end deve essere sempre <= start del successivo
    result = result.sort((a, b) => a.start - b.start);
    for (let i = 1; i < result.length; i++) {
        if (result[i].start < result[i-1].end) {
            result[i].start = result[i-1].end;
            // Ricalcola avg se necessario
            const pow = power.slice(result[i].start, result[i].end);
            result[i].avg = pow.length > 0 ? pow.reduce((x,y)=>x+y,0)/pow.length : 0;
        }
    }
    return result;
}

efforts = splitEffortsOnInclusion(efforts, power);

    // (Logica di accorpamento in testa rimossa: lasciamo solo limatura ed estensione in coda)

    // --- GRAFICO ---
    const traces = [
        {
            x: distanceKm,
            y: altitude,
            text: altitude.map((alt, i) => `📏 ${fmt(distanceKm[i],2)} km<br>🏔️ ${fmt(alt,1)} m`),
            hoverinfo: 'text',
            fill: 'tozeroy',
            type: 'scatter',
            fillcolor: 'whitesmoke',
            mode: 'none',
            name: 'Altitudine'
        }
    ];
    const annotations = [];
    // Associa a ogni effort il suo indice temporale originale
    const effortsWithIndex = efforts.map((eff, idx) => ({ ...eff, originalIdx: idx }));
    // Ordina per watt decrescente SOLO per la legenda
    const sortedEfforts = effortsWithIndex.slice().sort((a, b) => b.avg - a.avg);
// Curve ordinate per potenza (sortedEfforts)
sortedEfforts.forEach((eff, idx) => {
    const sectionPower = power.slice(eff.start, eff.end);
    const sectionAltitude = altitude.slice(eff.start, eff.end);
    const sectionDistanceKm = distanceKm.slice(eff.start, eff.end);
    const sectionTime = time.slice(eff.start, eff.end);
    const avgPower = eff.avg;
    const bgColor = getZoneColor(avgPower, FTP);
    // Calcolo metriche aggiuntive come nel vecchio script
    const sectionHR = heartrate.slice(eff.start, eff.end);
    const sectionGrade = grade.slice(eff.start, eff.end);
    const elevationGain = sectionAltitude[sectionAltitude.length - 1] - sectionAltitude[0];
    const dist = distance.slice(eff.start, eff.end);
    const distTot = dist[dist.length - 1] - dist[0];
    const climbTimeInSeconds = sectionTime[sectionTime.length - 1] - sectionTime[0] + 1;
    const avgSpeed = distTot / (climbTimeInSeconds / 3600) / 1000;
    const vam = elevationGain / (climbTimeInSeconds / 3600);
    const avgGrade = elevationGain / distTot * 100;
    const gradientFactor = 2 + (avgGrade / 10);
    const vamTeorico = (avgPower / weight) * (gradientFactor * 100);
    let avgWattsFirstHalf = 0, avgWattsSecondHalf = 0, wattsRatio = 0;
    if (sectionPower.length) {
        const half = Math.floor(sectionPower.length / 2);
        avgWattsFirstHalf = sectionPower.slice(0, half).reduce((a,b)=>a+b,0) / (half || 1);
        avgWattsSecondHalf = sectionPower.slice(half).reduce((a,b)=>a+b,0) / (sectionPower.length - half || 1);
        wattsRatio = avgWattsSecondHalf ? avgWattsFirstHalf / avgWattsSecondHalf : 0;
    }
    const avgHR = sectionHR.length ? sectionHR.reduce((a,b)=>a+b,0)/sectionHR.length : 0;
    const maxHR = sectionHR.length ? Math.max(...sectionHR) : 0;
    const maxGrade = sectionGrade.length ? Math.max(...sectionGrade) : 0;
    const startTime = sectionTime.length ? sectionTime[0] : '';
    let best5sWatt = '', best5sWattKg = '';
    let avgPowerPerKg = 0;
    if (sectionPower.length >= 5 && weight > 0) {
        const maxW = Math.max(...Array.from({length: sectionPower.length - 4}, (_, i) => sectionPower.slice(i, i + 5).reduce((a,b)=>a+b,0)/5));
        best5sWatt = Math.round(maxW);
        best5sWattKg = fmt(maxW / weight, 2);
        avgPowerPerKg = avgPower / weight;
    }
    let joules = 0, joulesOverCP = 0;
    if (power && time && eff.start !== undefined && eff.start < power.length && FTP) {
        for (let i = 0; i < eff.start; i++) {
            const w = power[i];
            const secs = time[i] - (i > 0 ? time[i - 1] : 0);
            if (secs < 30) {
                joules += w * secs;
                if (w >= FTP) joulesOverCP += w * secs;
            }
        }
    }
    const hours = (time && eff.start !== undefined && time[eff.start]) ? (time[eff.start] / 3600) : 0;
    const kJ_h_kg = (weight && hours > 0) ? (joules/1000) / hours / weight : 0;
    const kJ_h_kg_overCP = (weight && hours > 0) ? (joulesOverCP/1000) / hours / weight : 0;
    function formatSecondsToHHMMSS(seconds) {
        const sec = Math.floor(seconds % 60);
        const min = Math.floor((seconds / 60) % 60);
        const hr = Math.floor(seconds / 3600);
        return `${hr.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    }
    const effortDurationSec = climbTimeInSeconds;
    function formatMMSS(seconds) {
        const min = Math.floor(seconds / 60);
        const sec = Math.floor(seconds % 60);
        return `${min}:${sec.toString().padStart(2, '0')}`;
    }
    const traceText = [
        (() => {
            const sectionCadence = getStreamData("cadence").slice(eff.start, eff.end);
            const avgCadence = sectionCadence.length ? sectionCadence.reduce((a,b)=>a+b,0)/sectionCadence.length : 0;
            return `⚡ ${fmt(avgPower)} W | 5"🔺${best5sWatt} W 🌀 ${fmt(avgCadence)} rpm`;
        })(),
        (() => {
            const timeStr = startTime ? `🕒 ${formatSecondsToHHMMSS(Number(startTime))}` : '';
            return `⏱️ ${formatMMSS(effortDurationSec)}${timeStr ? ' | ' + timeStr : ''}`;
        })(),
        `⚖️ ${fmt(avgPowerPerKg,2)} W/kg | 5"🔺${best5sWattKg} W/kg`,
        `🔀 ${fmt(avgWattsFirstHalf)} W | ${fmt(avgWattsSecondHalf)} W | ${fmt(wattsRatio,2)}`,
        `❤️ ∅${fmt(avgHR)} bpm |🔺${maxHR} bpm`,
        `🚴‍♂️ ${fmt(avgSpeed,1)} km/h 📏 ∅ ${fmt(avgGrade,1)}% |🔺${fmt(maxGrade,1)}%`,
        (() => {
            if (avgGrade >= 4.5) {
                const diffVAM = Math.abs(vamTeorico - vam);
                let arrow = vamTeorico - vam > 0 ? '⬆️' : (vamTeorico - vam < 0 ? '⬇️' : '');
                const wkgteoric = vam / (gradientFactor * 100);
                const diffWkg = avgPowerPerKg - wkgteoric;
                return `🚵‍♂️ ${fmt(vam,0)} m/h ${arrow} ${fmt(diffVAM,0)} m/h | ${fmt(Math.abs(diffWkg),2)} W/kg`;
            } else {
                return `🚵‍♂️ ${fmt(vam,0)} m/h`;
            }
        })(),
        (() => {
            if (avgGrade >= 4.5) {
                const wkgteoric = vam / (gradientFactor * 100);
                const diffWkg = avgPowerPerKg - wkgteoric;
                const percErr = avgPowerPerKg !== 0 ? (diffWkg / avgPowerPerKg) * 100 : 0;
                const sign = percErr > 0 ? '+' : (percErr < 0 ? '-' : '');
                return `🧮 ${fmt(vamTeorico,0)} m/h | ${fmt(wkgteoric,2)} W/kg | ${sign}${fmt(Math.abs(percErr),1)}%`;
            } else {
                return '';
            }
        })(),
        `🔋 ${fmt(joules/1000)} kJ | ${fmt(joulesOverCP/1000)} kJ > CP`,
        `🔥 ${fmt(kJ_h_kg,1)} kJ/h/kg | ${fmt(kJ_h_kg_overCP,1)} kJ/h/kg > CP`,
    ].filter(Boolean).join('<br>');
    traces.push({
        x: sectionDistanceKm,
        y: sectionAltitude,
        type: 'scatter',
        mode: 'lines',
        line: { color: bgColor, width: 2 },
        name: `${fmt(avgPower)} W | #${eff.originalIdx + 1}`,
        hoverinfo: 'text',
        visible: true,
        hoverlabel: { align: 'left' },
        text: traceText
    });
});

// Annotazioni alternate sopra/sotto secondo ordine temporale
const globalMaxAlt = Math.max(...altitude);
const globalMinAlt = Math.min(...altitude);

effortsWithIndex.forEach((eff, idx) => {
    const sectionDistanceKm = distanceKm.slice(eff.start, eff.end);
    const sectionAltitude = altitude.slice(eff.start, eff.end);
    const avgPower = eff.avg;
    const bgColor = getZoneColor(avgPower, FTP);
    const effortDurationSec = time[eff.end - 1] - time[eff.start] + 1;
    // Offset verticale: ogni annotation +100, max 4 (450), poi ricomincia da 50
    const offsetStep = 40;
    const maxSteps = 4;
    const baseOffset = 50;
    const offsets = [115, 40, -10, -70];    // Sequenza: sopra (+nn), sotto (-nn)
    const yAnn = (eff.originalIdx % 4 < 2)
        ? globalMaxAlt + offsets[eff.originalIdx % 4]
        : globalMinAlt + offsets[eff.originalIdx % 4];
    annotations.push({
        x: (sectionDistanceKm[0] + sectionDistanceKm[sectionDistanceKm.length - 1]) / 2,
        y: yAnn,
        text: `#${eff.originalIdx + 1}<br>⚡ ${fmt(avgPower)}<br>⏱️ ${fmt(effortDurationSec,0)}s`,
        showarrow: false,
        font: { family: 'Arial', size: 12, color: 'white' },
        align: 'center',
        bgcolor: bgColor,
        opacity: 0.9
    });
});

    const configTitle =
`<b>EFFORT</b> <b>|</b> ` +
`<span style='color:#000000ff'>MRG [${MERGE_POWER_DIFF_PERCENT}%]</span> ` +
`<span style='color:#000000ff'>WIN [${WINDOW_SECONDS}s]</span> ` +
`<span style='color:#000000ff'>MIN [${MIN_EFFORT_INTENSITY_FTP}%FTP]</span> <b>|</b> ` +
`<span style='color:#ff0000'>TRIM [${TRIM_WINDOW_SECONDS}s, ${TRIM_LOW_PERCENT}%]</span> ` +
`<span style='color:#1901f5ff'> [${EXTEND_WINDOW_SECONDS}s, ${EXTEND_LOW_PERCENT}%]</span>`;
    const layout = {
        title: { text: configTitle, font: { color: '#222', size: 18 }, },
        xaxis: { title: 'Distance (km)' },
        yaxis: { title: 'Altitude (m)' },
        annotations: annotations,
        hovermode: 'x unified',
        showlegend: true,
        margin: { t: 100, l: 50, r: 50, b: 50 },
        height: 500
    };

    const chart = { data: traces, layout: layout };
    return chart;
})();
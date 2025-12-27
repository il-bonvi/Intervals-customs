
(() => {
    // --- CONFIGURAZIONE INIZIALE ---
    // Durata della finestra di sforzo in secondi (es: 180 per 3 minuti)
    const EFFORT_WINDOW_SECONDS = 180;
    // Intensità minima come percentuale di FTP (es: 100 per 100% FTP)
    const MIN_EFFORT_INTENSITY_FTP = 100;
    // Valore FTP dall'attività
    const FTP = icu.activity.icu_ftp;
    // Soglia minima di pendenza media per mostrare valori teorici
    const MIN_AVG_GRADE_FOR_THEORETICAL = 4.5;
    // Configurazione colori delle zone: array di { threshold, color, label }
    const ZONE_COLORS = [
        { threshold: 106, color: "#1f77b4", label: "CP–just above" },
        { threshold: 116, color: "#3eb33eff", label: "Threshold+" },
        { threshold: 126, color: "#ff7f0e", label: "VO₂max" },
        { threshold: 136, color: "#da2fbdff", label: "High VO₂max / MAP" },
        { threshold: 151, color: "#7315caff", label: "Supra-MAP" },
    ];
    const ZONE_COLOR_DEFAULT = { color: "#000000ff", label: "Anaerobico" };
    // Helper per formattare numeri
    const fmt = (num, digits = 0) => Number(num).toFixed(digits);
    // --- FINE CONFIGURAZIONE INIZIALE ---

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

    // Function to get zone color based on avgPower and FTP, using configuration above
    function getZoneColor(avgPower, FTP) {
        if (!FTP || FTP <= 0) return 'grey';
        const percentage = (avgPower / FTP) * 100;
        for (const zone of ZONE_COLORS) {
            if (percentage < zone.threshold) return zone.color;
        }
        return ZONE_COLOR_DEFAULT.color;
    }

    // Fix initial altitude values (replace leading zeros with first non-zero value)
    const firstNonZeroAltitude = altitude.find(value => value !== 0);
    if (firstNonZeroAltitude !== undefined) {
        for (let i = 0; i < altitude.length; i++) {
            if (altitude[i] === 0) altitude[i] = firstNonZeroAltitude;
            else break;
        }
    }

    const traces = [
        {
            x: distanceKm,
            y: altitude,
            text: altitude.map(alt => `${fmt(alt,1)} m`),
            hoverinfo: 'text',
            fill: 'tozeroy',
            type: 'scatter',
            fillcolor: 'whitesmoke',
            mode: 'none',
            name: 'Elevation'
        }
    ];
    const annotations = [];
    // Find all non-overlapping efforts above threshold
    function getAllNonOverlappingEffortsAboveThreshold(data, n, threshold, samplingRate = 1) {
        const windowSize = n * samplingRate;
        const results = [];
        if (data.length < windowSize) return results;
        let sum = 0;
        for (let i = 0; i < windowSize; i++) sum += data[i];
        const candidates = [];
        if (sum / windowSize >= threshold) candidates.push({ avg: sum / windowSize, start: 0 });
        for (let i = 1; i <= data.length - windowSize; i++) {
            sum = sum - data[i - 1] + data[i + windowSize - 1];
            const avg = sum / windowSize;
            if (avg >= threshold) candidates.push({ avg, start: i });
        }
        candidates.sort((a, b) => b.avg - a.avg);
        const used = Array(data.length).fill(false);
        for (const cand of candidates) {
            let overlap = false;
            for (let j = cand.start; j < cand.start + windowSize; j++) {
                if (used[j]) { overlap = true; break; }
            }
            if (!overlap) {
                results.push(cand);
                for (let j = cand.start; j < cand.start + windowSize; j++) used[j] = true;
            }
        }
        results.sort((a, b) => a.start - b.start);
        return results;
    }

    // Trova tutti gli sforzi non sovrapposti sopra la soglia configurata
    // MIN_EFFORT_INTENSITY_FTP ora è percentuale, quindi dividi per 100
    const allEfforts = getAllNonOverlappingEffortsAboveThreshold(power, EFFORT_WINDOW_SECONDS, (MIN_EFFORT_INTENSITY_FTP / 100) * FTP, 1);
    // Sort allEfforts by avgPower descending for legend order
    const sortedEfforts = allEfforts.slice().sort((a, b) => b.avg - a.avg);
    sortedEfforts.forEach((best, idx) => {
        const avgPower = best.avg;
        const bestStart = best.start;
        const bestEnd = bestStart + EFFORT_WINDOW_SECONDS;
        const sectionPower = power.slice(bestStart, bestEnd);
        const sectionHR = heartrate.slice(bestStart, bestEnd);
        const sectionAltitude = altitude.slice(bestStart, bestEnd);
        const sectionDistance = distance.slice(bestStart, bestEnd);
        const sectionDistanceKm = distanceKm.slice(bestStart, bestEnd);
        const sectionGrade = grade.slice(bestStart, bestEnd);
        const sectionTime = time.slice(bestStart, bestEnd);

        // Metrics calculation
        const elevationGain = sectionAltitude[sectionAltitude.length - 1] - sectionAltitude[0];
        const dist = sectionDistance[sectionDistance.length - 1] - sectionDistance[0];
        const climbTimeInSeconds = sectionTime[sectionTime.length - 1] - sectionTime[0] + 1;
        const avgSpeed = dist / (climbTimeInSeconds / 3600) / 1000;
        const vam = elevationGain / (climbTimeInSeconds / 3600);
        const avgGrade = elevationGain / dist * 100;
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
        const bgColor = getZoneColor(avgPower, FTP);
        let joules = 0, joulesOverCP = 0;
        if (power && time && bestStart !== undefined && bestStart < power.length && FTP) {
            for (let i = 0; i < bestStart; i++) {
                const w = power[i];
                const secs = time[i] - (i > 0 ? time[i - 1] : 0);
                if (secs < 30) {
                    joules += w * secs;
                    if (w >= FTP) joulesOverCP += w * secs;
                }
            }
        }
        const hours = (time && bestStart !== undefined && time[bestStart]) ? (time[bestStart] / 3600) : 0;
        const kJ_h_kg = (weight && hours > 0) ? (joules/1000) / hours / weight : 0;
        const kJ_h_kg_overCP = (weight && hours > 0) ? (joulesOverCP/1000) / hours / weight : 0;
        function formatSecondsToHHMMSS(seconds) {
            const sec = Math.floor(seconds % 60);
            const min = Math.floor((seconds / 60) % 60);
            const hr = Math.floor(seconds / 3600);
            return `${hr.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
        }
        const traceText = [
            (() => {
                const sectionCadence = getStreamData("cadence").slice(bestStart, bestEnd);
                const avgCadence = sectionCadence.length ? sectionCadence.reduce((a,b)=>a+b,0)/sectionCadence.length : 0;
                return `⚡ ${fmt(avgPower)} W | 5"🔺${best5sWatt} W 🌀 ${fmt(avgCadence)} rpm`;
            })(),
            `⚖️ ${fmt(avgPowerPerKg,2)} W/kg | 5"🔺${best5sWattKg} W/kg`,
            `🔀 ${fmt(avgWattsFirstHalf)} W | ${fmt(avgWattsSecondHalf)} W | ${fmt(wattsRatio,2)}`,
            `❤️ ∅${fmt(avgHR)} bpm |🔺${maxHR} bpm`,
            `🚴‍♂️ ${fmt(avgSpeed,1)} km/h 📏 ∅ ${fmt(avgGrade,1)}% |🔺${fmt(maxGrade,1)}%`,
            (() => {
                if (avgGrade >= MIN_AVG_GRADE_FOR_THEORETICAL) {
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
                if (avgGrade >= MIN_AVG_GRADE_FOR_THEORETICAL) {
                    const wkgteoric = vam / (gradientFactor * 100);
                    const diffWkg = avgPowerPerKg - wkgteoric;
                    const percErr = avgPowerPerKg !== 0 ? (diffWkg / avgPowerPerKg) * 100 : 0;
                    const sign = percErr > 0 ? '+' : (percErr < 0 ? '-' : '');
                    return `🧮 ${fmt(vamTeorico,0)} m/h | ${fmt(wkgteoric,2)} W/kg | ${sign}${fmt(Math.abs(percErr),1)}%`;
                } else {
                    return '';
                }
            })(),
            startTime ? `🕒 ${formatSecondsToHHMMSS(Number(startTime))}` : '',
            `🔋 ${fmt(joules/1000)} kJ | ${fmt(joulesOverCP/1000)} kJ > CP`,
            `🔥 ${fmt(kJ_h_kg,1)} kJ/h/kg | ${fmt(kJ_h_kg_overCP,1)} kJ/h/kg > CP`,
        ].filter(Boolean).join('<br>');
        traces.push({
            x: sectionDistanceKm,
            y: sectionAltitude,
            type: 'scatter',
            mode: 'lines',
            line: { color: bgColor, width: 2 },
            name: `${fmt(avgPower)} W | #${idx + 1}`,
            hoverinfo: 'text',
            visible: true,
            hoverlabel: { align: 'left' },
            text: traceText
        });

        // Offset annotation positions to avoid overlap
        annotations.push({
            x: (sectionDistanceKm[0] + sectionDistanceKm[sectionDistanceKm.length - 1]) / 2 + (idx % 2 === 0 ? -1 : 1) * idx * 0.003,
            y: Math.max(...sectionAltitude) + 50 + idx * 25,
            text: `#${idx + 1}<br>⚡ ${fmt(avgPower)}`,
            showarrow: false,
            font: { family: 'Arial', size: 12, color: 'white' },
            align: 'center',
            bgcolor: bgColor,
            opacity: 0.9
        });
    });

    // Dynamic chart title based on configuration
    const effortMin = Math.floor(EFFORT_WINDOW_SECONDS / 60);
    const effortSec = EFFORT_WINDOW_SECONDS % 60;
    const effortLabel = effortSec > 0 ? `${effortMin}m ${effortSec}s` : `${effortMin}m`;
    const layout = {
        title: `All ${effortLabel} Power Efforts >${fmt(MIN_EFFORT_INTENSITY_FTP,0)}% CP`,
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


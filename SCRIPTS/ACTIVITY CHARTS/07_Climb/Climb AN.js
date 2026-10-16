{
const THEME_FALLBACK = 'dark';

// ─── THEME AUTO-DETECTION ─────────────────────────────────────
const THEME_MODE = typeof icu.darkMode === 'boolean'
    ? (icu.darkMode ? 'dark' : 'light')
    : (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    || THEME_FALLBACK;


// ─── THEME DEFINITIONS ────────────────────────────────────────
const THEMES = {
    dark: {
        paper_bgcolor:  '#1a1a1a',
        plot_bgcolor:   '#1a1a1a',
        font_color:     'rgba(255,255,255,0.70)',
        title_color:    'rgba(255,255,255,0.70)',
        axis_color:     'rgba(255,255,255,0.70)',
        grid_color:     'rgba(255,255,255,0.06)',
        
        base_line:      '#b9ddff',
        base_fill:      'rgba(80, 170, 255, 0.10)',
        
        max_point:      '#ff5577',
        min_point:      '#00ff99',
        start_point:    '#00ff99',
        stop_point:     '#ff5577',
        
        annotation:     'rgba(255,255,255,0.75)',
        hover_border:   'rgba(255,255,255,0.22)',
        summary:        '#00c3ff',
        legend:         '#00c3ff',
        hover_sum:      'rgba(255, 255, 255, 0.70)',
        hover_sum_t:    '#ffffff',
        hover_climb:    'rgba(255, 255, 255, 0.70)',
        hover_climb_t:  '#ffffff',

        // Climb category colors
        climb_hc:       '#ffffff',
        climb_cat1:     '#ff4d4d',
        climb_cat2:     '#ffb347',
        climb_cat3:     '#b6ff5b',
        climb_cat4:     '#4dff88',
        climb_cat5:     '#008deb',
        climb_uncat:    '#c084fc'
    },

    light: {
        paper_bgcolor:  '#ffffff',
        plot_bgcolor:   '#ffffff',
        font_color:     '#1f2937',
        title_color:    '#1f2937',
        axis_color:     '#374151',
        grid_color:     'rgba(0,0,0,0.09)',
        
        base_line:      '#276c88',
        base_fill:      'rgba(30, 64, 175, 0.09)',
        
        max_point:      '#e11d48',
        min_point:      '#0d883a',
        start_point:    '#0d883a',
        stop_point:     '#e11d48',
        
        annotation:     '#1f2937',
        hover_border:   'rgba(0,0,0,0.20)',
        summary:        '#006159',
        legend:         '#006159',
        hover_sum:      'rgba(0, 0, 0, 0.70)',
        hover_sum_t:    '#000000',
        hover_climb:    'rgba(0, 0, 0, 0.70)',
        hover_climb_t:  '#000000',

        // Climb category colors
        climb_hc:       '#1f2937',
        climb_cat1:     '#e11d48',
        climb_cat2:     '#f59e0b',
        climb_cat3:     '#84cc16',
        climb_cat4:     '#00af5d',
        climb_cat5:     '#3b82f6',
        climb_uncat:    '#a855f7'
    }
};

const T = THEMES[THEME_MODE] || THEMES['dark'];


// ─── PARAMETRI RILEVAMENTO SALITE (metodo prominenza di gara.html) ───
const CLIMB_PARAMS = {
    minSegments: 7,        // × 50 m = lunghezza minima
    minDifficulty: 1500,   // score = dist_m × grade% (come originale CLIM2)
    smoothM: 30,           // m — raggio di media sull'altimetria
    refGrade: 3,           // % — sotto questa un tratto non è salita
    dropTol: 12,           // m — dislivello "perso" che chiude la salita
    minAvgGrade: 2,        // % — scarta lunghi tratti troppo dolci
    mergePausePct: 15,     // % della più corta delle due salite (0 = non unire)
    mergeDropPct: 5        // % del dislivello della più piccola, perso nella pausa
};

const SECTION_LENGTH = 50; // metri (griglia sezioni dentro ogni salita)

const MIN_PADDING_RATIO = 0.06;
const MAX_PADDING_RATIO = 0.08;


// ─── HELPER FUNCTIONS ────────────────────────────────────────
function formatTime(seconds) {
    if (seconds < 60) return `${Math.floor(seconds)}s`;
    if (seconds < 3600) {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}m ${s}s`;
    }
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h}h ${m}m ${s}s`;
}

// Spike isolati (punto singolo fuori scala rispetto a prev e next)
function cleanAltitudeSpikes(altitudeData) {
    const cleaned = [...altitudeData];
    const MAX_DELTA = 50;
    for (let i = 1; i < cleaned.length - 1; i++) {
        const prev = cleaned[i - 1];
        const curr = cleaned[i];
        const next = cleaned[i + 1];
        if (Math.abs(curr - prev) > MAX_DELTA && Math.abs(curr - next) > MAX_DELTA) {
            cleaned[i] = (prev + next) / 2;
        }
    }
    return cleaned;
}

/**
 * Fix tipico dispositivi Wahoo (e simili): all'inizio/fine attività il barometro
 * non è ancora calibrato → quota GPS errata, poi un salto brusco quando entra
 * la quota barometrica.
 *
 * Strategia:
 *  1. Riempie zeri / valori < 1 m all'inizio con la prima quota valida
 *  2. Cerca il più grande salto in |Δh| nei primi ~N campioni (e ultimi)
 *     entro i primi ~400 m (e ultimi ~400 m). Se |Δh| > CALIB_JUMP_M,
 *     propaga all'indietro (o in avanti) la quota "stabile" post-calibrazione.
 *  3. Limita salti consecutivi irrealistici (> MAX_STEP_M per campione).
 */
function fixWahooAltitudeArtifacts(altitudeData) {
    const cleaned = [...altitudeData];
    const n = cleaned.length;
    if (n < 20) return cleaned;

    const CALIB_JUMP_M = 15;   // salto minimo considerato "calibrazione"
    const MAX_STEP_M   = 10;   // max Δh realistico tra due campioni consecutivi (ciclismo ~1 Hz)
    const HEAD_SAMPLES = Math.min(90, Math.floor(n * 0.08));  // primi ~90 s o 8% attività
    const TAIL_SAMPLES = Math.min(90, Math.floor(n * 0.08));

    // 1) Leading zeros / valori nulli
    let firstValid = -1;
    for (let i = 0; i < n; i++) {
        if (cleaned[i] > 1) { firstValid = i; break; }
    }
    if (firstValid > 0) {
        for (let i = 0; i < firstValid; i++) cleaned[i] = cleaned[firstValid];
    }

    // 2a) Salto di calibrazione in testa
    let bestJumpIdx = -1;
    let bestJumpAbs = 0;
    for (let i = 1; i < HEAD_SAMPLES; i++) {
        const jump = Math.abs(cleaned[i] - cleaned[i - 1]);
        if (jump > bestJumpAbs) {
            bestJumpAbs = jump;
            bestJumpIdx = i;
        }
    }
    if (bestJumpIdx > 0 && bestJumpAbs >= CALIB_JUMP_M) {
        // La quota DOPO il salto è quella affidabile (barometro lock) →
        // riscrivi tutto ciò che viene prima con cleaned[bestJumpIdx]
        const stable = cleaned[bestJumpIdx];
        for (let i = 0; i < bestJumpIdx; i++) cleaned[i] = stable;
    }

    // 2b) Salto di calibrazione in coda
    bestJumpIdx = -1;
    bestJumpAbs = 0;
    for (let i = n - TAIL_SAMPLES; i < n; i++) {
        if (i < 1) continue;
        const jump = Math.abs(cleaned[i] - cleaned[i - 1]);
        if (jump > bestJumpAbs) {
            bestJumpAbs = jump;
            bestJumpIdx = i;
        }
    }
    if (bestJumpIdx > 0 && bestJumpAbs >= CALIB_JUMP_M) {
        // La quota PRIMA del salto è affidabile → propaga in avanti
        const stable = cleaned[bestJumpIdx - 1];
        for (let i = bestJumpIdx; i < n; i++) cleaned[i] = stable;
    }

    // 3) Cap salti consecutivi irrealistici (tutto il percorso)
    for (let i = 1; i < n; i++) {
        const delta = cleaned[i] - cleaned[i - 1];
        if (Math.abs(delta) > MAX_STEP_M) {
            cleaned[i] = cleaned[i - 1];
        }
    }

    return cleaned;
}

function smooth(data, windowSize = 7) {
    const result = [];
    const half = Math.floor(windowSize / 2);
    for (let i = 0; i < data.length; i++) {
        let sum = 0;
        let count = 0;
        for (let j = -half; j <= half; j++) {
            const idx = i + j;
            if (idx >= 0 && idx < data.length) {
                sum += data[idx];
                count++;
            }
        }
        result.push(sum / count);
    }
    return result;
}

function hasValidStream(streamName) {
    const stream = icu.streams.get(streamName);
    return stream && Array.isArray(stream.data) && stream.data.some(v => v != null);
}

function getStreamData(streamName) {
    const stream = icu.streams.get(streamName);
    return stream && stream.data
        ? stream.data.map(v => v ?? 0)
        : Array(icu.streams.get("time").data.length).fill(0);
}

function formatThousands(n) {
    return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

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


// ─── STREAMS ─────────────────────────────────────────────────
let altitudeRaw = hasValidStream("Altitude") ? getStreamData("Altitude") : getStreamData("fixed_altitude");
// Fix artefatti Wahoo (inizio/fine) + spike isolati
altitudeRaw = fixWahooAltitudeArtifacts(altitudeRaw);
altitudeRaw = cleanAltitudeSpikes(altitudeRaw);

const gradeRaw = getStreamData("grade_smooth");

const altitude = smooth(altitudeRaw, 15);
const grade = smooth(gradeRaw, 15);

const distance = getStreamData("distance");
const distanceKm = distance.map(d => d / 1000);

const power = getStreamData("fixed_watts");
const heartrate = getStreamData("fixed_heartrate");
const time = getStreamData("time");

const cadence = hasValidStream("cadence") ? getStreamData("cadence") : Array(time.length).fill(0);
const speed = hasValidStream("velocity_smooth") ? getStreamData("velocity_smooth") : Array(time.length).fill(0);

const minX = 0;
const maxX = Math.max(...distanceKm);


// ─── CLIMB DETECTION (prominenza) ─────────────────────────────
const { sections, climbs } = detectClimbsByProminence(altitudeRaw, distance, CLIMB_PARAMS);


// ─── TRACES & ANNOTATIONS ────────────────────────────────────
let traces = [];
let climbNo = 0;

const minAlt = Math.min(...altitude);
const maxAlt = Math.max(...altitude);
const range = maxAlt - minAlt;

const FORCE_Y_LIMIT = 350;

let yMin = minAlt - range * MIN_PADDING_RATIO;
let yMax = maxAlt + range * MAX_PADDING_RATIO;

if (maxAlt <= FORCE_Y_LIMIT) {
    yMin = Math.max(0, minAlt - range * 0.15);
    yMax = FORCE_Y_LIMIT;
}

// ─── ELEVATION GAIN ──────────────────────────────────────────
let totalElevationGain = icu.activity?.total_elevation_gain 
    ?? icu.activity?.elev_gain 
    ?? icu.activity?.totalElevationGain;

if (!totalElevationGain || totalElevationGain < 50) {
    totalElevationGain = altitudeRaw.reduce((sum, h, i) => {
        if (i === 0) return 0;
        const diff = h - altitudeRaw[i - 1];
        return diff > 0 ? sum + diff : sum;
    }, 0);
}

const avgHR = heartrate.reduce((a, b) => a + b, 0) / heartrate.length;
const avgSpeed = (speed.reduce((a, b) => a + b, 0) / speed.length) * 3.6;
const validCadence = cadence.filter(c => c > 0);
const avgPower = power.reduce((a, b) => a + b, 0) / power.length;
const avgCadence = validCadence.length ? validCadence.reduce((a, b) => a + b, 0) / validCadence.length : 0;

climbs.forEach(climb => {
    const startIndex = sections[climb.startSegment].startIndex;
    const endIndex = sections[climb.endSegment].endIndex;
    const climbSections = sections.slice(climb.startSegment, climb.endSegment + 1);
    const totalDist = climbSections.reduce((s, x) => s + x.distance, 0);

    const climbElevation = altitudeRaw[endIndex] - altitudeRaw[startIndex];
    const climbDistance = totalDist;
    const avgGrade = climbDistance > 0 ? (climbElevation / climbDistance) * 100 : 0;
    // Score originale CLIM2: dist (m) × grade (%)
    const score = totalDist * avgGrade;

    if (score < CLIMB_PARAMS.minDifficulty || score < 1500) return;
    if (avgGrade < CLIMB_PARAMS.minAvgGrade) return;
    if (totalDist < CLIMB_PARAMS.minSegments * SECTION_LENGTH) return;

    climbNo++;

    let category = "UNCATEGORIZED";
    let bgColor = T.climb_uncat;

    if (score >= 80000)      { category = "HC";               bgColor = T.climb_hc; }
    else if (score >= 64000) { category = "1<sup>st</sup> CATEGORY"; bgColor = T.climb_cat1; }
    else if (score >= 32000) { category = "2<sup>nd</sup> CATEGORY"; bgColor = T.climb_cat2; }
    else if (score >= 16000) { category = "3<sup>rd</sup> CATEGORY"; bgColor = T.climb_cat3; }
    else if (score >= 8000)  { category = "4<sup>th</sup> CATEGORY"; bgColor = T.climb_cat4; }
    else if (score >= 3000)  { category = "5<sup>th</sup> CATEGORY"; bgColor = T.climb_cat5; }

    const climbTime = time[endIndex] - time[startIndex];
    const climbPowers = power.slice(startIndex, endIndex);
    const climbHR = heartrate.slice(startIndex, endIndex);
    const climbCadence = cadence.slice(startIndex, endIndex);
    const climbSpeed = speed.slice(startIndex, endIndex);

    const avgPowerClimb = climbPowers.length ? climbPowers.reduce((a, b) => a + b, 0) / climbPowers.length : 0;
    const avgHRClimb = climbHR.length ? climbHR.reduce((a, b) => a + b, 0) / climbHR.length : 0;
    const avgCadenceClimb = climbCadence.length ? climbCadence.reduce((a, b) => a + b, 0) / climbCadence.length : 0;
    const maxHR = climbHR.length ? Math.max(...climbHR) : 0;
    const maxCAD = climbCadence.length ? Math.max(...climbCadence) : 0;
    const avgSpeedClimb = climbSpeed.length ? (climbSpeed.reduce((a, b) => a + b, 0) / climbSpeed.length) * 3.6 : 0;
    const np = climbPowers.length
        ? Math.pow(climbPowers.reduce((s, p) => s + Math.pow(p, 4), 0) / climbPowers.length, 1 / 4)
        : 0;
    const maxGrade = Math.max(...grade.slice(startIndex, endIndex + 1));
    const vam = climbTime > 0 ? ((altitudeRaw[endIndex] - altitudeRaw[startIndex]) / climbTime) * 3600 : 0;

    traces.push({
        x: distanceKm.slice(startIndex, endIndex),
        y: altitude.slice(startIndex, endIndex),
        type: 'scatter',
        mode: 'lines',
        line: { color: bgColor, width: 3 },
        name: `Climb ${climbNo}`,
        hovertemplate: `<span style="color: ${T.hover_climb_t};font-weight:600;letter-spacing:0.2px;">${category} CLIMB<br></span>` +
            `<span style="color:${bgColor}">Score:</span> <span style="color: ${T.hover_climb}">${formatThousands(score)}<br></span>` +
            `<span style="color:${bgColor}">Time:</span> <span style="color: ${T.hover_climb}">${formatTime(climbTime)}<br></span>` +
            `<span style="color:${bgColor}">Distance:</span> <span style="color: ${T.hover_climb}">${totalDist < 1000 ? `${totalDist.toFixed(0)} m` : `${(totalDist / 1000).toFixed(2)} km`} (${climbElevation.toFixed(0)} Vm)<br></span>` +
            `<span style="color:${bgColor}">VAM:</span> <span style="color: ${T.hover_climb}">${vam.toFixed(0)} Vm/h<br></span>` +
            `<span style="color:${bgColor}">Speed:</span> <span style="color: ${T.hover_climb}">${avgSpeedClimb.toFixed(1)} km/h<br></span>` +
            `<span style="color:${bgColor}">Power:</span> <span style="color: ${T.hover_climb}">${avgPowerClimb.toFixed(0)} W (NP ${np.toFixed(0)} W)<br></span>` +
            `<span style="color:${bgColor}">Cadence:</span> <span style="color: ${T.hover_climb}">${avgCadenceClimb.toFixed(0)} rpm (max. ${maxCAD.toFixed(0)})<br></span>` +
            `<span style="color:${bgColor}">HR:</span> <span style="color: ${T.hover_climb}">${avgHRClimb.toFixed(0)} bpm (max. ${maxHR.toFixed(0)} bpm)<br></span>` +
            `<span style="color:${bgColor}">Grade:</span> <span style="color: ${T.hover_climb}">${avgGrade.toFixed(1)} % (max. ${maxGrade.toFixed(1)} %)<extra></extra></span>`
    });
});

// Base profile
traces.unshift({
    x: distanceKm,
    y: altitude,
    type: 'scatter',
    mode: 'lines',
    fill: 'tozeroy',
    fillcolor: T.base_fill,
    line: {
        color: T.base_line,
        width: 1.5,
        shape: 'spline',
        smoothing: 1.0
    },
    hoverinfo: 'text',
    name: 'Profil',
    text: distanceKm.map((d, i) =>
        `<span style="color: ${T.hover_sum_t}">Time:</span> <span style="color: ${T.hover_sum}">${formatTime(time[i])}<br></span>` +
        `<span style="color: ${T.hover_sum_t}">Distance:</span> <span style="color: ${T.hover_sum}">${d.toFixed(2)} km<br></span>` +
        `<span style="color: ${T.hover_sum_t}">Grade:</span> <span style="color: ${T.hover_sum}">${grade[i].toFixed(0)} %<br></span>` +
        `<span style="color: ${T.hover_sum_t}">Altitude:</span> <span style="color: ${T.hover_sum}">${altitude[i].toFixed(0)} m</span>`
    )
});

// Max / Min / Start / Stop points
const maxAltIndex = altitude.indexOf(maxAlt);
const minAltIndex = altitude.indexOf(minAlt);

traces.push({ x: [distanceKm[maxAltIndex]], y: [maxAlt + range * 0.009], type: 'scatter', mode: 'markers', marker: { size: 7, color: T.max_point, symbol: 'triangle-down' }, hoverinfo: 'skip' });
traces.push({ x: [distanceKm[minAltIndex]], y: [minAlt + range * 0.009], type: 'scatter', mode: 'markers', marker: { size: 7, color: T.min_point, symbol: 'triangle-down' }, hoverinfo: 'skip' });
traces.push({ x: [minX], y: [altitude[0]], type: 'scatter', mode: 'markers', marker: { size: 10, color: T.start_point, symbol: 'circle' }, hoverinfo: 'skip' });
traces.push({ x: [maxX], y: [altitude[altitude.length - 1]], type: 'scatter', mode: 'markers', marker: { size: 10, color: T.stop_point, symbol: 'circle' }, hoverinfo: 'skip' });

let dtickValue;
const yRange = yMax - yMin;

if (maxAlt <= FORCE_Y_LIMIT) {
    if (yRange > 250) {
        dtickValue = 50;
    } else {
        dtickValue = 25;
    }
} else {
    if (yRange > 1500) {
        dtickValue = 500;
    } else if (yRange > 800) {
        dtickValue = 200;
    } else if (yRange > 400) {
        dtickValue = 100;
    } else if (yRange > 200) {
        dtickValue = 50;
    } else {
        dtickValue = 25;
    }
}

dtickValue = Math.max(25, Math.round(dtickValue / 25) * 25);

// Layout
layout = {
    title: {
        text: 'Climb Analysis',
        font: { color: T.title_color, size: 18 }
    },
    paper_bgcolor: T.paper_bgcolor,
    plot_bgcolor: T.plot_bgcolor,
    font: { color: T.font_color, size: 14 },
    margin: { t: 120, b: 45, l: 60, r: 10 },
    hoverlabel: {
        font: { color: THEME_MODE === 'dark' ? "white" : "#1f2937", size: 13 },
        bgcolor: T.paper_bgcolor,
        bordercolor: T.hover_border
    },
    xaxis: {
        title: { text: 'Distance [km]', font: { size: 14, color: T.axis_color } },
        color: T.axis_color,
        tickcolor: T.axis_color,
        linecolor: T.axis_color,
        gridcolor: T.grid_color,
        range: [minX, maxX],
        ticks: 'outside',
        ticklen: 3,
        tickwidth: 0.5,
        tickmode: "array",
        tickvals: [...Array.from({length: Math.floor(maxX/5)+1}, (_,i)=>i*5)],
        ticktext: [...Array.from({length: Math.floor(maxX/5)+1}, (_,i)=> (i*5).toFixed(0))],
        showline: true,
        showgrid: true,
        zeroline: false
    },

    yaxis: {
    title: { text: 'Altitude [m]', font: { size: 14, color: T.axis_color } },
    color: T.axis_color,
    tickcolor: T.axis_color,
    linecolor: T.axis_color,
    gridcolor: T.grid_color,

    range: [yMin, yMax],

    ticks: 'outside',
    ticklen: 3,
    tickwidth: 0.5,

    tickmode: "linear",
    dtick: dtickValue,

    showline: true,
    showgrid: true,
    zeroline: false
},
    annotations: [
        {
            x: 0.5, y: 1.12, xref: "paper", yref: "paper",
            showarrow: false, align: "center",
            font: { size: 12, color: T.annotation },
            text: `<b><span style='color:${T.legend}; font-size: 15px;'>Climb categories (score): </span></b>` +
                  `<span style='color:${T.climb_hc}'>HC (&gt; 80.000)</span> | ` +
                  `<span style='color:${T.climb_cat1}'>Cat 1 (64.000-80.000)</span> | ` +
                  `<span style='color:${T.climb_cat2}'>Cat 2 (32.000-64.000)</span> | ` +
                  `<span style='color:${T.climb_cat3}'>Cat 3 (16.000-32.000)</span> | ` +
                  `<span style='color:${T.climb_cat4}'>Cat 4 (8.000-16.000)</span> | ` +
                  `<span style='color:${T.climb_cat5}'>Cat 5 (3.000-8.000)</span> | ` +
                  `<span style='color:${T.climb_uncat}'>Uncategorized (1.500-3.000)</span>`
        },
        {
            x: 0, y: 1.35, xref: "paper", yref: "paper",
            xanchor: "left", yanchor: "top",
            showarrow: false, align: "left",
            font: { size: 12.5, color: T.annotation },
            text: `<b><span style='color: ${T.summary}; font-size: 15px;'>Ride summary</span></b><br>` +
                  `Distance: ${(maxX).toFixed(2)} km<br>` +
                  `Elevation gain: ${totalElevationGain.toFixed(0)} m<br>` +
                  `Avg. power: ${avgPower.toFixed(0)} W<br>` +
                  `Avg. HR: ${avgHR.toFixed(0)} bpm<br>` +
                  `Avg. speed: ${avgSpeed.toFixed(1)} km/h<br>` +
                  `Avg. cadence: ${avgCadence.toFixed(0)} rpm`
        }
    ],
    hovermode: 'x unified',
    showlegend: false
};

// ─── HORIZONTAL DASHED LINES + CLEAN MIN/MAX LABELS ─────────────
layout.shapes = [
    // Max altitude line
    {
        type: 'line',
        x0: minX,
        y0: maxAlt,
        x1: distanceKm[maxAltIndex],
        y1: maxAlt,
        line: { color: T.max_point, width: 1.0, dash: 'dot' },
        opacity: 0.65,
        layer: 'below'
    },
    // Min altitude line
    {
        type: 'line',
        x0: minX,
        y0: minAlt,
        x1: distanceKm[minAltIndex],
        y1: minAlt,
        line: { color: T.min_point, width: 1.0, dash: 'dot' },
        opacity: 0.65,
        layer: 'below'
    }
];

layout.annotations.push(
    {
        xref: 'paper',
        yref: 'y',
        x: 0.001,
        y: maxAlt,
        xanchor: 'left',
        yanchor: 'bottom',
        yshift: 3,
        text: `Maximum altitude: <b>${maxAlt.toFixed(0)} m</b>`,
        font: { color: T.max_point, size: 13 },
        showarrow: false,
        bordercolor: T.max_point,
        borderwidth: 0,
        borderpad: 0
    },
    {
        xref: 'paper',
        yref: 'y',
        x: 0.001,
        y: minAlt,
        xanchor: 'left',
        yanchor: 'bottom',
        yshift: 3,
        text: `Minimum altitude: <b>${minAlt.toFixed(0)} m</b>`,
        font: { color: T.min_point, size: 13 },
        showarrow: false,
        bordercolor: T.min_point,
        borderwidth: 0,
        borderpad: 0
    }
);

const result = { data: traces, layout: layout };

result;
}

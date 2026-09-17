(() => {
// =====================================================
// HR media in Z1/Z2 power – COMPROMESSO
// Potenza media 20s + ≥40"/60" + lag HR 15s
// Colori basati su media 20s (stesso metodo del calcolo)
// =====================================================
const COLORI = {
    ALT: '#e2dedeff', FILL: '#e2dedeff',
    Z1: '#4fc3f7',
    Z2: '#1a9e3a',
    SOPRA: '#fa0710',
    COAST: '#a8d5f0',
    BANDA_Z1: 'rgba(79,195,247,0.18)',
    BANDA_Z2: 'rgba(26,158,58,0.18)'
};
const fmt = (n, d = 0) => Number(n).toFixed(d);
const fmtTime = (sec) => {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
};
function getStream(name) {
    const s = icu.streams.get(name);
    return s?.data ? s.data.map(v => v ?? 0) : [];
}
const alt_raw  = getStream("fixed_altitude");
const dist_raw = getStream("distance");
const time_raw = getStream("time");
const pwr_raw  = getStream("fixed_watts");
const hr_raw   = getStream("fixed_heartrate");
const STEP = 5;
let alt = [], dist = [], time = [], pwr = [], hr = [], distKm = [];
for (let i = 0; i < time_raw.length; i++) {
    if (i === 0 || (time_raw[i] - time_raw[0]) % STEP === 0) {
        alt.push(alt_raw[i]);
        dist.push(dist_raw[i]);
        time.push(time_raw[i]);
        pwr.push(pwr_raw[i]);
        hr.push(hr_raw[i]);
        distKm.push(dist_raw[i] / 1000);
    }
}
let mov = [0];
for (let i = 1; i < time.length; i++) {
    const dt = time[i] - time[i - 1];
    const v  = dt > 0 ? ((distKm[i] - distKm[i - 1]) * 3600) / dt : 0;
    mov.push(v > 1 ? mov[i - 1] + dt : mov[i - 1]);
}
const first = alt.find(v => v > 0);
if (first) {
    for (let i = 0; i < alt.length && alt[i] === 0; i++) alt[i] = first;
}

// --- Y-AXIS LOGIC ---
const minAlt = Math.min(...alt);
const maxAlt = Math.max(...alt);
const elevationGain = maxAlt - minAlt;
const paddingTop    = 300;
const paddingBottom = minAlt >= 100 ? 80 : Math.max(0, minAlt * 0.5);
const rangeY_base   = Math.max(elevationGain * 1.5, elevationGain + 300);
const rangeY_final  = rangeY_base + paddingBottom + paddingTop;
const roundTo       = 50;
const yMin          = Math.floor((minAlt - paddingBottom) / roundTo) * roundTo;
const yMaxRaw       = Math.ceil((yMin + rangeY_final) / roundTo) * roundTo;
const yMaxCap       = Math.ceil((maxAlt + paddingTop) / roundTo) * roundTo;
const yMax          = Math.min(yMaxRaw, yMaxCap);

const settings = icu.sportSettings;
const pz = settings.power_zones || [55, 75, 90, 105, 120, 150];
let z1h = pz[0], z2h = pz[1];
const ftp = icu.activity.icu_ftp || settings.ftp;
if (ftp && z2h < 300) {
    z1h = z1h / 100 * ftp;
    z2h = z2h / 100 * ftp;
}
const peso = icu.activity.icu_weight || 70;

function powerColor(w) {
    if (w < 10) return COLORI.COAST;
    if (w < z1h) return COLORI.Z1;
    if (w < z2h) return COLORI.Z2;
    return COLORI.SOPRA;
}

function hoverTextColor(w) {
    return '#000000';
}

// ---------- Parametri smoothing ----------
const PWR_AVG_SEC = 20;
const PWR_AVG_PTS = Math.round(PWR_AVG_SEC / STEP);
const WIN_SEC     = 60;
const WIN_PTS     = Math.round(WIN_SEC / STEP);
const MIN_IN_ZONE = Math.round(40 / STEP);
const LAG_SEC     = 15;
const LAG_PTS     = Math.round(LAG_SEC / STEP);

// Potenza media mobile 20s
const pwrAvg = pwr.map((_, i) => {
    let s = 0, n = 0;
    const from = Math.max(0, i - PWR_AVG_PTS + 1);
    for (let j = from; j <= i; j++) { s += pwr[j]; n++; }
    return n ? s / n : 0;
});

const kJ_cum = [], kJ_over = [];
let kJs = 0, kJo = 0;
for (let i = 0; i < pwr.length; i++) {
    if (i > 0) {
        const dt = time[i] - time[i - 1];
        if (dt < 30) {
            kJs += pwr[i] * dt / 1000;
            if (pwr[i] >= (ftp || 9999)) kJo += pwr[i] * dt / 1000;
        }
    }
    kJ_cum.push(kJs);
    kJ_over.push(kJo);
}

const ORA = 3600;
const sezIdx = [];
let h = 1;
for (let i = 1; i < mov.length; i++) {
    if (mov[i] >= h * ORA) {
        sezIdx.push(i);
        h++;
    }
}
if (!sezIdx.length || sezIdx[sezIdx.length - 1] < mov.length - 1) {
    sezIdx.push(mov.length - 1);
}

function isValidWindow(startIdx, low, high) {
    let inZone = 0;
    const end = Math.min(startIdx + WIN_PTS, pwrAvg.length);
    for (let i = startIdx; i < end; i++) {
        if (pwrAvg[i] >= low && pwrAvg[i] < high) inZone++;
    }
    return inZone >= MIN_IN_ZONE;
}

const sezioni = sezIdx.map((end, s) => {
    const start = s === 0 ? 0 : sezIdx[s - 1];
    let sum1 = 0, n1 = 0, sum2 = 0, n2 = 0;
    for (let i = start; i <= end - WIN_PTS; i++) {
        let hs = 0, hc = 0;
        for (let j = i; j < i + WIN_PTS; j++) {
            const hi = j + LAG_PTS;
            if (hi < hr.length && hr[hi]) { hs += hr[hi]; hc++; }
        }
        const hAvg = hc ? hs / hc : null;
        if (hAvg == null) continue;
        if (isValidWindow(i, 10, z1h)) {
            sum1 += hAvg; n1++;
        }
        if (isValidWindow(i, z1h, z2h)) {
            sum2 += hAvg; n2++;
        }
    }
    const durataSec = mov[end] - (s === 0 ? 0 : mov[start]);
    return {
        x0: s === 0 ? 0 : mov[start],
        x1: mov[end],
        durataSec,
        avg1: n1 ? sum1 / n1 : null,
        avg2: n2 ? sum2 / n2 : null,
        sec1: n1 * STEP,
        sec2: n2 * STEP,
        pct1: durataSec > 0 ? (n1 * STEP) / durataSec : 0,
        pct2: durataSec > 0 ? (n2 * STEP) / durataSec : 0
    };
});

// Traccia base
const data = [{
    x: mov, y: alt,
    text: alt.map((a, i) => {
        const t = time[i] || 0;
        const tempo = `${String(Math.floor(t/3600)).padStart(2,'0')}:${String(Math.floor((t/60)%60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;
        const mt = mov[i] || 0;
        const mtStr = `${String(Math.floor(mt/3600)).padStart(2,'0')}:${String(Math.floor((mt/60)%60)).padStart(2,'0')}:${String(Math.floor(mt%60)).padStart(2,'0')}`;
        const w20 = pwrAvg[i] || 0;
        const vel = mt > 0 ? distKm[i] / (mt / 3600) : 0;
        const kJ = kJ_cum[i] || 0, kJo = kJ_over[i] || 0;
        let kh = 0, kho = 0, kkg = 0, kkgo = 0;
        if (peso > 0) {
            kkg = kJ / peso;
            kkgo = kJo / peso;
            if (t > 0) {
                const hrs = t / 3600;
                kh = kkg / hrs;
                kho = kkgo / hrs;
            }
        }
         return `⏱️ ${tempo} | ${mtStr}` +
               `<br>📏 ${fmt(distKm[i],2)} km | 🏔️ ${fmt(a,0)} m` +
               `<br>⚡ ${fmt(w20,0)}W ⏳20” | ❤️ ${fmt(hr[i],0)} bpm` +
               `<br>🚴‍♂️ ${fmt(vel,1)} km/h` +
               `<br>🔋 ${fmt(kJ,0)} kJ | ${fmt(kJo,0)} kJ > CP` +
               `<br>⚖️ ${fmt(kkg,1)} kJ/kg | ${fmt(kkgo,1)} kJ/kg > CP` +
             `<br>🔥 ${fmt(kh,1)} kJ/h/kg | ${fmt(kho,1)} kJ/h/kg > CP`;
    }),
    hoverinfo: 'text',
    hoverlabel: { bgcolor: pwrAvg.map(powerColor), bordercolor: '#ffffff', font: { color: pwrAvg.map(hoverTextColor) } },
    fill: 'tozeroy',
    type: 'scatter',
    fillcolor: COLORI.FILL,
    line: { width: 0 },
    mode: 'none',
    yaxis: 'y1',
    showlegend: false
}];

// Colorazione basata su media 20s
function colorSeg(cond, col) {
    const tr = [];
    for (let i = 1; i < pwrAvg.length; i++) {
        if (cond(pwrAvg[i-1]) || cond(pwrAvg[i])) {
            tr.push({
                x: [mov[i-1], mov[i]],
                y: [alt[i-1], alt[i]],
                type: 'scatter',
                mode: 'lines',
                line: { color: col, width: 4 },
                yaxis: 'y1',
                showlegend: false,
                hoverinfo: 'skip'
            });
        }
    }
    return tr;
}
data.push(...colorSeg(w => w < 10, COLORI.COAST));
data.push(...colorSeg(w => w >= 10 && w < z1h, COLORI.Z1));
data.push(...colorSeg(w => w >= z1h && w < z2h, COLORI.Z2));
data.push(...colorSeg(w => w >= z2h, COLORI.SOPRA));

sezioni.forEach(s => {
    if (s.avg1 != null) {
        data.push({
            x: [s.x0, s.x1], y: [s.avg1, s.avg1],
            type: 'scatter', mode: 'lines',
            line: { color: COLORI.Z1, width: 4 },
            yaxis: 'y2', showlegend: false,
            hovertemplate: `Z1 power → HR <b>${fmt(s.avg1,0)} bpm</b><br>⏱️ ${fmtTime(s.sec1)}<extra></extra>`
        });
    }
    if (s.avg2 != null) {
        data.push({
            x: [s.x0, s.x1], y: [s.avg2, s.avg2],
            type: 'scatter', mode: 'lines',
            line: { color: COLORI.Z2, width: 4 },
            yaxis: 'y2', showlegend: false,
            hovertemplate: `Z2 power → HR <b>${fmt(s.avg2,0)} bpm</b><br>⏱️ ${fmtTime(s.sec2)}<extra></extra>`
        });
    }
});
const shapes = [];
sezioni.forEach(s => {
    if (s.pct1 > 0.02) {
        shapes.push({
            type: 'rect', xref: 'x', yref: 'paper',
            x0: s.x0, x1: s.x0 + (s.x1 - s.x0) * s.pct1,
            y0: 0, y1: 1,
            fillcolor: COLORI.BANDA_Z1, line: { width: 0 }, layer: 'below'
        });
    }
    if (s.pct2 > 0.02) {
        const xs = s.x0 + (s.x1 - s.x0) * s.pct1;
        shapes.push({
            type: 'rect', xref: 'x', yref: 'paper',
            x0: xs, x1: xs + (s.x1 - s.x0) * s.pct2,
            y0: 0, y1: 1,
            fillcolor: COLORI.BANDA_Z2, line: { width: 0 }, layer: 'below'
        });
    }
});
sezIdx.forEach(idx => {
    shapes.push({
        type: 'line', xref: 'x', yref: 'paper',
        x0: mov[idx], x1: mov[idx], y0: 0, y1: 1,
        line: { color: '#999', width: 1, dash: 'dot' }
    });
});
const annotations = [];
const LABEL_SHIFT = 18;
const LABEL_GAP = 10;
function labelShifts(avg1, avg2) {
    if (avg1 == null) return { avg1: null, avg2: LABEL_SHIFT };
    if (avg2 == null) return { avg1: LABEL_SHIFT, avg2: null };
    if (Math.abs(avg1 - avg2) < LABEL_GAP) {
        return avg1 < avg2
            ? { avg1: -LABEL_SHIFT, avg2: LABEL_SHIFT }
            : { avg1: LABEL_SHIFT, avg2: -LABEL_SHIFT };
    }
    return { avg1: LABEL_SHIFT, avg2: LABEL_SHIFT };
}
sezioni.forEach(s => {
    const mid = (s.x0 + s.x1) / 2;
    const shifts = labelShifts(s.avg1, s.avg2);
    if (s.avg1 != null) {
        annotations.push({
            x: mid, y: s.avg1, xref: 'x', yref: 'y2',
            text: `${fmt(s.avg1,0)} · ${fmtTime(s.sec1)}`,
            showarrow: false,
            font: { color: COLORI.Z1, size: 11, family: 'Arial Black' },
            yshift: shifts.avg1
        });
    }
    if (s.avg2 != null) {
        annotations.push({
            x: mid, y: s.avg2, xref: 'x', yref: 'y2',
            text: `${fmt(s.avg2,0)} · ${fmtTime(s.sec2)}`,
            showarrow: false,
            font: { color: COLORI.Z2, size: 11, family: 'Arial Black' },
            yshift: shifts.avg2
        });
    }
});
for (let i = 1; i < time.length; i++) {
    const dt = time[i] - time[i - 1];
    if (dt >= 300 && dt < 900) {
        annotations.push({
            x: mov[i], y: alt[i] + 70, xref: 'x', yref: 'y',
            text: '⏸️', showarrow: false,
            font: { color: '#d80000', size: 15 }, yanchor: 'middle'
        });
    } else if (dt >= 900) {
        annotations.push({
            x: mov[i], y: alt[i] + 70, xref: 'x', yref: 'y',
            text: '⏹️', showarrow: false,
            font: { color: '#d80000', size: 15 }, yanchor: 'middle'
        });
    }
}
const allHR = sezioni.flatMap(s => [s.avg1, s.avg2].filter(Boolean));
const minHR = allHR.length ? Math.min(...allHR) - 18 : 100;
const maxHR = allHR.length ? Math.max(...allHR) + 18 : 160;
return {
    data,
    layout: {
        height: 450,
        margin: { t: 35, l: 45, r: 50, b: 40 },
        title: { text: 'HR in Z1/Z2 power – 20s avg + 40"/60" + lag 15s', font: { size: 13 } },
        xaxis: {
            title: 'Tempo in movimento',
            tickvals: distKm.reduce((a, d, i) => {
                if (i === 0 || Math.floor(d / 10) > Math.floor(distKm[i - 1] / 10)) a.push(mov[i]);
                return a;
            }, []),
            ticktext: distKm.reduce((a, d, i) => {
                if (i === 0 || Math.floor(d / 10) > Math.floor(distKm[i - 1] / 10)) a.push(Math.round(d) + ' km');
                return a;
            }, [])
        },
        yaxis: {
            title: 'Altitudine (m)',
            range: [yMin, yMax]
        },
        yaxis2: {
            overlaying: 'y',
            side: 'right',
            title: 'HR (bpm)',
            range: [minHR, maxHR],
            showgrid: false
        },
        shapes,
        annotations,
        showlegend: false
    }
};
})();
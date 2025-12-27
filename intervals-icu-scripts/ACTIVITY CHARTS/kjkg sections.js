// --- CONFIGURAZIONE, COLORI, FUNZIONI E LAYOUT ---

const CONFIG = {
    KJ_KG_PER_SEZIONE: 3, // <--- Modifica qui per cambiare la dimensione delle sezioni kJ*kg
    pesoKg: icu.activity.icu_weight,
};
CONFIG.KJ_PER_SEZIONE = CONFIG.KJ_KG_PER_SEZIONE * CONFIG.pesoKg;

// --- CONFIGURAZIONE COLORI TRACCE ---
const COLORI = {
    LINEA_ALTITUDINE: '#e2dedeff',
    RIEMPIMENTO_ALTITUDINE: '#e2dedeff',
    BARRA_CP: '#c44e52',
    BARRA_CP_OPACITY: 0.4, 
    SOPRA_CP: '#fa0710ff',
    TRA_80_100: '#ffe600',
    SOTTO_80: '#24e04d',
    COASTING: '#1100ffff'
};

const fmt = (num, digits = 0) => Number(num).toFixed(digits);
function getStreamData(streamName) {
    const stream = icu.streams.get(streamName);
    return stream && stream.data ? stream.data.map(value => value ?? 0) : Array(icu.streams.get("time").data.length).fill(0);
}

// Layout base (verrà usato più sotto)
const BASE_LAYOUT = {
    height: 400,
    margin: { t: 60, l: 40, r: 20, b: 40 },
};

// Stream principali
const altitude = getStreamData("fixed_altitude");
const distance = getStreamData("distance");
const time = getStreamData("time");
const power = getStreamData("fixed_watts");
const distanceKm = distance.map(d => d / 1000);

// Calcola tempo trascorso in movimento (asse X)


// Calcola il moving time escludendo pause e micro-movimenti (velocità istantanea > 1 km/h)
let movingTime = [0];
for (let i = 1; i < time.length; i++) {
    const dt = time[i] - time[i - 1];
    const dd = distanceKm[i] - distanceKm[i-1];
    // Calcola velocità istantanea in km/h
    const v = dt > 0 ? (dd * 3600) / dt : 0;
    // Somma solo i dt dove la velocità è > 1 km/h (in movimento reale)
    if (v > 1) {
        movingTime.push(movingTime[movingTime.length - 1] + dt);
    } else {
        // Se è pausa o micro-movimento, non aggiungere nulla
        movingTime.push(movingTime[movingTime.length - 1]);
    }
}

// Calcola le posizioni delle sezioni da KJ_PER_SEZIONE (kJ assoluti) e kJ sopra CP per ciascuna
let sezioniIdx = [];
let kJAcc = 0, kJAccOverCP = 0;
let kJOverCPPerSezione = [];
for (let i = 1; i < power.length; i++) {
    const w = power[i];
    const dt = time[i] - time[i - 1];
    if (dt < 30) {
        kJAcc += w * dt / 1000;
        if (w >= icu.activity.icu_ftp) kJAccOverCP += w * dt / 1000;
    }
    if (kJAcc >= CONFIG.KJ_PER_SEZIONE) {
        sezioniIdx.push(i);
        kJOverCPPerSezione.push(kJAccOverCP);
        kJAcc = 0;
        kJAccOverCP = 0;
    }
}
// Se rimane una sezione finale non vuota, aggiungila
if (kJAcc > 0) {
    sezioniIdx.push(power.length - 1);
    kJOverCPPerSezione.push(kJAccOverCP);
}

// Correggi i valori iniziali di altitudine (sostituisci gli zeri iniziali con il primo valore non zero)
// Calcola kJ cumulativi per ogni punto
// Calcola kJ sopra CP cumulativi per ogni punto
const kJ_sopraCP_cumulativi = [];
let kJ_overCP_sum = 0;
for (let i = 1; i < power.length; i++) {
    const dt = time[i] - time[i-1];
    if (dt < 30 && power[i] >= icu.activity.icu_ftp) kJ_overCP_sum += power[i] * dt / 1000;
    kJ_sopraCP_cumulativi.push(kJ_overCP_sum);
}
const kJ_cumulativi = [];
let kJ_sum = 0;
for (let i = 1; i < power.length; i++) {
    const dt = time[i] - time[i-1];
    if (dt < 30) kJ_sum += power[i] * dt / 1000;
    kJ_cumulativi.push(kJ_sum);
}
const firstNonZeroAltitude = altitude.find(value => value !== 0);
if (firstNonZeroAltitude !== undefined) {
    for (let i = 0; i < altitude.length; i++) {
        if (altitude[i] === 0) altitude[i] = firstNonZeroAltitude;
        else break;
    }
}

// Traccia altitudine
// --- DEFINIZIONE DEI TRACES DEL GRAFICO ---
// Traccia altimetrica principale (altitudine vs tempo in movimento)
const data = [
    {
        x: movingTime,
        y: altitude,
        text: altitude.map((alt, i) => {
            // Costruisce il testo di hover con tutti i dati principali
            const timeSec = time[i] || 0;
            const sec = Math.floor(timeSec % 60);
            const min = Math.floor((timeSec / 60) % 60);
            const hr = Math.floor(timeSec / 3600);
            const tempo = `${hr.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
            // Moving time
            const movingSec = movingTime[i] || 0;
            const mSec = Math.floor(movingSec % 60);
            const mMin = Math.floor((movingSec / 60) % 60);
            const mHr = Math.floor(movingSec / 3600);
            const movingTempo = `${mHr.toString().padStart(2, '0')}:${mMin.toString().padStart(2, '0')}:${mSec.toString().padStart(2, '0')}`;
            const dist = fmt(distanceKm[i], 2);
            // Watt medi sui 10 secondi precedenti
            let watt10s = 0;
            let nWatt = 0;
            for (let j = Math.max(0, i-9); j <= i; j++) {
                watt10s += power[j];
                nWatt++;
            }
            watt10s = nWatt > 0 ? watt10s / nWatt : 0;
            // Velocità media cumulativa fino a quel punto (distanza totale / tempo totale in movimento)
            let velMedia = 0;
            if (movingTime[i] > 0) velMedia = distanceKm[i] / (movingTime[i] / 3600);

            const kJ_cum = i > 0 ? kJ_cumulativi[i-1] : 0;
            const kJ_cum_overCP = i > 0 ? kJ_sopraCP_cumulativi[i-1] : 0;
            let kJ_h_kg = 0, kJ_h_kg_overCP = 0;
            if (CONFIG.pesoKg > 0 && time[i] > 0) {
                const hours = time[i] / 3600;
                kJ_h_kg = kJ_cum / hours / CONFIG.pesoKg;
                kJ_h_kg_overCP = kJ_cum_overCP / hours / CONFIG.pesoKg;
            }
            return (
                `⏱️ ${tempo} | ${movingTempo}` +
                `<br>` +
                `📏 ${dist} km | ⚡ ${fmt(watt10s,0)}W ⏳10” ` +
                `<br>` +
                `🏔️ ${fmt(alt,0)} m | 🚴‍♂️ ${fmt(velMedia,1)} km/h` +
                `<br>` +
                `🔋 ${fmt(kJ_cum,0)} kJ | ${fmt(kJ_cum_overCP,0)} kJ > CP` +
                `<br>` +
                `🔥 ${fmt(kJ_h_kg,1)} kJ/h/kg | ${fmt(kJ_h_kg_overCP,1)} kJ/h/kg > CP`
            );
        }),
        hoverinfo: 'text',
        fill: 'tozeroy',
        type: 'scatter',
        fillcolor: COLORI.RIEMPIMENTO_ALTITUDINE,
        line: { color: COLORI.LINEA_ALTITUDINE, width: 2 },
        mode: 'lines',
        name: 'Altitudine',
        yaxis: 'y1',
        showlegend: false
    },
    // --- Barre kJ sopra CP per ogni sezione ---
    // Ogni barra rappresenta il lavoro sopra CP in una sezione (configurabile)
    {
        x: kJOverCPPerSezione.map((_, i) => {
            const prev = movingTime[sezioniIdx[i-1]||0];
            return prev + (movingTime[sezioniIdx[i]] - prev) / 2;
        }),
        y: kJOverCPPerSezione,
        type: 'bar',
        name: 'kJ',
        marker: { color: COLORI.BARRA_CP, opacity: COLORI.BARRA_CP_OPACITY },
        yaxis: 'y2',
        width: kJOverCPPerSezione.map((_, i) => {
            // Larghezza della barra = durata della sezione in secondi
            const prev = movingTime[sezioniIdx[i-1]||0];
            return (movingTime[sezioniIdx[i]] - prev);
        }),
        opacity: COLORI.BARRA_CP_OPACITY,
        showlegend: false,
        // Testo di hover: mostra kJ totali e watt medi della sezione
        hovertemplate: kJOverCPPerSezione.map((v, i) => {
            const startIdx = sezioniIdx[i-1]||0;
            const endIdx = sezioniIdx[i];
            let sommaW = 0, n = 0;
            let kJTot = 0, kJTotOverCP = 0;
            let durataSec = movingTime[endIdx] - movingTime[startIdx];
            for (let j = startIdx; j < endIdx; j++) {
                sommaW += power[j];
                n++;
                const dt = time[j] - time[j-1];
                if (dt < 30) {
                    kJTot += power[j] * dt / 1000;
                    if (power[j] >= icu.activity.icu_ftp) kJTotOverCP += power[j] * dt / 1000;
                }
            }
            const wMed = n > 0 ? Math.round(sommaW/n) : 0;
            let kJ_h_kg = 0, kJ_h_kg_overCP = 0;
            if (CONFIG.pesoKg > 0 && durataSec > 0) {
                const hours = durataSec / 3600;
                kJ_h_kg = kJTot / hours / CONFIG.pesoKg;
                kJ_h_kg_overCP = kJTotOverCP / hours / CONFIG.pesoKg;
            }
            return (
                `🔋 ${Math.round(v)} kJ<br>⚡ ${wMed}W` +
                `<br>🔥 ${kJ_h_kg.toFixed(1)} kJ/h/kg | ${kJ_h_kg_overCP.toFixed(1)} kJ/h/kg > CP<extra></extra>`
            );
        }),
    }
];

// Evidenziature stile 3m MAP: aggiungi trace per ogni intervallo continuo sopra CP
let sopraCPTraces = [];
let inInterval = false;
let startIdx = 0;
for (let i = 0; i < power.length; i++) {
    if (power[i] >= icu.activity.icu_ftp) {
        if (!inInterval) {
            inInterval = true;
            startIdx = i;
        }
    } else {
        if (inInterval) {
            // Fine intervallo sopra CP
            const x = movingTime.slice(startIdx, i);
            const y = altitude.slice(startIdx, i);
            sopraCPTraces.push({
                x: x,
                y: y,
                type: 'scatter',
                mode: 'lines',
                line: { color: '#fa0710ff', width: 4 },
                name: 'Sopra CP',
                yaxis: 'y1',
                showlegend: false,
                hoverinfo: 'skip'
            });
            inInterval = false;
        }
    }
}
// Se termina sopra CP
if (inInterval) {
    const x = movingTime.slice(startIdx);
    const y = altitude.slice(startIdx);
    sopraCPTraces.push({
        x: x,
        y: y,
        type: 'scatter',
        mode: 'lines',
        line: { color: '#fa0710ff', width: 4 },
        name: 'Sopra CP',
        yaxis: 'y1',
        showlegend: false,
        hoverinfo: 'skip'
    });
}
// Inserisci i trace sopra CP dopo la traccia altimetrica
data.splice(1, 0, ...sopraCPTraces);
// --- Nuove evidenziature per intervalli di potenza ---
// Sforzi tra 80%-100% CP (giallo)
let tra80e100Traces = [];
let in80e100 = false;
let start80e100 = 0;
const min80 = icu.activity.icu_ftp * 0.8;
for (let i = 0; i < power.length; i++) {
    if (power[i] >= min80 && power[i] < icu.activity.icu_ftp) {
        if (!in80e100) {
            in80e100 = true;
            start80e100 = i;
        }
    } else {
        if (in80e100) {
            const x = movingTime.slice(start80e100, i);
            const y = altitude.slice(start80e100, i);
            tra80e100Traces.push({
                x: x,
                y: y,
                type: 'scatter',
                mode: 'lines',
                line: { color: '#ffe600', width: 4 },
                name: '80-100% CP',
                yaxis: 'y1',
                showlegend: false,
                hoverinfo: 'skip'
            });
            in80e100 = false;
        }
    }
}
if (in80e100) {
    const x = movingTime.slice(start80e100);
    const y = altitude.slice(start80e100);
    tra80e100Traces.push({
        x: x,
        y: y,
        type: 'scatter',
        mode: 'lines',
        line: { color: '#ffe600', width: 4 },
        name: '80-100% CP',
        yaxis: 'y1',
        showlegend: false,
        hoverinfo: 'skip'
    });
}

// Sforzi sotto 80% CP (verde)
let sotto80Traces = [];
let inSotto80 = false;
let startSotto80 = 0;
for (let i = 0; i < power.length; i++) {
    if (power[i] >= 10 && power[i] < min80) {
        if (!inSotto80) {
            inSotto80 = true;
            startSotto80 = i;
        }
    } else {
        if (inSotto80) {
            const x = movingTime.slice(startSotto80, i);
            const y = altitude.slice(startSotto80, i);
            sotto80Traces.push({
                x: x,
                y: y,
                type: 'scatter',
                mode: 'lines',
                line: { color: '#24e04d', width: 4 },
                name: '<80% CP',
                yaxis: 'y1',
                showlegend: false,
                hoverinfo: 'skip'
            });
            inSotto80 = false;
        }
    }
}
if (inSotto80) {
    const x = movingTime.slice(startSotto80);
    const y = altitude.slice(startSotto80);
    sotto80Traces.push({
        x: x,
        y: y,
        type: 'scatter',
        mode: 'lines',
        line: { color: '#24e04d', width: 4 },
        name: '<80% CP',
        yaxis: 'y1',
        showlegend: false,
        hoverinfo: 'skip'
    });
}

// Coasting (<10W, blu)
let coastingTraces = [];
let inCoasting = false;
let startCoasting = 0;
for (let i = 0; i < power.length; i++) {
    if (power[i] < 10) {
        if (!inCoasting) {
            inCoasting = true;
            startCoasting = i;
        }
    } else {
        if (inCoasting) {
            const x = movingTime.slice(startCoasting, i);
            const y = altitude.slice(startCoasting, i);
            coastingTraces.push({
                x: x,
                y: y,
                type: 'scatter',
                mode: 'lines',
                line: { color: '#1100ffff', width: 4 },
                name: 'Coasting',
                yaxis: 'y1',
                showlegend: false,
                hoverinfo: 'skip'
            });
            inCoasting = false;
        }
    }
}
if (inCoasting) {
    const x = movingTime.slice(startCoasting);
    const y = altitude.slice(startCoasting);
    coastingTraces.push({
        x: x,
        y: y,
        type: 'scatter',
        mode: 'lines',
        line: { color: '#1100ffff', width: 4 },
        name: 'Coasting',
        yaxis: 'y1',
        showlegend: false,
        hoverinfo: 'skip'
    });
}

// Inserisci tutte le trace evidenziate dopo la traccia altimetrica
data.splice(1 + sopraCPTraces.length, 0, ...tra80e100Traces, ...sotto80Traces, ...coastingTraces);

// Costruisci i segmenti evidenziati sopra CP

// Annotazioni sopra l'asse X con il valore kJ di ogni sezione
// Calcola i kJ totali per ogni sezione
const kJTotaliPerSezione = sezioniIdx.map((idx, i) => {
    const startIdx = sezioniIdx[i-1]||0;
    let kJTot = 0;
    for (let j = startIdx+1; j <= idx; j++) {
        const dt = time[j] - time[j-1];
        if (dt < 30) {
            kJTot += power[j] * dt / 1000;
        }
    }
    return kJTot;
});

// Solo annotazione kJ per l'ultima sezione, posizionata in alto
// Annotazione verde in alto con i kJ totali dell'ultima sezione
let sectionAnnotations = [];
// Annotazione kJ totali ultima sezione in alto
if (kJTotaliPerSezione.length > 0) {
    const lastIdx = kJTotaliPerSezione.length - 1;
    const prev = movingTime[sezioniIdx[lastIdx-1]||0];
    const x = prev + (movingTime[sezioniIdx[lastIdx]] - prev) / 2;
    sectionAnnotations.push({
        x: x,
        y: 0.98,
        xref: 'x',
        yref: 'paper',
        text: `${fmt(kJTotaliPerSezione[lastIdx],0)} kJ`,
        showarrow: false,
        yanchor: 'top',
        font: { color: '#24e04dff', size: 16, family: 'Arial', weight: 'bold' },
        align: 'center',
        yshift: 0
    });
}
// Etichette delle barre ai piedi (base, sopra asse x)
for (let i = 0; i < kJOverCPPerSezione.length; i++) {
    const prev = movingTime[sezioniIdx[i-1]||0];
    const x = prev + (movingTime[sezioniIdx[i]] - prev) / 2;
    const start = movingTime[sezioniIdx[i-1]||0];
    const end = movingTime[sezioniIdx[i]];
    const durataSec = end - start;
    const min = Math.floor(durataSec / 60);
    const sec = Math.round(durataSec % 60);
    const percent = Math.round(kJOverCPPerSezione[i] / CONFIG.KJ_PER_SEZIONE * 100);
    sectionAnnotations.push({
        x: x,
        y: 0,
        xref: 'x',
        yref: 'y2',
        text: `${min}:${sec.toString().padStart(2,'0')}\n${percent}%`,
        showarrow: false,
        yanchor: 'bottom',
        font: { color: '#000', size: 13, family: 'Arial Black', weight: 'bold' },
        align: 'center',
        yshift: 2
    });
}

// Crea le shapes verticali per le sezioni (linee verdi continue, poco spesse)
const shapesVerticali = sezioniIdx.map(idx => ({
    type: 'line',
    xref: 'x',
    yref: 'paper',
    x0: movingTime[idx],
    x1: movingTime[idx],
    y0: 0,
    y1: 1,
    line: {
        color: '#24e04dff', // verde
        width: 1,
        dash: 'solid'
    }
}));

// Segnalini pause superiori a 5 minuti (dt >= 300): emoji ⏸️ posizionata appena sotto la traccia altimetrica
const pauseAnnotations = [];
for (let i = 1; i < time.length; i++) {
    const dt = time[i] - time[i - 1];
    if (dt >= 300 && dt < 900) { // tra 5 e 15 minuti
        pauseAnnotations.push({
            x: movingTime[i],
            y: altitude[i] + 70,
            xref: 'x',
            yref: 'y',
            text: '⏸️',
            showarrow: false,
            font: { color: '#d80000', size: 15, family: 'Arial' },
            yanchor: 'middle',
            align: 'center',
            yshift: 0
        });
    } else if (dt >= 900) { // sopra 15 minuti
        pauseAnnotations.push({
            x: movingTime[i],
            y: altitude[i] + 70,
            xref: 'x',
            yref: 'y',
            text: '⏹️',
            showarrow: false,
            font: { color: '#d80000', size: 15, family: 'Arial' },
            yanchor: 'middle',
            align: 'center',
            yshift: 0
        });
    }
}

// ...

const layout = {
    ...BASE_LAYOUT,
    title: `${CONFIG.KJ_KG_PER_SEZIONE} kJ*kg sections (${fmt(CONFIG.KJ_PER_SEZIONE,0)} kJ)`,
    xaxis: {
        title: 'Tempo in movimento (s)',
        // Mostra tick ogni 10 km
        tickvals: (() => {
            const vals = [];
            for (let i = 0; i < distanceKm.length; i++) {
                if (i === 0 || Math.floor(distanceKm[i] / 10) > Math.floor(distanceKm[i - 1] / 10)) {
                    vals.push(movingTime[i]);
                }
            }
            return vals;
        })(),
        ticktext: (() => {
            const texts = [];
            for (let i = 0; i < distanceKm.length; i++) {
                if (i === 0 || Math.floor(distanceKm[i] / 10) > Math.floor(distanceKm[i - 1] / 10)) {
                    texts.push(Math.round(distanceKm[i]) + ' km');
                }
            }
            return texts;
        })(),
        hoverformat: '',
    },
    yaxis: {
        title: 'Altitudine (m)',
        range: [0, Math.max(...altitude, 1) * 1.05 + 50] // aggiungi margine sopra
    },
    yaxis2: {
        overlaying: 'y',
        side: 'right',
        showgrid: false,
        zeroline: false,
        visible: true,
        title: 'kJ',
        color: COLORI.BARRA_CP,
        tickfont: { color: COLORI.BARRA_CP },
        titlefont: { color: COLORI.BARRA_CP },
        rangemode: 'tozero',
        range: [0, CONFIG.KJ_PER_SEZIONE]
    },
    shapes: [...shapesVerticali],
    annotations: [...sectionAnnotations, ...pauseAnnotations]
};

const chart = { data, layout };
chart;
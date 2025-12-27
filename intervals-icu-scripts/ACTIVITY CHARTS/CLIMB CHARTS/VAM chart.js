{
  // --- CONFIGURAZIONE INIZIALE ---
  const CONFIG = {

    // Colori
    COLOR_LINE: '#365A98',         // Colore della linea principale
    COLOR_MARKER: '#365A98',       // Colore dei marker

    // Marker
    MARKER_SYMBOL: 'circle',       // Simbolo marker (Plotly symbol)
    MARKER_SIZE: 8,                // Dimensione marker

    // Titoli e font
    TITLE: 'VAM Peak Chart',       // Titolo del grafico
    XAXIS_TITLE: 'Duration (min)', // Titolo asse X
    YAXIS_TITLE: 'VAM (m/h)',      // Titolo asse Y
    FONT_SIZE: 12,                 // Dimensione font tick e label
    TICKANGLE_X: -90,              // Angolo etichette asse X
    TICKANGLE_Y: 0,                // Angolo etichette asse Y

    // Margini e shape
    MARGIN: { t: 50, l: 60, r: 20, b: 100 }, // Margini del grafico
    SHAPE_WIDTH_X: 1,              // Spessore linea shape orizzontale (X)
    SHAPE_WIDTH_Y: 2,              // Spessore linea shape verticale (Y)

    // Intervalli (personalizzati)
    INTERVAL_1_STEP: 60,           // Step 1: ogni 60s
    INTERVAL_1_END: 900,           // Step 1: fino a 15' (900s)
    INTERVAL_2_STEP: 300,          // Step 2: ogni 5' (300s)
    INTERVAL_2_END: 3600,          // Step 2: fino a 60' (3600s)
    INTERVAL_3_STEP: 600,          // Step 3: ogni 10' (600s)
    INTERVAL_END: 5400             // Fine intervallo (secondi)
  };
  // --- FINE CONFIG ---

  const stream = icu.streams;
  const maxTime = icu.activity.moving_time;
  console.log(`Total moving time: ${maxTime}s`);

  // Intervalli: ogni 60s fino a 15', poi ogni 5' fino a 60', poi ogni 10' fino a INTERVAL_END
  const intervals = [];
  const end = Math.min(CONFIG.INTERVAL_END, maxTime);
  // Ogni 60s fino a 15'
  for (let s = 60; s <= Math.min(900, end); s += 60) intervals.push(s);
  // Ogni 5' (300s) da 20' a 60'
  for (let s = 1200; s <= Math.min(3600, end); s += 300) if (!intervals.includes(s)) intervals.push(s);
  // Ogni 10' (600s) da 60' a end
  for (let s = 4200; s <= end; s += 600) if (!intervals.includes(s)) intervals.push(s);
  intervals.sort((a, b) => a - b);



  // Guadagno altimetrico cumulativo (solo salite), ignorando salti anomali
  let altitude = stream.altitude;
  let time = stream.time;
  let cumulativeGain = altitude.reduce((arr, alt, i, src) => {
    if (i === 0) { arr.push(0); return arr; }
    const delta = alt - src[i - 1];
    // Se il salto è > 10m in 1 secondo, lo ignoro (probabile errore altimetro)
    const dt = time[i] - time[i - 1];
    const isJump = dt > 0 && Math.abs(delta) / dt > 10;
    arr.push(arr[arr.length - 1] + ((delta > 0 && !isJump) ? delta : 0));
    return arr;
  }, []);

  // Calcolo dei picchi di VAM
  const vamPeaks = intervals.map(interval => {
    let best = 0;
    for (let i = 0; i < cumulativeGain.length - interval; i++) {
      let j = i + interval;
      if (j >= cumulativeGain.length) break;
      let deltaGain = cumulativeGain[j] - cumulativeGain[i];
      if (deltaGain > best) best = deltaGain;
    }
    return (best / interval) * 3600;
  });

  // ASSE X VALUES
  const xValues = intervals.map(sec => sec / 60);
  const xLabels = intervals.map(sec => `${Math.round(sec/60)} m`);

  // Plot
  const traces = [{
    x: xValues,
    y: vamPeaks,
    type: 'scatter',
    mode: 'lines+markers',
    marker: {
      color: CONFIG.COLOR_MARKER,
      symbol: CONFIG.MARKER_SYMBOL,
      size: CONFIG.MARKER_SIZE
    },
    line: { shape: 'spline', color: CONFIG.COLOR_LINE },
    name: 'VAM Peaks',
    hovertemplate:
      '%{text}<br>VAM: %{y:.0f} m/h<extra></extra>',
    text: xLabels
  }];

  const layout = {
    title: CONFIG.TITLE,
    xaxis: {
      title: CONFIG.XAXIS_TITLE,
      type: 'linear',
      tickvals: xValues,
      ticktext: xLabels,
      tickfont: { size: CONFIG.FONT_SIZE },
      tickangle: CONFIG.TICKANGLE_X,
      range: [Math.max(0, Math.min(...xValues) - 2), Math.max(...xValues) + 1]
    },
    yaxis: {
      title: CONFIG.YAXIS_TITLE,
      tickformat: ',d',
      tickfont: { size: CONFIG.FONT_SIZE },
      tickangle: CONFIG.TICKANGLE_Y,
      range: [
        Math.floor(Math.min(...vamPeaks) / 200) * 200,
        null
      ]
    },
    margin: CONFIG.MARGIN,
    shapes: [
      {
        type: 'line',
        xref: 'paper',
        x0: 0,
        x1: 1,
        yref: 'y',
        y0: Math.floor(Math.min(...vamPeaks) / 200) * 200,
        y1: Math.floor(Math.min(...vamPeaks) / 200) * 200,
        line: {
          color: '#000000b3',
          width: CONFIG.SHAPE_WIDTH_X
        }
      }
    ]
  };

  const chart = { data: traces, layout };
  chart;
}
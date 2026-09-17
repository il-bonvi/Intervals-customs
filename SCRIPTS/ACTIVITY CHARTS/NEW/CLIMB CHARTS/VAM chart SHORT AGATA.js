{
  // --- CONFIGURAZIONE INIZIALE ---
  const CONFIG = {

    // Colori
    COLOR_LINE: '#365A98',         // Colore della linea principale (spline)
    COLOR_MARKER: '#c90076',       // Colore dei marker (stelle)

    // Marker
    MARKER_SYMBOL: 'star-diamond', // Simbolo marker per i picchi (Plotly symbol)
    MARKER_SIZE: 10,               // Dimensione marker

    // Titoli e font
    TITLE: 'VAM Peak Chart',       // Titolo del grafico
    XAXIS_TITLE: 'Duration (s)',   // Titolo asse X
    YAXIS_TITLE: 'VAM (m/h)',      // Titolo asse Y
    FONT_SIZE: 12,                 // Dimensione font tick e label
    TICKANGLE_X: 20,               // Angolo dei tick dell'asse X
    TICKANGLE_Y: 0,                // Angolo dei tick dell'asse Y

    // Margini e shape
    MARGIN: { t: 50, l: 60, r: 20, b: 100 }, // Margini del grafico
    SHAPE_WIDTH_X: 1,              // Spessore linea shape orizzontale (X)
    SHAPE_WIDTH_Y: 2,              // Spessore linea shape verticale (Y)

    // Intervalli
    INTERVAL_START: 20,            // Inizio intervallo (secondi)
    INTERVAL_END: 480,             // Fine intervallo (secondi)
    INTERVAL_STEP: 20              // Step intervallo (secondi)
  };
  // --- FINE CONFIG ---

  const stream = icu.streams;
  const maxTime = icu.activity.moving_time;
  console.log(`Total moving time: ${maxTime}s`);

  // Intervalli ogni 20s da INTERVAL_START a INTERVAL_END (o maxTime)
  const intervals = Array.from(
    { length: Math.floor((Math.min(CONFIG.INTERVAL_END, maxTime) - CONFIG.INTERVAL_START) / CONFIG.INTERVAL_STEP) + 1 },
    (_, i) => CONFIG.INTERVAL_START + i * CONFIG.INTERVAL_STEP
  );

  // Guadagno altimetrico cumulativo (solo salite)
  let altitude = stream.altitude;
  let startIdx = altitude.findIndex(a => a > 1);
  if (startIdx > 0) altitude = altitude.slice(startIdx);
  const cumulativeGain = altitude.reduce((arr, alt, i, src) => {
    if (i === 0) { arr.push(0); return arr; }
    const delta = alt - src[i - 1];
    // Ignora salti anomali di altitudine (>10m/s)
    if (Math.abs(delta) > 10) {
      arr.push(arr[arr.length - 1]);
      return arr;
    }
    arr.push(arr[arr.length - 1] + (delta > 0 ? delta : 0));
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

  // Valori asse X
  const xLabels = intervals.map(sec => `${sec} s`);

  // Tracce del grafico
  const traces = [
    {
      x: intervals,
      y: vamPeaks,
      type: 'scatter',
      mode: 'lines',
      line: { shape: 'spline', color: CONFIG.COLOR_LINE },
      hoverinfo: 'skip',
      showlegend: false
    },
    {
      x: intervals,
      y: vamPeaks,
      type: 'scatter',
      mode: 'markers',
      marker: {
        color: CONFIG.COLOR_MARKER,
        symbol: CONFIG.MARKER_SYMBOL,
        size: CONFIG.MARKER_SIZE
      },
      hovertemplate:
        '%{text}<br>VAM: %{y:.0f} m/h<extra></extra>',
      text: xLabels,
      showlegend: false
    }
  ];

  // Layout
  const layout = {
    title: CONFIG.TITLE,
    xaxis: {
      title: CONFIG.XAXIS_TITLE,
      type: 'linear',
      tickvals: intervals,
      ticktext: xLabels,
      tickfont: { size: CONFIG.FONT_SIZE },
      tickangle: CONFIG.TICKANGLE_X,
      range: [Math.max(0, Math.min(...intervals) - 20), Math.max(...intervals) + 10]
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
    showlegend: false,  // Disattiva legenda
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
          color: 'rgba(0,0,0,0.7)',
          width: CONFIG.SHAPE_WIDTH_X
        }
      },
      {
        type: 'line',
        xref: 'x',
        x0: 0,
        x1: 0,
        yref: 'paper',
        y0: 0,
        y1: 1,
        line: {
          color: 'rgba(0,0,0,0.7)',
          width: CONFIG.SHAPE_WIDTH_Y
        }
      }
    ]
  };

  const chart = { data: traces, layout };
  chart;
}
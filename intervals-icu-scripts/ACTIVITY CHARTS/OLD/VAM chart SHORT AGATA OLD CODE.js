{
  // --- CONFIGURAZIONE INIZIALE ---
  const CONFIG = {
    COLOR_LINE: '#365A98',         // Colore della linea principale (spline)
    COLOR_MARKER: '#c90076',       // Colore dei marker (stelle)
    MARKER_SYMBOL: 'star-diamond', // Simbolo marker per i picchi (Plotly symbol)
    MARKER_SIZE: 10,               // Dimensione marker
    TITLE: 'VAM Peak Chart',       // Titolo del grafico
    XAXIS_TITLE: 'Duration (s)',   // Titolo asse X
    YAXIS_TITLE: 'VAM (m/h)',      // Titolo asse Y
    FONT_SIZE: 12,                 // Dimensione font tick e label
    MARGIN: { t: 50, l: 60, r: 20, b: 100 }, // Margini del grafico
    SHAPE_COLOR: 'rgba(0,0,0,0.7)',// Colore delle linee di riferimento (shapes)
    SHAPE_WIDTH: 1,                // Spessore linea shape orizzontale
    SHAPE_WIDTH_Y: 2,              // Spessore linea shape verticale
    INTERVAL_START: 20,            // Inizio intervallo (secondi)
    INTERVAL_END: 480,             // Fine intervallo (secondi)
    INTERVAL_STEP: 20              // Step intervallo (secondi)
  };
  // --- FINE CONFIG ---

  const stream = icu.streams;
  const maxTime = icu.activity.moving_time;
  console.log(`Total moving time: ${maxTime}s`);

  // Intervalli ogni 20s da 20s a 480s
  let intervals = [];
  for (let s = CONFIG.INTERVAL_START; s <= CONFIG.INTERVAL_END; s += CONFIG.INTERVAL_STEP) intervals.push(s);
  intervals = intervals.filter(interval => interval <= maxTime);

  let vamPeaks = [];

  // Guadagno altimetrico cumulativo (solo salite)
  let cumulativeGain = [];
  let gain = 0;
  let altitude = stream.altitude;
  // Trova il primo indice con altitudine > 1
  let startIdx = 0;
  while (startIdx < altitude.length && altitude[startIdx] <= 1) {
    startIdx++;
  }
  // Se trovato, filtra tutti gli array da startIdx
  if (startIdx > 0) {
    altitude = altitude.slice(startIdx);
  }
  
  cumulativeGain[0] = 0;
  for (let i = 1; i < altitude.length; i++) {
    let delta = altitude[i] - altitude[i - 1];
    if (delta > 0) gain += delta;
    cumulativeGain[i] = gain;
  }

  // Calcolo dei picchi di VAM
  intervals.forEach(interval => {
    let best = 0;
    for (let i = 0; i < cumulativeGain.length - interval; i++) {
      let j = i + interval;
      if (j >= cumulativeGain.length) break;
      let deltaGain = cumulativeGain[j] - cumulativeGain[i];
      if (deltaGain > best) best = deltaGain;
    }
    let vam = (best / interval) * 3600;
    vamPeaks.push(vam);
  });

  // Valori asse X
  let xValues = intervals;
  let xLabels = intervals.map(sec => `${sec} s`);

  // Tracce del grafico
  let traces = [
    // Linea blu spline SENZA tooltip
    {
      x: xValues,
      y: vamPeaks,
      type: 'scatter',
      mode: 'lines',
      line: { shape: 'spline', color: CONFIG.COLOR_LINE },
      hoverinfo: 'skip',
      showlegend: false
    },
    // Stelline dorate CON tooltip
    {
      x: xValues,
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
  let layout = {
    title: CONFIG.TITLE,
    xaxis: {
      title: CONFIG.XAXIS_TITLE,
      type: 'linear',
      tickvals: xValues,
      ticktext: xLabels,
      tickfont: { size: CONFIG.FONT_SIZE },
      tickangle: 20,
      range: [Math.max(0, Math.min(...xValues) - 20), Math.max(...xValues) + 10]
    },
    yaxis: {
      title: CONFIG.YAXIS_TITLE,
      tickformat: ',d',
      tickfont: { size: CONFIG.FONT_SIZE },
      tickangle: 0,
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
          color: CONFIG.SHAPE_COLOR,
          width: CONFIG.SHAPE_WIDTH
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
          color: CONFIG.SHAPE_COLOR,
          width: CONFIG.SHAPE_WIDTH_Y
        }
      }
    ]
  };

  const chart = { data: traces, layout };
  chart;
}
{
  // --- CONFIGURAZIONE INIZIALE ---
  const CONFIG = {

    // --- COLORI ---
    COLOR_LINE: '#365A98',         // Colore della linea principale

    // --- TITOLI E FONT ---
    TITLE: 'VAM Peak Chart',               // Titolo del grafico
    XAXIS_TITLE: 'Duration (min)',         // Titolo asse X
    YAXIS_TITLE: 'VAM (m/h)',              // Titolo asse Y
    FONT_SIZE: 12,                         // Dimensione font tick e label
    TICKANGLE_X: -90,                      // Angolo etichette asse X
    TICKANGLE_Y: 0,                        // Angolo etichette asse Y

    // --- MARGINI E SHAPE ---
    MARGIN: { t: 50, l: 60, r: 20, b: 100 }, // Margini del grafico
    SHAPE_WIDTH_X: 1,                      // Spessore linea shape orizzontale (X)
    SHAPE_WIDTH_Y: 1                       // Spessore linea shape verticale (Y)
  };
  // --- FINE CONFIG ---

  const stream = icu.streams;
  const maxTime = icu.activity.moving_time;
  console.log(`Total moving time: ${maxTime}s`);

  // Intervalli ogni 30 secondi da 60s a maxTime
  let intervals = Array.from({length: Math.floor((maxTime-60)/30)+1}, (_, i) => 60 + i*30).filter(s => s <= maxTime);

  let vamPeaks = [];

  // Guadagno altimetrico cumulativo (solo salite, monotono)
  let cumulativeGain = [];
  let gain = 0;
  let altitude = stream.altitude;

  cumulativeGain[0] = 0;
  for (let i = 1; i < altitude.length; i++) {
    let delta = altitude[i] - altitude[i - 1];
    // Ignora salti anomali di altitudine (>10m/s)
    if (Math.abs(delta) > 10) {
      cumulativeGain[i] = gain;
      continue;
    }
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

  // ASSE X VALUES
  let xValues = intervals.map(sec => sec / 60);
  // Tick ogni 10 minuti
  let tickvals = Array.from({length: Math.floor(Math.floor(maxTime/60)/10)}, (_, i) => (i+1)*10);
  let ticktext = tickvals.map(m => `${m} m`);

  // Plot
  let traces = [{
    x: xValues,
    y: vamPeaks,
    type: 'scatter',
    mode: 'lines', // solo linea smooth
    line: { shape: 'spline', color: CONFIG.COLOR_LINE },
    name: 'VAM Peaks',
    hovertemplate:
      'VAM: %{y:.0f} m/h<extra></extra>'
  }];

  let layout = {
    title: CONFIG.TITLE,
    xaxis: {
      title: CONFIG.XAXIS_TITLE,
      type: 'linear',
      tickvals: tickvals,
      ticktext: ticktext,
      tickfont: { size: CONFIG.FONT_SIZE },
      tickangle: CONFIG.TICKANGLE_X,
      range: [Math.max(0, Math.min(...xValues) - 0), Math.max(...xValues) + 0],
      showgrid: true
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
      // Linea orizzontale sottile sull'asse y al minimo arrotondato
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
      // Linea verticale sull'asse x a 0
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
{
  const stream = icu.streams;
  const maxTime = icu.activity.moving_time;
  console.log(`Total moving time: ${maxTime}s`);

  // Intervals: 1-15 min (step 1), 20,25,30,40,50,60,70,80,90,120 min
  let intervals = [];
  for (let m = 1; m <= 15; m++) intervals.push(m * 60);
  // 20-60 min: ogni 5'
  for (let m = 20; m <= 60; m += 5) intervals.push(m * 60);
  // 70,80,90,120 min
  [70,80,90,120].forEach(m => intervals.push(m * 60));
  intervals = intervals.filter(interval => interval <= maxTime);

  let vamPeaks = [];

  // Monotonic elevation gain (cumulative)
  let cumulativeGain = [];
  let gain = 0;
  let altitude = stream.altitude;

  cumulativeGain[0] = 0;
  for (let i = 1; i < altitude.length; i++) {
    let delta = altitude[i] - altitude[i - 1];
    if (delta > 0) gain += delta;
    cumulativeGain[i] = gain;
  }

  // Best VAM calculation
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
  let xLabels = intervals.map(sec => `${Math.round(sec/60)} m`);

  // Plot
  let traces = [{
    x: xValues,
    y: vamPeaks,
    type: 'scatter',
    mode: 'lines+markers',
    marker: { color: 'darkorange' },
    line: { shape: 'spline' },
    name: 'VAM Peaks',
    hovertemplate:
      '%{text}<br>VAM: %{y:.0f} m/h<extra></extra>',
    text: xLabels
  }];

  let layout = {
    title: 'VAM Peak Chart',
    xaxis: {
      title: 'Duration (min)',
      type: 'linear',
      tickvals: xValues,
      ticktext: xLabels,
      tickfont: { size: 12 },
      tickangle: -90,
      range: [Math.max(0, Math.min(...xValues) - 2), Math.max(...xValues) + 2]
    },
    yaxis: {
      title: 'VAM (m/h)',
      tickformat: ',d',
      tickfont: { size: 12 },
      range: [
        Math.floor(Math.min(...vamPeaks) / 200) * 200,
        null
      ]
    },
    margin: { t: 50, l: 60, r: 20, b: 100 },
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
          width: 1
        }
      }
    ]
  };

  const chart = { data: traces, layout };
  chart;
}
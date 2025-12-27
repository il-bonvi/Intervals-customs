{
  const stream = icu.streams;
  const maxTime = icu.activity.moving_time;
  console.log(`Total moving time: ${maxTime}s`);

  let intervals = [60, 120, 240, 300, 600, 1200, 1800, 2700,3600, 7200, 10800, 18000];
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

  // Convert to minutes
  let xValues = intervals.map(sec => sec / 60);
  let xLabels = intervals.map(sec => {
    if (sec < 3600) return `${sec / 60} min`;
    return `${sec / 3600}h`;
  });

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
      title: 'Duration',
      type: 'log',
      tickvals: xValues,
      ticktext: xLabels,
      tickfont: { size: 12 },
      tickangle: -90
    },
    yaxis: {
      title: 'VAM (m/h)',
      tickformat: ',d',
      tickfont: { size: 12 },
      rangemode: 'tozero'
    },
    margin: { t: 50, l: 60, r: 20, b: 100 }
  };

  const chart = { data: traces, layout };
  chart;
}
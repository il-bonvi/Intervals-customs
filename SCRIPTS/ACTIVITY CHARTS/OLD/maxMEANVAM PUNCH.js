{
  const stream = icu.streams;

  let intervals = [];
  for (let t = 20; t <= 480; t += 20) {
    intervals.push(t);
  }

  let vamPeaks = [];

  let firstValidIndex = stream.altitude.findIndex(alt => alt > 0);
  if (firstValidIndex === -1) firstValidIndex = 0;

  intervals.forEach(interval => {
    let best = 0;
    for (let i = firstValidIndex; i < stream.altitude.length - interval; i++) {
      let gain = stream.altitude[i + interval] - stream.altitude[i];
      if (gain > best) best = gain;
    }
    let vam = (best / interval) * 3600;
    vamPeaks.push(vam);
  });

  let xLabels = intervals.map(sec => `${sec}s`);

  let traces = [{
    x: xLabels,
    y: vamPeaks,
    type: 'scatter',
    mode: 'lines+markers', // 👈🏻 può anche essere solo 'markers' o 'lines'
    marker: { color: 'darkorange', size: 5 },
    line: { color: 'darkorange', width: 3 },
    name: 'VAM Peaks'
  }];

  let layout = {
    title: 'VAM Peak Chart',
    height: 600,
    xaxis: { title: 't (m)' },
    yaxis: {
      title: 'VAM (m/h)',
      range: [600, null], 
      dtick: 200,
      gridcolor: '#cccccc',
      gridwidth: 1
    },
    margin: { t: 50, l: 70, r: 30, b: 80 }
  };

  const chart = { data: traces, layout };
  chart;
}
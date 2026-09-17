{
  let chart;
  let power = icu.streams.fixed_watts;
  let altitude = icu.streams.altitude;
  let activity = icu.activity;
  let ftp = activity.icu_ftp;
  let hr = icu.streams.fixed_heartrate;
  let heartRateZones = icu.sportSettings?.hr_zones;
  let zonesP = [];

  if (ftp && activity.icu_power_zones) {
    for (let i = 0; i < activity.icu_power_zones.length; i++) {
      zonesP.push(ftp * activity.icu_power_zones[i] / 100);
    }
  }

  function formatTime(totalSeconds) {
    let hours = Math.floor(totalSeconds / 3600);
    let mins = Math.floor((totalSeconds % 3600) / 60);
    return hours > 0 ? `${hours}h${mins}m` : `${mins}m`;
  }

  function getZoneColor(zone) {
    const zoneColors = ['#009e96', '#009e00', '#ffcb0e', '#ff7f0e', '#dd0447', '#6633cc', '#000000'];
    return zoneColors[zone - 1] || '#83b9b7';
  }

  function hexToRgba(hex, alpha) {
    let r = parseInt(hex.slice(1,3),16);
    let g = parseInt(hex.slice(3,5),16);
    let b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  let secsPerMin = 30;
  let powerByMin = {};
  let hrByMin = {};
  let altByMin = {};

  if (power && power.length > 0) {
    let totalMins = Math.ceil(power.length / secsPerMin);
    for (let min = 0; min < totalMins; min++) {
      let slice = power.slice(min * secsPerMin, Math.min((min + 1) * secsPerMin, power.length)).filter(v => v > 0);
      if (slice.length === 0) continue;
      powerByMin[min + 1] = slice.reduce((a, b) => a + b, 0) / slice.length;
    }
  }

  if (hr && hr.length > 0 && heartRateZones) {
    let totalMins = Math.ceil(hr.length / secsPerMin);
    for (let min = 0; min < totalMins; min++) {
      let slice = hr.slice(min * secsPerMin, Math.min((min + 1) * secsPerMin, hr.length)).filter(v => v > 0);
      if (slice.length === 0) continue;
      hrByMin[min + 1] = slice.reduce((a, b) => a + b, 0) / slice.length;
    }
  }

  let maxMins = 0;
  if (altitude && altitude.length > 0) {
    let totalMins = Math.ceil(altitude.length / secsPerMin);
    maxMins = totalMins;
    for (let min = 0; min < totalMins; min++) {
      let slice = altitude.slice(min * secsPerMin, Math.min((min + 1) * secsPerMin, altitude.length)).filter(a => a !== null && a !== undefined);
      if (slice.length === 0) continue;
      altByMin[min + 1] = slice.reduce((a, b) => a + b, 0) / slice.length;
    }
  }

  let kJkgBoundaries = [];
  let weightKg = activity?.icu_weight || 0;
  if (weightKg > 0 && power && power.length > 0) {
    let totalBins = Math.max(maxMins, Math.ceil(power.length / secsPerMin));
    let cumulativeKJkg = [0];
    let cumulative = 0;

    for (let min = 1; min <= totalBins; min++) {
      let watt = powerByMin[min] ?? 0;
      cumulative += (watt * secsPerMin / 1000) / weightKg;
      cumulativeKJkg[min] = cumulative;
    }

    let bandStep = 5;
    let maxKJkg = cumulativeKJkg[totalBins] || 0;

    for (let target = bandStep; target <= maxKJkg; target += bandStep) {
      for (let min = 1; min <= totalBins; min++) {
        let prev = cumulativeKJkg[min - 1] ?? 0;
        let curr = cumulativeKJkg[min] ?? prev;
        if (curr < target) continue;

        let fraction = curr > prev ? (target - prev) / (curr - prev) : 0;
        kJkgBoundaries.push((min - 1) + fraction);
        break;
      }
    }
  }

  let verticalBands = [];
  if (kJkgBoundaries.length > 0) {
    for (let i = 0; i < kJkgBoundaries.length; i++) {
      verticalBands.push({
        type: 'line',
        xref: 'x',
        yref: 'paper',
        x0: kJkgBoundaries[i],
        x1: kJkgBoundaries[i],
        y0: 0,
        y1: 1,
        line: {
          color: '#1b65f0',
          width: 0.7
        },
        layer: 'above'
      });
    }
  }

  let sectionAnnotations = [];
  if (weightKg > 0) {
    let sectionEdges = [0.5, ...kJkgBoundaries, maxMins + 0.5];
    for (let i = 0; i < sectionEdges.length - 1; i++) {
      let start = sectionEdges[i];
      let end = sectionEdges[i + 1];
      let x = start + (end - start) / 2;
      sectionAnnotations.push({
        x: x,
        y: 0.98,
        xref: 'x',
        yref: 'paper',
        text: `${(i + 1) * 5} kJ/kg`,
        showarrow: false,
        align: 'center',
        yanchor: 'top',
        font: {
          color: '#1b65f0',
          size: 10,
          family: 'Arial Black'
        }
      });
    }
  }

  let mins = Object.keys(altByMin).map(Number).sort((a, b) => a - b);
  let data = [];
  let maxAltitude = Math.max(...Object.values(altByMin), 1);

  // Segmenti colorati senza hover
  for (let i = 0; i < mins.length - 1; i++) {
    let m = mins[i];
    let zone = zonesP.length + 1;
    let val = powerByMin[m];
    if (val !== undefined) {
      for (let j = 0; j < zonesP.length; j++) {
        if (val <= zonesP[j]) { zone = j + 1; break; }
      }
    }
    let color = getZoneColor(zone);
    data.push({
      type: 'scatter',
      mode: 'lines',
      x: [m, mins[i + 1]],
      y: [altByMin[m], altByMin[mins[i + 1]]],
      fill: 'tozeroy',
      fillcolor: hexToRgba(color, 1.0),
      line: { color: color, width: 1.5 },
      hoverinfo: 'none',
      showlegend: false
    });
  }

  // Trace invisibile con hoverlabel colorato per zona
  let hoverX = [], hoverY = [], hoverCustom = [], hoverColors = [], hoverFontColors = [];
  for (let i = 0; i < mins.length; i++) {
    let m = mins[i];
    let zone = zonesP.length + 1;
    let val = powerByMin[m];
    if (val !== undefined) {
      for (let j = 0; j < zonesP.length; j++) {
        if (val <= zonesP[j]) { zone = j + 1; break; }
      }
    }
    let color = getZoneColor(zone);
    let pVal = powerByMin[m] !== undefined ? Math.round(powerByMin[m]) + ' W' : 'n/d';
    let hVal = hrByMin[m] !== undefined ? Math.round(hrByMin[m]) + ' bpm' : 'n/d';
    hoverX.push(m);
    hoverY.push(altByMin[m]);
    hoverCustom.push([formatTime((m - 1) * secsPerMin), pVal, hVal]);
    hoverColors.push(color);
    // font bianco per zone scure, nero per zone chiare
    hoverFontColors.push(['#ffcb0e','#ff7f0e'].includes(color) ? '#000000' : '#ffffff');
  }

  data.push({
    type: 'scatter',
    mode: 'none',
    x: hoverX,
    y: hoverY,
    customdata: hoverCustom,
    hovertemplate: '%{customdata[0]}<br>⚡ %{customdata[1]}<br>❤️ %{customdata[2]}<br>⛰️ %{y:.0f} m<extra></extra>',
    hoverlabel: {
      bgcolor: hoverColors,
      bordercolor: '#ffffff',
      font: { color: hoverFontColors }
    },
    showlegend: false
  });

  chart = {
    data: data,
    layout: {
      xaxis: { showticklabels: false, showgrid: false, zeroline: false, range: [0.5, maxMins + 0.5] },
      yaxis: { showticklabels: false, showgrid: false, zeroline: false, range: [0, maxAltitude * 1.03 + 200] },
      paper_bgcolor: '#ffffff',
      plot_bgcolor: '#ffffff',
      margin: { l: 0, r: 0, t: 0, b: 0 },
      hovermode: 'x unified',
      showlegend: false,
      autosize: true,
      responsive: true,
      shapes: verticalBands,
      annotations: sectionAnnotations
    }
  };
}
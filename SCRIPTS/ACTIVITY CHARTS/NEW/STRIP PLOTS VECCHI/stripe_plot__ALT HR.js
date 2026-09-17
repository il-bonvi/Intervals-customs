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
    return zoneColors[zone - 1] || '#000000';
  }

  function hexToRgba(hex, alpha) {
    let r = parseInt(hex.slice(1,3),16);
    let g = parseInt(hex.slice(3,5),16);
    let b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  let secsPerMin = 60;
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

  let mins = Object.keys(altByMin).map(Number).sort((a, b) => a - b);
  let data = [];

  // Segmenti colorati per zona HR
  for (let i = 0; i < mins.length - 1; i++) {
    let m = mins[i];
    let zone = heartRateZones ? heartRateZones.length + 1 : 1;
    let val = hrByMin[m];
    if (val !== undefined && heartRateZones) {
      for (let j = 0; j < heartRateZones.length; j++) {
        if (val < heartRateZones[j]) { zone = j + 1; break; }
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

  // Trace invisibile con hoverlabel colorato per zona HR
  let hoverX = [], hoverY = [], hoverCustom = [], hoverColors = [], hoverFontColors = [];
  for (let i = 0; i < mins.length; i++) {
    let m = mins[i];
    let zone = heartRateZones ? heartRateZones.length + 1 : 1;
    let val = hrByMin[m];
    if (val !== undefined && heartRateZones) {
      for (let j = 0; j < heartRateZones.length; j++) {
        if (val < heartRateZones[j]) { zone = j + 1; break; }
      }
    }
    let color = getZoneColor(zone);
    let pVal = powerByMin[m] !== undefined ? Math.round(powerByMin[m]) + ' W' : 'n/d';
    let hVal = hrByMin[m] !== undefined ? Math.round(hrByMin[m]) + ' bpm' : 'n/d';
    hoverX.push(m);
    hoverY.push(altByMin[m]);
    hoverCustom.push([formatTime((m-1)*60), pVal, hVal]);
    hoverColors.push(color);
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
      yaxis: { showticklabels: false, showgrid: false, zeroline: false },
      margin: { l: 0, r: 0, t: 0, b: 0 },
      hovermode: 'x unified',
      showlegend: false,
      autosize: true,
      responsive: true
    }
  };
}
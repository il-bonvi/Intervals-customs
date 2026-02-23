{
  let chart;
  let power = icu.streams.fixed_watts;
  let hr = icu.streams.fixed_heartrate;
  let activity = icu.activity;
  let ftp = activity.icu_ftp;
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

  let powerByMin = {};
  let hrByMin = {};
  let secsPerMin = 60;

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

  let maxMins = Math.max(
    power && power.length > 0 ? Math.ceil(power.length / secsPerMin) : 0,
    hr && hr.length > 0 ? Math.ceil(hr.length / secsPerMin) : 0
  );

  function buildStripes(stream, zones, isHR) {
    let totalMins = Math.ceil(stream.length / secsPerMin);
    let minutes = [], values = [], colors = [], customdata = [];
    for (let min = 0; min < totalMins; min++) {
      let slice = stream.slice(min * secsPerMin, Math.min((min + 1) * secsPerMin, stream.length)).filter(v => v > 0);
      if (slice.length === 0) continue;
      let avg = slice.reduce((a, b) => a + b, 0) / slice.length;
      let m = min + 1;
      values.push(avg);
      minutes.push(m);
      let zone = zones.length + 1;
      for (let i = 0; i < zones.length; i++) {
        if (isHR ? avg < zones[i] : avg <= zones[i]) { zone = i + 1; break; }
      }
      colors.push(getZoneColor(zone));
      let pVal = powerByMin[m] !== undefined ? Math.round(powerByMin[m]) + ' W' : 'n/d';
      let hVal = hrByMin[m] !== undefined ? Math.round(hrByMin[m]) + ' bpm' : 'n/d';
      customdata.push([formatTime(min * 60), pVal, hVal]);
    }
    return { minutes, values, colors, customdata };
  }

  let data = [];

  if (power && power.length > 0 && zonesP.length > 0) {
    let p = buildStripes(power, zonesP, false);
    data.push({
      type: 'bar',
      x: p.minutes,
      y: p.values.map(() => 1),
      marker: { color: p.colors },
      customdata: p.customdata,
      hovertemplate: '%{customdata[0]}<br>⚡ %{customdata[1]}<br>❤️ %{customdata[2]}<extra></extra>',
      xaxis: 'x',
      yaxis: 'y'
    });
  }

  if (hr && hr.length > 0 && heartRateZones) {
    let h = buildStripes(hr, heartRateZones, true);
    data.push({
      type: 'bar',
      x: h.minutes,
      y: h.values.map(() => 1),
      marker: { color: h.colors },
      customdata: h.customdata,
      hovertemplate: '%{customdata[0]}<br>⚡ %{customdata[1]}<br>❤️ %{customdata[2]}<extra></extra>',
      xaxis: 'x2',
      yaxis: 'y2'
    });
  }

  chart = {
    data: data,
    layout: {
      xaxis:  { showticklabels: false, showgrid: false, zeroline: false, domain: [0, 1], anchor: 'y',  range: [0.5, maxMins + 0.5] },
      yaxis:  { showticklabels: false, showgrid: false, zeroline: false, domain: [0.502, 1] },
      xaxis2: { showticklabels: false, showgrid: false, zeroline: false, domain: [0, 1], anchor: 'y2', range: [0.5, maxMins + 0.5] },
      yaxis2: { showticklabels: false, showgrid: false, zeroline: false, domain: [0, 0.498] },
      margin: { l: 0, r: 0, t: 0, b: 0 },
      bargap: 0.2,
      bargroupgap: 0,
      hovermode: 'closest',
      showlegend: false,
      autosize: true,
      responsive: true
    }
  };
}{
  let chart;
  let power = icu.streams.fixed_watts;
  let hr = icu.streams.fixed_heartrate;
  let activity = icu.activity;
  let ftp = activity.icu_ftp;
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

  let powerByMin = {};
  let hrByMin = {};
  let secsPerMin = 60;

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

  let maxMins = Math.max(
    power && power.length > 0 ? Math.ceil(power.length / secsPerMin) : 0,
    hr && hr.length > 0 ? Math.ceil(hr.length / secsPerMin) : 0
  );

  function buildStripes(stream, zones, isHR) {
    let totalMins = Math.ceil(stream.length / secsPerMin);
    let minutes = [], values = [], colors = [], customdata = [];
    for (let min = 0; min < totalMins; min++) {
      let slice = stream.slice(min * secsPerMin, Math.min((min + 1) * secsPerMin, stream.length)).filter(v => v > 0);
      if (slice.length === 0) continue;
      let avg = slice.reduce((a, b) => a + b, 0) / slice.length;
      let m = min + 1;
      values.push(avg);
      minutes.push(m);
      let zone = zones.length + 1;
      for (let i = 0; i < zones.length; i++) {
        if (isHR ? avg < zones[i] : avg <= zones[i]) { zone = i + 1; break; }
      }
      colors.push(getZoneColor(zone));
      let pVal = powerByMin[m] !== undefined ? Math.round(powerByMin[m]) + ' W' : 'n/d';
      let hVal = hrByMin[m] !== undefined ? Math.round(hrByMin[m]) + ' bpm' : 'n/d';
      customdata.push([formatTime(min * 60), pVal, hVal]);
    }
    return { minutes, values, colors, customdata };
  }

  let data = [];

  if (power && power.length > 0 && zonesP.length > 0) {
    let p = buildStripes(power, zonesP, false);
    data.push({
      type: 'bar',
      x: p.minutes,
      y: p.values.map(() => 1),
      marker: { color: p.colors },
      customdata: p.customdata,
      hovertemplate: '%{customdata[0]}<br>⚡ %{customdata[1]}<br>❤️ %{customdata[2]}<extra></extra>',
      xaxis: 'x',
      yaxis: 'y'
    });
  }

  if (hr && hr.length > 0 && heartRateZones) {
    let h = buildStripes(hr, heartRateZones, true);
    data.push({
      type: 'bar',
      x: h.minutes,
      y: h.values.map(() => 1),
      marker: { color: h.colors },
      customdata: h.customdata,
      hovertemplate: '%{customdata[0]}<br>⚡ %{customdata[1]}<br>❤️ %{customdata[2]}<extra></extra>',
      xaxis: 'x2',
      yaxis: 'y2'
    });
  }

  chart = {
    data: data,
    layout: {
      xaxis:  { showticklabels: false, showgrid: false, zeroline: false, domain: [0, 1], anchor: 'y',  range: [0.5, maxMins + 0.5] },
      yaxis:  { showticklabels: false, showgrid: false, zeroline: false, domain: [0.502, 1] },
      xaxis2: { showticklabels: false, showgrid: false, zeroline: false, domain: [0, 1], anchor: 'y2', range: [0.5, maxMins + 0.5] },
      yaxis2: { showticklabels: false, showgrid: false, zeroline: false, domain: [0, 0.498] },
      margin: { l: 0, r: 0, t: 0, b: 0 },
      bargap: 0.2,
      bargroupgap: 0,
      hovermode: 'closest',
      showlegend: false,
      autosize: true,
      responsive: true
    }
  };
}
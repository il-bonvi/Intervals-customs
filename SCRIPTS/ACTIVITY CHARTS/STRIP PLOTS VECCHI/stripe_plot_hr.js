{
  let chart;
  let hr = icu.streams.fixed_heartrate;
  if (!hr || hr.length === 0) {
    chart = { data: [], layout: { title: 'Nessun dato frequenza cardiaca disponibile' } };
  } else {

  let heartRateZones = icu.sportSettings?.hr_zones;
  if (!heartRateZones) {
    chart = { data: [], layout: { title: 'Zone HR non disponibili per questo sport' } };
  } else {
  let secsPerMin = 60;
  let totalMins = Math.ceil(hr.length / secsPerMin);

  let minutes = [];
  let hrs = [];
  let colors = [];
  let customdata = [];

  for (let min = 0; min < totalMins; min++) {
    let start = min * secsPerMin;
    let end = Math.min((min + 1) * secsPerMin, hr.length);
    let slice = hr.slice(start, end).filter(h => h > 0); // filtra valori nulli o zero
    if (slice.length === 0) continue;
    let avg = slice.reduce((a, b) => a + b, 0) / slice.length;
    hrs.push(avg);
    minutes.push(min + 1); // minuti da 1

    // Determina zona basata su zone personalizzate HR
    let zone = heartRateZones.length + 1; // default zona massima
    for (let i = 0; i < heartRateZones.length; i++) {
      if (avg < heartRateZones[i]) {
        zone = i + 1;
        break;
      }
    }

    colors.push(getZoneColorHR(zone));

    let formattedTime = formatTime(min * 60);
    customdata.push([formattedTime, avg]);
  }

  function getZoneColorHR(zone) {
    // Colori personalizzati zone
    const zoneColors = ['#009e96', '#009e00', '#ffcb0e', '#ff7f0e', '#dd0447', '#6633cc', '#000000'];
    return zoneColors[zone - 1] || '#000000';
  }

  function formatTime(totalSeconds) {
    let hours = Math.floor(totalSeconds / 3600);
    let minutes = Math.floor((totalSeconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }

  chart = {
    data: [{
      type: 'bar',
      x: minutes, // minuti su x (orizzontale)
      y: hrs.map(() => 1), // altezza fissa
      marker: {
        color: colors
      },
      customdata: customdata, // per hover
      hovertemplate: '%{customdata[0]}<br>%{customdata[1]:.0f} bpm<extra></extra>'
    }],
    layout: {
      title: {
        text: 'Stripe Plot - Frequenza Cardiaca per Minuto (Zone HR)',
        font: { size: 16 }
      },
      xaxis: {
        title: 'Minuto'
      },
      yaxis: {
        title: '',
        showticklabels: false, // nascondi etichette y
        showgrid: false
      },
      margin: { l: 50, r: 20, t: 40, b: 40 },
      showlegend: false,
      autosize: true,
      responsive: true
    }
  };
  }
}
}
{
  let power = icu.streams.fixed_watts;
  if (!power || power.length === 0) {
    chart = { data: [], layout: { title: 'Nessun dato potenza disponibile' } };
  } else {

  let activity = icu.activity;
  let ftp = activity.icu_ftp;
  if (!ftp) {
    chart = { data: [], layout: { title: 'FTP non disponibile' } };
  } else {
  let secsPerMin = 60;
  let totalMins = Math.ceil(power.length / secsPerMin);

  let minutes = [];
  let powers = [];
  let colors = [];
  let customdata = [];

  // Zone di potenza da activity
  let zonesP = [];
  for (let i = 0; i < activity.icu_power_zones.length; i++) {
    zonesP.push(ftp * activity.icu_power_zones[i] / 100);
  }
  if (zonesP.length === 0) {
    chart = { data: [], layout: { title: 'Zone potenza non disponibili' } };
  } else {

  function formatTime(totalSeconds) {
    let hours = Math.floor(totalSeconds / 3600);
    let minutes = Math.floor((totalSeconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }

  for (let min = 0; min < totalMins; min++) {
    let start = min * secsPerMin;
    let end = Math.min((min + 1) * secsPerMin, power.length);
    let slice = power.slice(start, end).filter(p => p > 0); // filtra valori nulli o zero
    if (slice.length === 0) continue;
    let avg = slice.reduce((a, b) => a + b, 0) / slice.length;
    powers.push(avg);
    minutes.push(min + 1); // minuti da 1

    // Determina zona basata su zone
    let zone = zonesP.length + 1; // default zona massima
    for (let i = 0; i < zonesP.length; i++) {
      if (avg <= zonesP[i]) {
        zone = i + 1;
        break;
      }
    }

    colors.push(getZoneColorPower(zone));

    let formattedTime = formatTime(min * 60);
    customdata.push([formattedTime, avg]);
  }

  function getZoneColorPower(zone) {
    // Colori personalizzati zone
    const zoneColors = ['#009e96', '#009e00', '#ffcb0e', '#ff7f0e', '#dd0447', '#6633cc', '#000000'];
    return zoneColors[zone - 1] || '#000000';
  }

  chart = {
    data: [{
      type: 'bar',
      x: minutes, // minuti su x (orizzontale)
      y: powers.map(() => 1), // altezza fissa
      marker: {
        color: colors
      },
      customdata: customdata, // per hover
      hovertemplate: '%{customdata[0]}<br>%{customdata[1]:.0f} W<extra></extra>'
    }],
    layout: {
      title: {
        text: 'Stripe Plot - Potenza per Minuto (Zone FTP)',
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
}
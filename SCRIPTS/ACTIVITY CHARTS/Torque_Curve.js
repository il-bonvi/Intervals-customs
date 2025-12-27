{
  let torqueRaw = icu.streams.torque
  let time = icu.streams.time
  let weight = icu.activity.icu_weight || 1

  // Torque normalizzato (Nm/kg)
  let torque = torqueRaw.map(t => t / weight)
  let n = torque.length

  // Somma cumulativa
  let cum = Array(n).fill(0)
  cum[0] = torque[0]
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + torque[i]

  // Durate stile MMP
  let durations = [5, 10, 30, 60, 120, 180, 300, 360]
  let MMT = []

  for (let d of durations) {
    let maxMean = 0
    let startIdx = 0

    for (let endIdx = 0; endIdx < n; endIdx++) {
      while (time[endIdx] - time[startIdx] > d) startIdx++

      let sum = cum[endIdx] - (startIdx > 0 ? cum[startIdx - 1] : 0)
      let mean = sum / (endIdx - startIdx + 1)

      if (mean > maxMean) maxMean = mean
    }

    MMT.push(maxMean)
  }

  let data = [{
    type: 'line',
    x: durations,
    y: MMT,
    name: 'Max Mean Torque',
    line: { color: '#32aaaaff', width: 3 },
    hovertemplate: '%{y:.2f} Nm/kg<extra></extra>'
  }]

  let layout = {
    margin: { l: 65, r: 20, t: 20, b: 45 },

    xaxis: {
      title: 'Duration',
      type: 'linear',
      tickvals: durations,
      ticktext: ['5s','10s','30s','1m','2m','3m','5m','6m'],
      showline: true,
      zeroline: false
    },

    yaxis: {
      title: 'Max Mean Torque (Nm/kg)',
      showline: true,
      zeroline: false
    },

    showlegend: false
  }

  chart = { data, layout }
}

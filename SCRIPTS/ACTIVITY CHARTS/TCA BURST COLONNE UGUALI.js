{
  // Duplicate this file and change THRESHOLDS_WATTS if you need other fixed thresholds.
  const MIN_DURATION_SEC = 4;
  const MERGE_GAP_SEC = 1;
  const THRESHOLDS_WATTS = [300, 350, 400, 450];

  const streams = (typeof icu !== "undefined" && icu && icu.streams) ? icu.streams : {};

  function pickStream(keys) {
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const v = streams[key];
      if (Array.isArray(v)) return v;
      if (v && Array.isArray(v.data)) return v.data;
    }
    return [];
  }

  function toNum(v) {
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function avg(values) {
    if (!values || !values.length) return 0;
    let s = 0;
    for (let i = 0; i < values.length; i++) s += values[i];
    return s / values.length;
  }

  function fmtClock(seconds) {
    const total = Math.max(0, Math.round(seconds));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return h + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
    return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }

  const watts = pickStream(["watts", "power", "watts_calc"]);
  const hr = pickStream(["heartrate", "heart_rate", "hr"]);
  const cad = pickStream(["cadence", "cad"]);
  const time = pickStream(["time", "seconds", "timer_time", "elapsed_time"]);

  const n = watts.length;
  const records = [];

  for (let i = 0; i < n; i++) {
    const p = toNum(watts[i]);
    if (p === null) continue;

    const t = toNum(time[i]);
    records.push({
      time_sec: t !== null ? t : i,
      power: p,
      heartrate: toNum(hr[i]),
      cadence: toNum(cad[i])
    });
  }

  function emptyChart(msg) {
    chart = {
      data: [
        {
          type: "table",
          header: {
            values: [["Burst Analyzer 300W"]],
            align: ["left"],
            fill: { color: "#16202a" },
            font: { color: "#ffffff", size: 13 }
          },
          cells: {
            values: [[msg]],
            align: ["left"],
            fill: { color: "#f5f7fa" },
            font: { color: "#23313f", size: 12 },
            height: 28
          }
        }
      ],
      layout: {
        title: { text: "Burst per durata esatta - >=300W" },
        margin: { l: 10, r: 10, t: 36, b: 10 }
      },
      config: { displayModeBar: false }
    };
  }

  function detectBurstsForThreshold(thresholdWatts) {
    const segs = [];
    let inBurst = false;
    let burstStart = 0;

    for (let i = 0; i < records.length; i++) {
      if (records[i].power >= thresholdWatts && !inBurst) {
        inBurst = true;
        burstStart = i;
      } else if (records[i].power < thresholdWatts && inBurst) {
        inBurst = false;
        segs.push({ s: burstStart, e: i - 1 });
      }
    }

    if (inBurst) segs.push({ s: burstStart, e: records.length - 1 });

    const merged = [];
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      if (!merged.length) {
        merged.push({ s: seg.s, e: seg.e });
        continue;
      }

      const last = merged[merged.length - 1];
      const gap = records[seg.s].time_sec - records[last.e].time_sec;
      if (gap <= MERGE_GAP_SEC) {
        last.e = seg.e;
      } else {
        merged.push({ s: seg.s, e: seg.e });
      }
    }

    const bursts = [];
    for (let i = 0; i < merged.length; i++) {
      const s = merged[i].s;
      const e = merged[i].e;
      const duration = records[e].time_sec - records[s].time_sec;
      if (duration < MIN_DURATION_SEC) continue;

      const slice = records.slice(s, e + 1);
      const powers = [];
      const hrs = [];
      const cads = [];

      for (let j = 0; j < slice.length; j++) {
        powers.push(slice[j].power);
        if (slice[j].heartrate && slice[j].heartrate > 0) hrs.push(slice[j].heartrate);
        if (slice[j].cadence && slice[j].cadence > 0) cads.push(slice[j].cadence);
      }

      const avgPower = avg(powers);
      const half = Math.floor(powers.length / 2);
      const firstHalf = half > 0 ? avg(powers.slice(0, half)) : avgPower;
      const secondHalf = powers.slice(half);
      const secondHalfAvg = secondHalf.length ? avg(secondHalf) : avgPower;

      bursts.push({
        duration: Number(duration.toFixed(1)),
        start_time: records[s].time_sec,
        avg_power: Number(avgPower.toFixed(1)),
        max_power: Math.max.apply(null, powers),
        min_power: Math.min.apply(null, powers),
        delta_above: Number((avgPower - thresholdWatts).toFixed(1)),
        fatigue_idx: firstHalf > 0 ? Number((secondHalfAvg / firstHalf).toFixed(3)) : 1,
        avg_hr: hrs.length ? Math.round(avg(hrs)) : null,
        avg_cadence: cads.length ? Math.round(avg(cads)) : null
      });
    }

    return bursts;
  }

  function buildTableDataForBursts(bursts) {
    if (!bursts.length) return null;

    const durationCounts = {};
    for (let i = 0; i < bursts.length; i++) {
      const d = Math.round(bursts[i].duration);
      durationCounts[d] = (durationCounts[d] || 0) + 1;
    }

    const durations = Object.keys(durationCounts)
      .map(Number)
      .filter((d) => d >= MIN_DURATION_SEC)
      .sort((a, b) => a - b);

    if (!durations.length) return null;

    const metricRows = [
      "N esatti",
      "Tempo esatto",
      "Avg W",
      "Avg HR",
      "Avg Cad",
      ">= N",
      ">= Tempo"
    ];

    const headerValues = [["Metrica"]];
    const cellValues = [metricRows];

    for (let i = 0; i < durations.length; i++) {
      const d = durations[i];
      const exactBursts = bursts.filter((b) => Math.round(b.duration) === d);
      const cumBursts = bursts.filter((b) => Math.round(b.duration) >= d);

      const exactTime = exactBursts.reduce((acc, b) => acc + b.duration, 0);
      const cumTime = cumBursts.reduce((acc, b) => acc + b.duration, 0);

      const exactHr = exactBursts.filter((b) => b.avg_hr !== null).map((b) => b.avg_hr);
      const exactCad = exactBursts.filter((b) => b.avg_cadence !== null).map((b) => b.avg_cadence);

      headerValues.push([String(d) + "s"]);
      cellValues.push([
        String(durationCounts[d] || 0),
        fmtClock(exactTime),
        String(Math.round(avg(exactBursts.map((b) => b.avg_power)))) + " W",
        exactHr.length ? String(Math.round(avg(exactHr))) + " bpm" : "-",
        exactCad.length ? String(Math.round(avg(exactCad))) + " rpm" : "-",
        String(cumBursts.length),
        fmtClock(cumTime)
      ]);
    }

    const columnwidth = [96];
    for (let i = 0; i < durations.length; i++) columnwidth.push(74);

    return {
      headerValues: headerValues,
      cellValues: cellValues,
      columnwidth: columnwidth,
      totalBursts: bursts.length,
      totalDuration: bursts.reduce((acc, b) => acc + b.duration, 0)
    };
  }

  if (!records.length) {
    emptyChart("Nessun dato potenza disponibile in questa attivita.");
  } else {
    const tables = [];
    for (let i = 0; i < THRESHOLDS_WATTS.length; i++) {
      const threshold = THRESHOLDS_WATTS[i];
      const bursts = detectBurstsForThreshold(threshold);
      const tableData = buildTableDataForBursts(bursts);
      tables.push({ threshold: threshold, bursts: bursts, tableData: tableData });
    }

    const withData = tables.filter((t) => t.tableData !== null);

    if (!withData.length) {
      emptyChart("Nessun burst trovato con i default: min 4s, merge 1s, soglie 300/350/400/450W.");
    } else {
      // Calcola il massimo numero di colonne tra tutte le tabelle
      let maxCols = 0;
      for (let i = 0; i < withData.length; i++) {
        maxCols = Math.max(maxCols, withData[i].tableData.cellValues.length);
      }
      
      // Genera il columnwidth unificato per tutte le tabelle
      const unifiedColumnwidth = [96];
      for (let i = 1; i < maxCols; i++) unifiedColumnwidth.push(74);

      // Completa tutte le tabelle con il numero massimo di colonne (padding con "-")
      for (let i = 0; i < withData.length; i++) {
        const currentCols = withData[i].tableData.cellValues.length;
        if (currentCols < maxCols) {
          const numRows = withData[i].tableData.cellValues[0].length;
          for (let col = currentCols; col < maxCols; col++) {
            withData[i].tableData.headerValues.push(["-"]);
            const emptyCol = [];
            for (let row = 0; row < numRows; row++) {
              emptyCol.push("-");
            }
            withData[i].tableData.cellValues.push(emptyCol);
          }
        }
      }

      const traceCount = withData.length;
      const topPadding = 0.04;
      const bottomPadding = 0.02;
      const verticalGap = 0.02;
      const usable = 1 - topPadding - bottomPadding - (verticalGap * (traceCount - 1));
      const blockH = usable / traceCount;

      const data = [];
      const annotations = [];
      let prevYBottom = 1; // top del chart

      for (let i = 0; i < withData.length; i++) {
        const t = withData[i];
        const yTop = 1 - topPadding - i * (blockH + verticalGap);
        const yBottom = yTop - blockH;

        // Annotazione nel gap prima di questa tabella
        const annY = (prevYBottom + yTop) / 2;
        annotations.push({
          xref: "paper",
          yref: "paper",
          x: 0.5,
          y: annY,
          xanchor: "center",
          yanchor: "middle",
          showarrow: false,
          align: "center",
          font: { size: 11, color: "#16202a", family: "Arial Black" },
          text:
            ">=" + t.threshold + "W | Tot burst: " + t.tableData.totalBursts +
            " | Tempo totale: " + fmtClock(t.tableData.totalDuration)
        });

        const metricRowColors = [
          "#12a737",  // row 0: N esatti ()
          "#12a737",  // row 1: Tempo esatto ()
          "#b843fc",  // row 2: Avg W ()
          "#f12727",  // row 3: Avg HR ()
          "#2317c9",  // row 4: Avg Cad ()
          "#657714",  // row 5: >= N ()
          "#657714"   // row 6: >= Tempo ()
        ];

        const numRows = t.tableData.cellValues[0].length;
        const numCols = t.tableData.cellValues.length;
        const cellColors = [];
        const cellFontsColors = [];

        for (let col = 0; col < numCols; col++) {
          const colFill = [];
          const colFontColor = [];
          for (let row = 0; row < numRows; row++) {
            const metricIdx = row;
            const rowColor = metricRowColors[metricIdx] || "#1d2a38";
            const bgColor = row % 2 === 0 ? "#f5f7fa" : "#eef3f8";
            colFill.push(bgColor);
            colFontColor.push(rowColor);
          }
          cellColors.push(colFill);
          cellFontsColors.push(colFontColor);
        }

        data.push({
          type: "table",
          domain: { x: [0, 1], y: [yBottom, yTop] },
          columnwidth: unifiedColumnwidth,
          header: {
            values: t.tableData.headerValues,
            align: ["left"],
            fill: { color: "#16202a" },
            font: { color: "#ffffff", size: 12, family: "Arial Black" },
            height: 28
          },
          cells: {
            values: t.tableData.cellValues,
            align: ["left"],
            fill: { color: cellColors },
            font: { color: cellFontsColors, size: 11, family: "Arial Black" },
            height: 24
          }
        });

        prevYBottom = yBottom; // per la prossima iterazione
      }

      chart = {
        data: data,
        layout: {
          title: {
            text: "Broccardo Rules"
          },
          annotations: annotations,
          margin: { l: 10, r: 10, t: 60, b: 60 }
        },
        config: { displayModeBar: false }
      };
    }
  }

  chart;
}

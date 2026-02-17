# Intervals.icu — Complete API & JavaScript Extensions Reference
> Optimized for AI/Copilot consumption. Last updated: 2025-02.
> Base URL: `https://intervals.icu/api/v1` | Auth: Basic (`API_KEY:<key>`) or Bearer token (OAuth)

---

## AUTHENTICATION

```
# Basic Auth (personal use)
curl -u API_KEY:<key> https://intervals.icu/api/v1/athlete/0/activities

# Bearer token (OAuth apps)
curl -H 'Authorization: Bearer <token>' https://intervals.icu/api/v1/athlete/0/activities
```

**Athlete ID:** Use `0` to refer to the authenticated athlete automatically.

**OAuth scopes:** `ACTIVITY:READ`, `ACTIVITY:WRITE`, `WELLNESS:READ`, `WELLNESS:WRITE`, `PROFILE:READ`

OAuth endpoints:
- `GET /oauth/authorize` — redirect user, params: `client_id`, `redirect_uri`, `scope`, `response_type=code`, `state`
- `POST /oauth/token` — exchange code for tokens

---

## ATHLETE

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/athlete/{id}` | Full athlete profile |
| PUT | `/api/v1/athlete/{id}` | Update profile (partial) |
| GET | `/api/v1/athlete/{id}/settings` | Sport settings, power/HR/pace zones |
| GET | `/api/v1/athlete-summary` | List of coached athletes |
| GET | `/api/v1/athlete/{id}/fitness` | CTL/ATL/TSB over date range |
| GET | `/api/v1/whoami` | Returns authenticated athlete |

**Athlete key fields:** `id`, `username`, `firstname`, `lastname`, `weight` (kg), `ftp` (W), `lthr` (bpm), `threshold_pace` (m/s), `athlete_type`, `sex`, `timezone`, `icu_power_zones`, `icu_hr_zones`, `icu_pace_zones`

**Fitness query params:** `oldest` (yyyy-MM-dd), `newest` (yyyy-MM-dd), `etype` (sport type filter)

---

## ACTIVITIES

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/athlete/{id}/activities` | List activities (add `.csv` for CSV) |
| POST | `/api/v1/athlete/{id}/activities` | Upload activity file (multipart/form-data) |
| GET | `/api/v1/activity/{id}` | Single activity detail |
| PUT | `/api/v1/activity/{id}` | Update activity (partial, use -1 to clear numeric) |
| DELETE | `/api/v1/activity/{id}` | Delete activity |
| GET | `/api/v1/activity/{id}/power-curve` | MMP curve (various durations) |
| GET | `/api/v1/activity/{id}/hr-zones` | Time in HR zones |
| GET | `/api/v1/activity/{id}/power-zones` | Time in power zones |
| GET | `/api/v1/activity/{id}/segments` | Strava segments |
| POST | `/api/v1/activity/{id}/refresh` | Force re-analysis |

**List query params:** `oldest`, `newest` (yyyy-MM-dd)

**Upload form params:** `file` (fit/tcx/gpx/zip/gz), optional query: `name`, `description`, `external_id`

**Activity key fields:** `id`, `start_date_local`, `type`, `name`, `distance` (m), `moving_time` (s), `elapsed_time` (s), `total_elevation_gain` (m), `average_speed` (m/s), `average_heartrate` (bpm), `average_watts` (W), `weighted_average_watts` (W), `icu_training_load`, `icu_intensity` (%), `icu_ftp`, `icu_w_prime`, `icu_ctl`, `icu_atl`, `icu_tsb`, `calories`, `file_type`

**With `?intervals=true`:** adds `icu_intervals[]` array — see INTERVALS section.

---

## ACTIVITY FILES

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/activity/{id}/file` | Original file (fit/gpx/tcx), gzip compressed |
| GET | `/api/v1/activity/{id}/fit-file` | Intervals.icu generated FIT (laps = detected intervals) |
| GET | `/api/v1/activity/{id}/strava` | Linked Strava activity info |

```bash
curl 'https://intervals.icu/api/v1/activity/i55751783/file' -H 'Authorization: Bearer <tok>' > activity.fit.gz
```

---

## INTERVALS (within activity)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/activity/{id}/intervals` | Detected/manual intervals |
| PUT | `/api/v1/activity/{id}/intervals` | Update intervals |
| GET | `/api/v1/athlete/{id}/intervals` | Aggregated intervals across activities |

**Interval fields:** `id`, `type` (WORK/REST/PAUSE/WARMUP/COOLDOWN), `start_index`, `end_index`, `start_time`, `end_time`, `distance` (m), `moving_time` (s), `average_watts`, `min_watts`, `max_watts`, `weighted_average_watts`, `intensity` (%), `zone`, `training_load`, `joules`, `joules_above_ftp`, `average_heartrate`, `min_heartrate`, `max_heartrate`, `average_cadence`, `average_speed`, `average_torque`, `total_elevation_gain`, `decoupling` (%), `group_id`, `label`, `estimated_cp`

**Aggregate query params:** `oldest`, `newest` (yyyy-MM-dd), `type` (sport)

---

## STREAMS (raw time-series data)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/activity/{id}/streams` | Raw streams (arrays of values per second) |
| GET | `/api/v1/athlete/{id}/custom-streams` | List custom streams |
| POST | `/api/v1/athlete/{id}/custom-streams` | Create custom stream |
| PUT | `/api/v1/athlete/{id}/custom-streams/{id}` | Update custom stream |
| DELETE | `/api/v1/athlete/{id}/custom-streams/{id}` | Delete custom stream |

**Available stream types:**

| Stream | Unit | Notes |
|--------|------|-------|
| `time` | s | Seconds from start |
| `distance` | m | Cumulative |
| `altitude` | m | Raw |
| `fixed_altitude` | m | Gap-filled + elevation corrected |
| `velocity_smooth` | m/s | Smoothed speed |
| `heartrate` | bpm | Raw |
| `fixed_heartrate` | bpm | Gap-filled — use for calculations |
| `cadence` | rpm/spm | Raw |
| `fixed_cadence` | rpm/spm | Gap-filled |
| `watts` | W | Raw power |
| `fixed_watts` | W | Gap-filled — use for calculations |
| `temp` | °C | Ambient temperature |
| `grade_smooth` | % | Smoothed gradient |
| `latlng` | degrees | Array of [lat, lon] |
| `moving` | bool | Athlete moving flag |
| `core_temperature` | °C | Core temp sensor (if present) |
| `left_right_balance` | % | Bilateral power balance |
| `respiration_rate` | breaths/min | Garmin/Tyme Wear |
| `smo2` | % | Muscle O2 saturation (Moxy/BSX) |
| `thb` | g/dL | Total haemoglobin (Moxy/BSX) |
| `power_hr` | W/bpm | EF ratio (computed by Intervals) |
| `vam` | m/h | Vertical ascent speed (client-side) |

---

## EVENTS (Calendar)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/athlete/{id}/events` | List events (add `.ics` for iCalendar) |
| GET | `/api/v1/athlete/{id}/events/{eventId}` | Single event |
| POST | `/api/v1/athlete/{id}/events` | Create event |
| PUT | `/api/v1/athlete/{id}/events/{eventId}` | Update event (partial) |
| DELETE | `/api/v1/athlete/{id}/events/{eventId}` | Delete event |
| GET | `/api/v1/athlete/{id}/events/{eventId}/download{ext}` | Download workout (.zwo / .mrc / .erg) |

**List query params:** `oldest`, `newest` (yyyy-MM-dd), `calendar_id`, `resolve` (bool — resolves power/HR to real values)

**Event categories:** `WORKOUT`, `RACE`, `NOTE`, `HOLIDAY`, `TARGET`

**Create workout (text description):**
```json
{
  "start_date_local": "2025-03-01T00:00:00",
  "category": "WORKOUT",
  "type": "Ride",
  "name": "Sweet spot",
  "description": "- W/U 15m\n- 3x12m 88-93%\n- C/D 10m",
  "moving_time": 4800,
  "icu_training_load": 95
}
```

**Create workout from file:**
```json
{
  "category": "WORKOUT",
  "start_date_local": "2025-03-01T00:00:00",
  "type": "Ride",
  "filename": "4x8m.zwo",
  "file_contents": "<?xml version=\"1.0\"...>"
}
```

**workout_doc structure (parsed steps):**
```json
{
  "steps": [
    { "power": { "units": "%ftp", "value": 60 }, "duration": 1200 },
    { "power": { "units": "%ftp", "value": 110 }, "duration": 480, "repeat": 4, "rest_duration": 480 }
  ],
  "duration": 5640,
  "zoneTimes": [1920, 1800, 0, 0, 1920, 0, 0],
  "hrZoneTimes": [...]
}
```

---

## CALENDARS

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/athlete/{id}/calendars` | List all calendars |
| POST | `/api/v1/athlete/{id}/calendars` | Create calendar |
| PUT | `/api/v1/athlete/{id}/calendars/{calendarId}` | Update calendar |
| DELETE | `/api/v1/athlete/{id}/calendars/{calendarId}` | Delete calendar |

---

## WORKOUTS (Library)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/athlete/{id}/workouts` | List workouts (excluding shared by others) |
| GET | `/api/v1/athlete/{id}/workouts/{workoutId}` | Single workout with workout_doc |
| POST | `/api/v1/athlete/{id}/workouts` | Create workout |
| PUT | `/api/v1/athlete/{id}/workouts/{workoutId}` | Update workout |
| DELETE | `/api/v1/athlete/{id}/workouts/{workoutId}` | Delete workout |
| POST | `/api/v1/download-workout{ext}` | Convert workout JSON to .zwo/.mrc/.erg |

---

## FOLDERS (Workout Library)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/athlete/{id}/folders` | List folders + workouts (tree) |
| POST | `/api/v1/athlete/{id}/folders` | Create folder |
| PUT | `/api/v1/athlete/{id}/folders/{folderId}` | Update folder |
| DELETE | `/api/v1/athlete/{id}/folders/{folderId}` | Delete folder |
| GET | `/api/v1/athlete/{id}/folders/{folderId}/shared-with` | View sharing |
| PUT | `/api/v1/athlete/{id}/folders/{folderId}/shared-with` | Update sharing |

---

## WELLNESS

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/athlete/{id}/wellness` | List wellness records (add `.csv` for CSV) |
| GET | `/api/v1/athlete/{id}/wellness/{date}` | Single day (date = yyyy-MM-dd) |
| PUT | `/api/v1/athlete/{id}/wellness/{date}` | Update single day (partial) |
| PUT | `/api/v1/athlete/{id}/wellness-bulk` | Bulk update (array of objects with `id` field) |
| GET | `/api/v1/athlete/{id}/custom-wellness-fields` | List custom wellness fields |
| POST | `/api/v1/athlete/{id}/custom-wellness-fields` | Create custom wellness field |
| PUT | `/api/v1/athlete/{id}/custom-wellness-fields/{fieldId}` | Update field |
| DELETE | `/api/v1/athlete/{id}/custom-wellness-fields/{fieldId}` | Delete field |

**Wellness fields (all metric units):**

| Field | Type | Unit | Description |
|-------|------|------|-------------|
| `id` | string | yyyy-MM-dd | Date (required for bulk) |
| `weight` | number | kg | Body weight |
| `restingHR` | integer | bpm | Morning resting HR |
| `hrv` | number | ms | Heart rate variability |
| `hrv4t` | number | — | HRV4Training score |
| `sleepSecs` | integer | s | Sleep duration |
| `sleepScore` | number | 0-100 | Sleep quality |
| `avgSleepHR` | number | bpm | Average HR during sleep |
| `sleepDeepSecs` | integer | s | Deep sleep duration |
| `sleepRemSecs` | integer | s | REM sleep duration |
| `steps` | integer | — | Daily steps |
| `spO2` | number | % | Blood oxygen saturation |
| `kcalConsumed` | number | kcal | Calories consumed |
| `readiness` | number | 0-100 | Readiness score (Oura/Garmin) |
| `vo2max` | number | ml/kg/min | VO2max estimate |
| `menstrualPhase` | string | — | Menstrual cycle phase |
| `locked` | boolean | — | Prevents sync override |

**IMPORTANT:** Use `"locked": true` when writing via API to prevent auto-sync (Oura, Garmin, etc.) from overwriting values.

```bash
# Single day update
curl -X PUT 'https://intervals.icu/api/v1/athlete/0/wellness/2025-02-17' \
  -u API_KEY:<key> -H 'Content-Type: application/json' \
  -d '{"weight": 70.2, "hrv": 45.3, "locked": true}'

# Bulk update
curl -X PUT 'https://intervals.icu/api/v1/athlete/0/wellness-bulk' \
  -H 'Authorization: Bearer <tok>' -H 'Content-Type: application/json' \
  -d '[{"id":"2025-02-17","weight":70.2},{"id":"2025-02-16","hrv":48}]'
```

---

## TRAINING PLANS

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/athlete/{id}/training-plans` | List available plans |
| GET | `/api/v1/athlete/{id}/training-plans/{planId}` | Plan detail |
| POST | `/api/v1/athlete/{id}/training-plans/{planId}/apply` | Apply plan to calendar |

Apply body: `{ "start_date": "2025-03-01", "race_date": "2025-06-01" }`

---

## CUSTOM ACTIVITY FIELDS (API)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/athlete/{id}/custom-activity-fields` | List custom activity fields |
| POST | `/api/v1/athlete/{id}/custom-activity-fields` | Create field |
| PUT | `/api/v1/athlete/{id}/custom-activity-fields/{fieldId}` | Update field |
| DELETE | `/api/v1/athlete/{id}/custom-activity-fields/{fieldId}` | Delete field |

---

## WEBHOOKS

Configure in `/settings` → Manage App. Response must be 2xx or Intervals retries with exponential backoff. Activity webhooks NOT sent for Strava activities.

**Event types:**

| Type | Description | Delay |
|------|-------------|-------|
| `ACTIVITY_UPLOADED` | New activity uploaded | immediate |
| `ACTIVITY_ANALYZED` | Activity analyzed | ~60s (batched) |
| `ACTIVITY_DELETED` | Activity deleted | immediate |
| `CALENDAR_UPDATED` | Calendar event created/modified/deleted | variable |
| `WELLNESS_UPDATED` | Wellness data updated | immediate |

**Payload structure:**
```json
{
  "secret": "ooKeodacie8I",
  "events": [{
    "athlete_id": "2049151",
    "type": "ACTIVITY_UPLOADED",
    "timestamp": "2025-02-17T10:40:47.011+00:00",
    "activity": {}
  }]
}
```

`CALENDAR_UPDATED` payload also includes `oauth_client_id` and `external_id` for filtering your app's events. `deleted_events` array for deletions.

---

---

# JAVASCRIPT EXTENSIONS

## OVERVIEW

Intervals.icu runs JavaScript in a secure server-side sandbox (GraalJS/Nashorn). Scripts execute when an activity is analyzed. Results are saved as native data.

**6 extension types:**
1. Custom Wellness Fields — no code, config only
2. Custom Activity Fields — manual / JS computed / FIT file mapped
3. Custom Interval Fields — JS computed per interval
4. Custom Activity Streams — from FIT record fields / JS computed / FIT messages
5. Custom Activity Charts — Plotly.js charts in activity pages
6. Custom Fitness Charts — plots on Fitness/Compare pages

**TypeScript data model for code completion:**
```bash
npm install @intervals-icu/js-data-model
```
Provides interfaces: `ActivityJsData`, `Activity`, `Athlete`, `Interval`, `ActivityStreamSet`, `JsChartData`, `JsStreamData`, etc.

---

## SANDBOX RULES

- **Variable declaration:** Variables are implicitly global. Do NOT use `let/var/const` at top level if sharing sandbox with other scripts (activity fields all share the same sandbox instance). Wrap in block `{ }` to scope safely.
- **Return value:** The last expression is the return value. Use `null` for empty.
- **Modifying activity:** Scripts can write to `activity.*` fields (e.g. `activity.icu_training_load = v`) — changes are saved.
- **Available globals:** `Math`, `Array`, `JSON`, `parseInt`, `parseFloat`, `console.log()`
- **NOT available:** network requests, filesystem, setTimeout

```javascript
// WRONG — will fail when another field script also uses 'let x'
let x = 42
x * 2

// CORRECT — wrap in block
{
  let x = 42
  x * 2
}

// CORRECT — implicit globals (only if no other field uses same name)
x = 42
x * 2
```

---

## THE `icu` OBJECT (lazy-loaded)

Available in all JS extension types:

| Property | Type | Description |
|----------|------|-------------|
| `icu.activity` | Activity | Current activity (same as global `activity`) |
| `icu.athlete` | Athlete | Athlete profile |
| `icu.streams` | ActivityStreamSet | All activity streams |
| `icu.wellness` | Wellness | Wellness record for activity day |
| `icu.powerCurve` | PowerCurve | MMP curve — `.watts(durationSecs)` |
| `icu.powerCurveFatigued0` | PowerCurve | MMP after some kJ of work |
| `icu.powerCurveFatigued1` | PowerCurve | MMP after more kJ of work |
| `icu.hrCurve` | HrCurve | HR duration curve |
| `icu.paceCurve` | PaceCurve | Distance vs time curve |
| `icu.gapCurve` | PaceCurve | Gradient-adjusted pace curve |
| `icu.sportSettings` | SportSettings | Settings for activity's sport |
| `icu.fit` | FitFile | Raw FIT messages (only in "fit file messages" scripts) |

---

## `activity` OBJECT — KEY PROPERTIES

```
activity.id                      // string, e.g. "i55751783"
activity.type                    // string: Ride, Run, Swim, etc.
activity.icu_ftp                 // number, W
activity.icu_lthr                // number, bpm
activity.icu_resting_hr          // number, bpm
activity.athlete_max_hr          // number, bpm
activity.icu_weight              // number, kg (at time of activity)
activity.average_watts           // number, W
activity.weighted_average_watts  // number, W (NP/xPace equivalent)
activity.icu_training_load       // number (writable from script)
activity.icu_intensity           // number, %
activity.moving_time             // number, seconds
activity.elapsed_time            // number, seconds
activity.distance                // number, meters
activity.total_elevation_gain    // number, meters
activity.average_heartrate       // number, bpm
activity.average_speed           // number, m/s
activity.average_cadence         // number, rpm or spm
activity.average_stride          // number, m (swim stroke length)
activity.joules                  // number, kJ
activity.joules_above_ftp        // number, kJ
activity.icu_intervals           // Interval[] — detected intervals array
```

---

## `interval` OBJECT — KEY PROPERTIES (Interval Fields only)

```
interval.type                    // WORK | REST | PAUSE | WARMUP | COOLDOWN
interval.start_index             // number — index into streams
interval.end_index               // number — index into streams
interval.moving_time             // number, seconds
interval.distance                // number, meters
interval.average_watts           // number, W
interval.weighted_average_watts  // number, W
interval.average_heartrate       // number, bpm
interval.average_cadence         // number
interval.average_speed           // number, m/s
interval.intensity               // number, %
interval.training_load           // number
interval.joules                  // number, kJ
interval.joules_above_ftp        // number, kJ
interval.decoupling              // number, %
interval.total_elevation_gain    // number, m
interval.label                   // string | null
interval.group_id                // string — for repeat groups
```

---

## EXTENSION TYPE: CUSTOM ACTIVITY FIELDS

**Where:** Activity page → Custom (below timeline chart)

**Modes:**
- **Manual** — user enters value by hand
- **JS Computed** — script runs on every analysis
- **FIT field** — maps to session/record FIT message field automatically

**Field config:**
- `code` — CamelCase, unique, do not change after use. Built-in fields start lowercase.
- `type` — Number | Text | Select (text→number map)
- `units` — `m/s`, `m`, `s`, `W`, etc. — enables auto-conversion for display
- `aggregate` — sum | min | max | average (for Fitness page plots with multiple activities/day)
- `fit_field` — field name in FIT session message. Prefix with message name for other messages: `set.weight`, `device_info.manufacturer`

**Available in script:** `activity`, `field`, `icu`, `streams` (alias of `icu.streams`)

**Common FIT session fields:**
- `total_training_effect` — Garmin aerobic TE
- `total_anaerobic_training_effect` — Garmin anaerobic TE
- `avg_left_right_balance`, `avg_left_pedal_smoothness`, `avg_left_torque_effectiveness`
- `avg_stance_time`, `avg_vertical_oscillation`, `avg_step_length`, `avg_ground_contact_balance`
- `total_grit`, `avg_flow` (MTB Garmin), `jump_count`

**Script examples:**

```javascript
// W/kg
activity.average_watts / activity.icu_weight

// Aerobic Efficiency (EF)
activity.average_watts / activity.average_heartrate

// Power at 5 min from power curve
{
  let pc = icu.powerCurve
  pc ? pc.watts(300) : null
}

// Custom training load (also writes back to activity)
{
  let load = /* your calculation */
  activity.icu_training_load = load
  load
}

// Read wellness of activity day
{
  let w = icu.wellness
  w && w.hrv ? w.restingHR / w.hrv : null
}
```

---

## EXTENSION TYPE: CUSTOM INTERVAL FIELDS

**Where:** Activity timeline → Fields button → Add Field

**Available in script:** `interval`, `activity`, `field`, `icu`

Script is called ONCE PER INTERVAL in same sandbox — use `{ }` blocks to scope variables.

**Script examples:**

```javascript
// Distance per stroke (swimming)
interval.average_stride * 2

// % work above FTP
interval.joules_above_ftp * 100 / interval.joules

// Average P/HRR for interval
{
  let mhr = activity.athlete_max_hr
  let rhr = activity.icu_resting_hr
  let hr = icu.streams.fixed_heartrate
  let power = icu.streams.fixed_watts
  let tot = 0, c = 0
  for (let i = interval.start_index; i < interval.end_index; i++) {
    let v = power[i] / (((hr[i] - rhr) / (mhr - rhr)) * 100)
    if (v && isFinite(v)) { tot += v; c++ }
  }
  c ? tot / c : null
}

// Average core temperature in interval
{
  let temp = icu.streams.core_temperature
  if (!temp) null
  else {
    let tot = 0, c = 0
    for (let i = interval.start_index; i < interval.end_index; i++) {
      if (temp[i]) { tot += temp[i]; c++ }
    }
    c ? tot / c : null
  }
}

// Running time % (cadence >= 60 = running)
{
  let cad = icu.streams.cadence
  let run = 0, tot = 0
  for (let i = interval.start_index; i < interval.end_index; i++) {
    tot++
    if (cad[i] >= 60) run++
  }
  tot > 0 ? (run / tot) * 100 : null
}
```

---

## EXTENSION TYPE: CUSTOM ACTIVITY STREAMS

**Where:** Charts button → Custom Streams

**Three sub-types:**

### A) Record Field (no code)
Enter a FIT record message field name (case-sensitive). Automatically extracts that field per second from FIT record messages.

### B) JS Computed Stream
Runs on re-analysis. Does NOT have access to `icu.fit`.

**Available:** `data` (output array), `data.time`, `data.startTimestamp`, `data.setAt(ts, val)`, `activity`, `icu.*`

```javascript
// Power / HR (EF stream)
{
  let hr = icu.streams.fixed_heartrate
  let watts = icu.streams.fixed_watts
  for (let i = 0; i < data.length; i++) data[i] = watts[i] / hr[i]
}

// HR Reserve %
{
  let mhr = activity.athlete_max_hr
  let rhr = activity.icu_resting_hr
  let hr = icu.streams.fixed_heartrate
  for (let i = 0; i < data.length; i++)
    data[i] = hr[i] ? ((hr[i] - rhr) / (mhr - rhr)) * 100 : null
}

// Estimated power from VAM (climbs > 2% gradient only)
{
  let alt = icu.streams.fixed_altitude
  let grade = icu.streams.grade_smooth
  let weight = activity.icu_weight
  for (let i = 1; i < data.length; i++) {
    let vam = (alt[i] - alt[i-1]) * 3600
    let g = grade[i] || 0
    data[i] = g > 2 ? (vam / (200 + 10 * g)) * weight : null
  }
}
```

### C) FIT Message Stream (tick "Processes fit file messages")
Runs only on file upload/reprocess. Has access to `icu.fit` (all FIT messages array).

```javascript
// Di2/eTap rear gear stream
{
  let rear_gear
  function fixValue(value) {
    value = Array.isArray(value) ? value[0] : value
    return value === 0 ? null : value
  }
  for (let m of icu.fit) {
    switch (m.event?.valueName) {
      case "REAR_GEAR_CHANGE":
      case "FRONT_GEAR_CHANGE":
        rear_gear = fixValue(m.rear_gear?.value)
    }
    let ts = m.timestamp
    if (ts) data.setAt(ts.value, rear_gear)
  }
}
```

---

## EXTENSION TYPE: CUSTOM ACTIVITY CHARTS

**Where:** Charts button in activity HR/Power/Pace/Data pages

**Library:** [Plotly.js](https://plotly.com/javascript/) — any chart type supported (bar, scatter, line, pie, heatmap, 3D, etc.)

**Available:** `activity`, `icu.*` (streams, wellness, powerCurve, hrCurve, paceCurve, sportSettings)

**Output:** assign `chart = { data: [...traces], layout: {...} }`

**Script examples:**

```javascript
// Average power per work interval (bar chart)
{
  let x = [], y = []
  let intervals = activity.icu_intervals || []
  for (let i = 0, c = 0; i < intervals.length; i++) {
    let iv = intervals[i]
    if (iv.type !== 'WORK') continue
    ++c
    x.push(iv.label || c)
    y.push(iv.average_watts)
  }
  chart = {
    data: [{ x, y, type: 'bar', marker: { color: '#6366f1', opacity: 0.8 } }],
    layout: {
      title: { text: "Average power per interval" },
      margin: { l: 40, r: 20, t: 40, b: 30 }
    }
  }
}

// Power vs HR scatter per interval (dual-metric)
{
  let ivs = (activity.icu_intervals || []).filter(iv => iv.type === 'WORK')
  chart = {
    data: [
      { x: ivs.map(iv => iv.average_watts), y: ivs.map(iv => iv.average_heartrate),
        mode: 'markers', type: 'scatter',
        text: ivs.map((iv, i) => `Rep ${i+1}`), textposition: 'top center',
        marker: { size: 10, color: '#e94560' } }
    ],
    layout: {
      xaxis: { title: 'Power (W)' },
      yaxis: { title: 'HR (bpm)' },
      title: { text: 'HR vs Power per interval' }
    }
  }
}

// Power zone distribution (pie)
{
  let watts = icu.streams.fixed_watts
  let ftp = activity.icu_ftp
  let zones = [0,0,0,0,0,0,0]
  let labels = ['Z1 Rec','Z2 End','Z3 Tempo','Z4 Thresh','Z5 VO2','Z6 Anaer','Z7 Neuro']
  let pcts = [0.55, 0.75, 0.90, 1.05, 1.20, 1.50, Infinity]
  for (let w of watts) {
    if (!w) continue
    let z = pcts.findIndex(p => w/ftp <= p)
    if (z >= 0) zones[z]++
  }
  chart = {
    data: [{ values: zones, labels, type: 'pie', hole: 0.4 }],
    layout: { title: 'Power zone distribution' }
  }
}

// Dual-axis: Power + HR progression across intervals
{
  let ivs = (activity.icu_intervals || []).filter(iv => iv.type === 'WORK')
  let x = ivs.map((_, i) => i + 1)
  chart = {
    data: [
      { x, y: ivs.map(iv => iv.average_watts), name: 'Power (W)',
        type: 'scatter', mode: 'lines+markers', marker: { color: '#6366f1' }, yaxis: 'y1' },
      { x, y: ivs.map(iv => iv.average_heartrate), name: 'HR (bpm)',
        type: 'scatter', mode: 'lines+markers', marker: { color: '#e94560' }, yaxis: 'y2' }
    ],
    layout: {
      title: 'Power & HR progression',
      yaxis:  { title: 'Power (W)', side: 'left' },
      yaxis2: { title: 'HR (bpm)', side: 'right', overlaying: 'y' }
    }
  }
}
```

---

## CUSTOM WELLNESS FIELDS — CONFIG REFERENCE

**Where:** Wellness dialog → Fields → + button

| Property | Rule |
|----------|------|
| `code` | CamelCase, no leading digit, unique. Do not change after use. Same code = same field across athletes. |
| `type` | Number \| Text \| Select |
| `units` | Display unit string |
| `icon` | Emoji or Material Icons name |
| `min` / `max` | Input validation range |
| `aggregate` | sum \| min \| max \| average (for multi-activity days on Fitness plots) |
| `shared` | Public to community (read-only copy per athlete) |

**Select type** maps display text to stored number — useful for Likert scales (1–5 wellness, RPE, etc.).

Custom wellness fields are accessible via API with their `code` as the JSON key:
```json
{ "weight": 70.2, "MuscleStiffness": 3, "StressLevel": 2 }
```

---

## COMPUTED FIELDS FROM FIT MESSAGES — KEY PATTERNS

```javascript
// Iterate all messages
for (let m of icu.fit) { /* m is a FIT message object */ }

// Iterate specific message type
for (let m of icu.fit.device_info) { }
for (let m of icu.fit.record) { }
for (let m of icu.fit.session) { }

// Access field value
m.heart_rate?.value
m.event?.valueName
m.timestamp?.value      // FIT absolute timestamp (use with data.setAt)

// data.setAt helper (for streams)
data.setAt(m.timestamp.value, someValue)
// Equivalent to: find index where stream time matches, set data[index] = someValue
```

---

## CURL QUICK REFERENCE

```bash
# Download activities as CSV
curl -u API_KEY:<k> 'https://intervals.icu/api/v1/athlete/0/activities.csv?oldest=2025-01-01&newest=2025-01-31' -o out.csv

# Upload FIT file
curl -F file=@activity.fit 'https://intervals.icu/api/v1/athlete/0/activities?name=Morning+ride' -u API_KEY:<k>

# Get activity with intervals
curl -u API_KEY:<k> 'https://intervals.icu/api/v1/activity/i55751783?intervals=true'

# Create calendar event (workout)
curl -X POST 'https://intervals.icu/api/v1/athlete/0/events' \
  -u API_KEY:<k> -H 'Content-Type: application/json' \
  -d '{"start_date_local":"2025-03-01T00:00:00","category":"WORKOUT","type":"Ride","name":"Z2","description":"- 2h 65%","moving_time":7200}'

# Update wellness (single day)
curl -X PUT 'https://intervals.icu/api/v1/athlete/0/wellness/2025-02-17' \
  -u API_KEY:<k> -H 'Content-Type: application/json' \
  -d '{"weight":70.1,"hrv":48.5,"restingHR":51,"locked":true}'

# Bulk wellness update
curl -X PUT 'https://intervals.icu/api/v1/athlete/0/wellness-bulk' \
  -H 'Authorization: Bearer <tok>' -H 'Content-Type: application/json' \
  -d '[{"id":"2025-02-17","weight":70.2},{"id":"2025-02-16","hrv":48}]'

# Download original activity file
curl 'https://intervals.icu/api/v1/activity/i55751783/file' \
  -H 'Authorization: Bearer <tok>' > activity.fit.gz
```

---

## PYTHON (py-intervalsicu community library)

```python
pip install intervalsicu

from intervalsicu import Intervals
from datetime import date

svc = Intervals("ATHLETE_ID", "API_KEY")

activities = svc.activities(date(2025, 1, 1), date(2025, 1, 31))
wellness = svc.wellness(date(2025, 2, 17))
wellness['weight'] = 70.2
svc.wellness_put(wellness)
```

---

## LINKS

- API docs (interactive): https://intervals.icu/api-docs.html
- Forum: API access: https://forum.intervals.icu/t/api-access-to-intervals-icu/609
- Forum: Integration Cookbook: https://forum.intervals.icu/t/intervals-icu-api-integration-cookbook/80090
- Forum: Extending Intervals.icu (JS index): https://forum.intervals.icu/t/extending-intervals-icu/46565
- Forum: Computed activity fields: https://forum.intervals.icu/t/computed-activity-fields/25673
- Forum: Custom interval fields: https://forum.intervals.icu/t/custom-interval-fields/25942
- Forum: Custom activity charts: https://forum.intervals.icu/t/custom-activity-charts/28627
- Forum: Custom streams with JS: https://forum.intervals.icu/t/custom-activity-streams-with-javascript/46416
- Forum: Streams from FIT messages: https://forum.intervals.icu/t/custom-activity-streams-from-fit-file-messages/46334
- npm data model: https://www.npmjs.com/package/@intervals-icu/js-data-model
- Plotly.js docs: https://plotly.com/javascript/
- OAuth: https://forum.intervals.icu/t/intervals-icu-oauth-support/2759

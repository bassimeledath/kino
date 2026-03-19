# Kino vs Screen Studio — Zoom Comparison Workflow

## Overview

Compare Kino's zoom behavior against Screen Studio by recording the same browsing session with both apps, then programmatically analyzing the data. No video analysis needed — both apps save structured data that can be diffed directly.

## What Each App Saves

### Screen Studio
- **Location:** `~/Screen Studio Projects/<name>.screenstudio/project.json`
- **Key data:** `data.json.scenes[0].zoomRanges` — array of zoom events:
  ```json
  {
    "id": "XMfdd5wVGA",
    "zoom": 1.902,
    "type": "follow-click-groups",
    "startTime": 992,      // ms from recording start
    "endTime": 3905,        // ms from recording start
    "snapToEdgesRatio": 0.25,
    "isDisabled": false,
    "hasInstantAnimation": false
  }
  ```
- **Spring parameters:** `data.json.config.screenMovementSpring`, `mouseMovementSpring`, `mouseClickSpring`
- **Settings:** `data.json.config.*` — cursorSize, shadowIntensity, backgroundGradient, etc.

### Kino
- **Location:** `~/Desktop/kino/benchmarks/cursor-log.json` (saved automatically on recording stop)
- **Key data:** Array of cursor frames at ~60Hz:
  ```json
  { "t": 1234, "x": 800, "y": 450, "click": true }
  ```
- **Zoom events:** Must be inferred from click transitions in the cursor log (click=false→true = mousedown). Kino's zoom controller groups clicks within 2s into zoom sessions.
- **Spring parameters:** Hardcoded in `src/renderer/engine/spring-camera.ts` and `src/renderer/store/recording.ts`

## Recording Workflow (Manual — ~2 minutes)

### Step 1: Prepare a browsing scenario
Pick a ~20 second browsing session. Good scenarios include:
- Open Hacker News, click 2-3 story links, navigate back between them
- Open a documentation page, click through sections
- Any natural browsing with 4-8 clicks and pauses between them

### Step 2: Record with Screen Studio
1. Open Screen Studio
2. Record > Record display > Start recording
3. Perform the browsing scenario
4. Stop recording (click stop in menu bar, or Record > Record display again)
5. Screen Studio auto-saves the project

### Step 3: Record with Kino
1. Open Kino (`cd ~/Desktop/kino && npm run dev`)
2. Click Record, wait for countdown
3. Perform the SAME browsing scenario (as close as possible)
4. Click Stop
5. Kino auto-saves `benchmarks/cursor-log.json`
6. Export MP4 (optional — for visual review)

### Step 4: Tell the LLM you're done
Say: "I've recorded with both apps. Analyze the comparison."

## Analysis Workflow (Automated — LLM does this)

### Step 1: Find the data files

```bash
# Screen Studio — find newest project
ls -t ~/Screen\ Studio\ Projects/ | head -1
# Read its project.json
cat "~/Screen Studio Projects/<newest>/project.json"

# Kino — cursor log is always at the same path
cat ~/Desktop/kino/benchmarks/cursor-log.json
```

### Step 2: Extract Screen Studio zoom data

```javascript
const fs = require('fs');
const project = JSON.parse(fs.readFileSync('<path>/project.json', 'utf8'));
const config = project.json.config;
const zoomRanges = project.json.scenes[0].zoomRanges;

// Zoom behavior
console.log('Zoom count:', zoomRanges.length);
console.log('Zoom level:', zoomRanges[0]?.zoom);
console.log('Zoom type:', zoomRanges[0]?.type);

const totalZoomed = zoomRanges.reduce((sum, r) => sum + (r.endTime - r.startTime), 0);
const totalDuration = zoomRanges[zoomRanges.length - 1]?.endTime || 0;
console.log('Total zoomed:', totalZoomed, 'ms');
console.log('Pct zoomed:', (totalZoomed / totalDuration * 100).toFixed(1) + '%');

// Gaps between zooms
for (let i = 1; i < zoomRanges.length; i++) {
  console.log('Gap', i, ':', zoomRanges[i].startTime - zoomRanges[i-1].endTime, 'ms');
}

// Spring parameters
console.log('Screen spring:', JSON.stringify(config.screenMovementSpring));
console.log('Mouse spring:', JSON.stringify(config.mouseMovementSpring));
console.log('Click spring:', JSON.stringify(config.mouseClickSpring));
console.log('Cursor size:', config.cursorSize);
console.log('Shadow:', config.shadowIntensity, config.shadowBlur);
```

### Step 3: Extract Kino zoom data

```javascript
const log = JSON.parse(fs.readFileSync('benchmarks/cursor-log.json', 'utf8'));

// Detect click events (false→true transitions)
const clicks = [];
for (let i = 1; i < log.length; i++) {
  if (log[i].click && !log[i-1].click) clicks.push(log[i].t);
}
console.log('Click count:', clicks.length);

// Estimate zoom ranges using Kino's click-group logic:
// Clicks within 2000ms of each other form a group
// Each group creates a zoom range: starts at first click, ends 2000ms after last click
const groups = [];
let groupStart = null, groupEnd = null;
for (const t of clicks) {
  if (groupStart === null) {
    groupStart = t;
    groupEnd = t;
  } else if (t - groupEnd <= 2000) {
    groupEnd = t; // extend group
  } else {
    groups.push({ startTime: groupStart, endTime: groupEnd + 2000 });
    groupStart = t;
    groupEnd = t;
  }
}
if (groupStart !== null) groups.push({ startTime: groupStart, endTime: groupEnd + 2000 });

console.log('Zoom groups:', groups.length);
const totalZoomed = groups.reduce((sum, g) => sum + (g.endTime - g.startTime), 0);
console.log('Total zoomed:', totalZoomed, 'ms');

// Kino's current spring parameters (read from source or settings)
// Default: stiffness=200, damping=40, mass=2.25
```

### Step 4: Compare and recommend

Produce a comparison table:

| Metric | Screen Studio | Kino | Delta | Action |
|--------|--------------|------|-------|--------|
| Zoom count | N | N | - | Match? |
| Zoom level | 1.902x | 1.9x | OK | - |
| Avg zoom duration | Xms | Yms | - | Adjust holdMs |
| Avg gap between zooms | Xms | Yms | - | Adjust cooldown |
| % time zoomed | X% | Y% | - | Should be similar |
| Screen spring stiffness | 200 | 200 | OK | - |
| Screen spring damping | 40 | 40 | OK | - |
| Screen spring mass | 2.25 | 2.25 | OK | - |
| Cursor shake threshold | 500 | 8px/frame | - | May need adjustment |

### Key parameters to tune in Kino

These are in `src/renderer/engine/zoom-controller.ts` and `src/renderer/store/recording.ts`:

| Parameter | File | Current | Description |
|-----------|------|---------|-------------|
| `autoZoomLevel` | recording.ts | 1.9 | Zoom level on click |
| `dwellZoomLevel` | recording.ts | 1.3 | Zoom level on dwell |
| `dwellDelay` | recording.ts | 4000 | Ms idle before dwell zoom |
| `clickGroupGapMs` | zoom-controller.ts | 2000 | Max gap between clicks to group |
| `clickHoldMinMs` | zoom-controller.ts | 2000 | Min hold time after click |
| `cooldownAfterZoomMs` | zoom-controller.ts | 500 | Cooldown before next zoom |
| `idleSpeedThreshold` | zoom-controller.ts | 15 | Speed below which cursor is "idle" |
| `screenSpringStiffness` | recording.ts | 200 | Camera spring stiffness |
| `screenSpringDamping` | recording.ts | 40 | Camera spring damping |
| `screenSpringMass` | recording.ts | 2.25 | Camera spring mass |

### What to look for

1. **Kino zooms too often?** → Increase `cooldownAfterZoomMs`, increase `clickGroupGapMs`
2. **Kino zooms too long?** → Decrease `clickHoldMinMs`
3. **Kino zooms too short?** → Increase `clickHoldMinMs`
4. **Transitions too fast?** → Increase `screenSpringMass`, decrease `screenSpringStiffness`
5. **Transitions too slow?** → Decrease `screenSpringMass`, increase `screenSpringStiffness`
6. **Camera moves when it shouldn't?** → Check that camera target = (0,0) at zoom 1.0x (render-loop.ts)
7. **Dwell zoom triggers too easily?** → Increase `dwellDelay`

## Existing comparison script

`~/Desktop/kino/benchmarks/compare-zoom-data.js` — reads both data sources and outputs a report. Can be improved with the analysis above.

## Screen Studio reference parameters

Extracted from `~/Screen Studio Projects/Built-in Retina Display 2026-03-18 17:26:41.screenstudio/project.json`:

```json
{
  "screenMovementSpring": { "stiffness": 200, "damping": 40, "mass": 2.25 },
  "mouseMovementSpring": { "stiffness": 470, "damping": 70, "mass": 3 },
  "mouseClickSpring": { "stiffness": 700, "damping": 30, "mass": 1 },
  "defaultZoomLevel": 1.902,
  "removeCurshorShakeTreshold": 500,
  "cursorSize": 1.5,
  "shadowIntensity": 0.75,
  "shadowBlur": 20,
  "alwaysKeepZoomedIn": false
}
```

Note: Screen Studio uses THREE separate springs (screen movement, cursor movement, click animation). Kino currently uses ONE spring for everything. Adding separate springs is a future improvement.

#!/usr/bin/env node
// POC: Compare Kino's auto-zoom behavior with Screen Studio's zoom ranges
const fs = require('fs');
const path = require('path');

// --- Load Kino cursor log ---
const cursorLog = JSON.parse(fs.readFileSync(path.join(__dirname, 'cursor-log.json'), 'utf8'));

// Group consecutive click=true frames into distinct click events
const kinoClicks = [];
let inClick = false;
for (const frame of cursorLog) {
  if (frame.click && !inClick) {
    kinoClicks.push({ startT: frame.t, endT: frame.t, x: frame.x, y: frame.y });
    inClick = true;
  } else if (frame.click && inClick) {
    kinoClicks[kinoClicks.length - 1].endT = frame.t;
  } else {
    inClick = false;
  }
}

const kinoDuration = cursorLog[cursorLog.length - 1].t - cursorLog[0].t;

// Kino doesn't store zoom ranges directly — estimate from click groups
// Each click group triggers a zoom-in. Assume zoom lasts ~2s after click group ends
// (this is a rough heuristic for the POC)
const ZOOM_HOLD_MS = 2000;
const kinoZooms = kinoClicks.map(c => ({
  startTime: c.startT,
  endTime: c.endT + ZOOM_HOLD_MS,
  trigger: `click at (${c.x}, ${c.y})`
}));

// Merge overlapping zoom ranges
const kinoMerged = [];
for (const z of kinoZooms) {
  if (kinoMerged.length && z.startTime <= kinoMerged[kinoMerged.length - 1].endTime) {
    kinoMerged[kinoMerged.length - 1].endTime = Math.max(kinoMerged[kinoMerged.length - 1].endTime, z.endTime);
  } else {
    kinoMerged.push({ ...z });
  }
}

// --- Load Screen Studio project ---
const ssDir = path.join(process.env.HOME, 'Screen Studio Projects');
const projects = fs.readdirSync(ssDir)
  .filter(f => f.endsWith('.screenstudio'))
  .sort()
  .reverse();

const ssProject = JSON.parse(
  fs.readFileSync(path.join(ssDir, projects[0], 'project.json'), 'utf8')
);
const ssZoomRanges = ssProject.json.scenes[0].zoomRanges || [];
const ssDuration = ssZoomRanges.length
  ? Math.max(...ssZoomRanges.map(z => z.endTime))
  : 0;

// --- Compute metrics ---
function computeMetrics(zooms, label) {
  const count = zooms.length;
  const durations = zooms.map(z => z.endTime - z.startTime);
  const totalZoomed = durations.reduce((a, b) => a + b, 0);
  const avgDuration = count ? totalZoomed / count : 0;

  const gaps = [];
  for (let i = 1; i < zooms.length; i++) {
    gaps.push(zooms[i].startTime - zooms[i - 1].endTime);
  }
  const avgGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;

  return { label, count, totalZoomed, avgDuration, avgGap, durations };
}

const kino = computeMetrics(kinoMerged, 'Kino (estimated)');
const ss = computeMetrics(ssZoomRanges, 'Screen Studio');

// --- Print comparison ---
const fmt = ms => (ms / 1000).toFixed(2) + 's';
const pad = (s, n) => String(s).padEnd(n);
const padr = (s, n) => String(s).padStart(n);

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║         Zoom Comparison: Kino vs Screen Studio            ║');
console.log('╠════════════════════════════════════════════════════════════╣');
console.log(`║ Screen Studio project: ${pad(projects[0].slice(0, 35), 35)}║`);
console.log(`║ Kino cursor log: ${pad(cursorLog.length + ' frames, ' + fmt(kinoDuration), 40)}║`);
console.log('╠════════════════════════════════════════════════════════════╣');

const W = 25;
console.log(`║ ${'Metric'.padEnd(20)} ${padr(kino.label, W)} ${padr(ss.label, W)}║`);
console.log('╟────────────────────────────────────────────────────────────╢');
console.log(`║ ${'Zoom count'.padEnd(20)} ${padr(kino.count, W)} ${padr(ss.count, W)}║`);
console.log(`║ ${'Total zoomed'.padEnd(20)} ${padr(fmt(kino.totalZoomed), W)} ${padr(fmt(ss.totalZoomed), W)}║`);
console.log(`║ ${'Avg zoom duration'.padEnd(20)} ${padr(fmt(kino.avgDuration), W)} ${padr(fmt(ss.avgDuration), W)}║`);
console.log(`║ ${'Avg gap between'.padEnd(20)} ${padr(fmt(kino.avgGap), W)} ${padr(fmt(ss.avgGap), W)}║`);
console.log('╠════════════════════════════════════════════════════════════╣');

console.log('║ Individual zoom ranges:                                   ║');
console.log('╟────────────────────────────────────────────────────────────╢');
console.log('║ Kino (estimated from click groups + 2s hold):             ║');
kinoMerged.forEach((z, i) => {
  const line = `  #${i + 1}: ${fmt(z.startTime)} → ${fmt(z.endTime)} (${fmt(z.endTime - z.startTime)})`;
  console.log(`║ ${pad(line, 58)}║`);
});
console.log('╟────────────────────────────────────────────────────────────╢');
console.log('║ Screen Studio:                                            ║');
ssZoomRanges.forEach((z, i) => {
  const line = `  #${i + 1}: ${fmt(z.startTime)} → ${fmt(z.endTime)} (${fmt(z.endTime - z.startTime)}) @ ${z.zoom}x`;
  console.log(`║ ${pad(line, 58)}║`);
});
console.log('╚════════════════════════════════════════════════════════════╝');

console.log('\nNotes:');
console.log('- Kino zooms are estimated: each click group triggers a zoom held for ~2s');
console.log('- Screen Studio zooms are actual recorded zoom ranges from project.json');
console.log('- Recordings may be different durations/content — this is a structural comparison');

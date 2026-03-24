# P0 Implementation Specs

> Actionable specs for the 7 highest-priority gaps.
> Each spec includes: what to change, which files, and how.

---

## P0-1: Real Cursor Rendering

### Current State
`render-loop.ts:295-302` draws a white circle:
```ts
ctx.arc(cx, cy, 7 * settings.cursorSize, 0, Math.PI * 2)
ctx.fillStyle = 'rgba(255,255,255,0.93)'
```
This looks like a prototype dot, not a real cursor.

### Target
Render the standard macOS arrow cursor (and optionally pointer/text-beam) as a high-res image at the cursor position, with proper rotation and scaling.

### Implementation

#### Step 1 — Add cursor image assets

Create `src/renderer/assets/cursors/` with PNG files for the macOS arrow cursor at 2x resolution (approx 32x32 @2x = 64x64px). The standard macOS arrow cursor is a black arrow with white border — easily reproduced as an SVG path or use a pre-rendered PNG.

Minimum set:
- `arrow.png` — default pointer (the main one, covers 90% of use)
- `pointer.png` — hand/link cursor (optional, phase 2)

Screen Studio uses `cursorSet` (a collection name) and `cursorType` (macOS | touch). For MVP, just ship the arrow.

#### Step 2 — Preload cursor image in render loop

**File: `src/renderer/engine/render-loop.ts`**

At the top of `startRenderLoop()` (after line 61), load the cursor image:

```ts
const cursorImg = new Image()
cursorImg.src = new URL('../assets/cursors/arrow.png', import.meta.url).href
let cursorReady = false
cursorImg.onload = () => { cursorReady = true }
```

#### Step 3 — Replace circle draw with image draw

**File: `src/renderer/engine/render-loop.ts`**

Replace lines 295-302 (the cursor drawing block):

```ts
// Draw cursor
ctx.save()
if (cursorReady) {
  // macOS arrow cursor: hotspot is at top-left, image is ~32x32 logical px
  const size = 32 * settings.cursorSize
  // Apply slight rotation on horizontal movement (Screen Studio's cursorRotateOnXMovementRatio)
  const cursorDx = (smoothX - prevCursor.x) * vw
  const rotation = cursorDx * 0.015 // subtle tilt
  ctx.translate(cx, cy)
  ctx.rotate(rotation)
  ctx.drawImage(cursorImg, -2, -2, size, size * (cursorImg.height / cursorImg.width))
  ctx.setTransform(1, 0, 0, 1, 0, 0) // reset
} else {
  // Fallback circle while image loads
  ctx.beginPath()
  ctx.arc(cx, cy, 7 * settings.cursorSize, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.93)'
  ctx.shadowColor = 'rgba(0,0,0,0.55)'
  ctx.shadowBlur = 7
  ctx.fill()
}
ctx.restore()
```

The hotspot offset `(-2, -2)` positions the tip of the arrow at the actual cursor coordinate. For the macOS arrow, the hotspot is ~(2,2) from the top-left corner of the image.

#### Step 4 — Also update CanvasPlayback.tsx

**File: `src/renderer/components/CanvasPlayback.tsx`**

The playback canvas currently does NOT draw a cursor at all (it just shows the raw video). This is a separate issue — during playback, cursor data needs to be replayed from the stored `CursorFrame[]` array and drawn on the canvas. This is a larger change but the cursor image loading approach is the same.

#### Settings Changes

**File: `src/shared/types.ts`** — Add to `ProjectSettings`:
```ts
cursorType: 'macos' | 'touch'  // default 'macos'
```

**File: `src/renderer/store/recording.ts`** — Add default:
```ts
cursorType: 'macos' as const,
```

---

## P0-2: Inset / Border Frame

### Current State
No inset or border frame exists anywhere. The video frame goes directly from padding → rounded corners → video content. There's no inner border or "card frame" effect.

### Target
Add a configurable colored border/inset between the padding and the video content, creating Screen Studio's signature "floating card" look. The inset is like CSS `border` on the video frame — a thin colored stroke with adjustable opacity.

### Implementation

#### Step 1 — Add settings

**File: `src/shared/types.ts`** — Add to `ProjectSettings`:
```ts
insetEnabled: boolean
insetWidth: number    // px, 1-8, default 2
insetColor: string    // hex color, default '#ffffff'
insetAlpha: number    // 0-1, default 0.15
```

**File: `src/renderer/store/recording.ts`** — Add defaults:
```ts
insetEnabled: false,
insetWidth: 2,
insetColor: '#ffffff',
insetAlpha: 0.15,
```

#### Step 2 — Draw inset in render loop

**File: `src/renderer/engine/render-loop.ts`**

After the video draw block (after line 276, after `ctx.restore()`), add the inset stroke:

```ts
// Draw inset border on top of video frame
if (settings.insetEnabled && settings.insetWidth > 0 && pad > 0) {
  ctx.save()
  const iw = settings.insetWidth
  // Inset is drawn ON the edge of the video frame (half inside, half outside)
  roundedRectPath(ctx, pad + iw / 2, pad + iw / 2, videoW - iw, videoH - iw, Math.max(0, settings.cornerRadius - iw / 2))
  // Parse hex color and apply alpha
  const r = parseInt(settings.insetColor.slice(1, 3), 16)
  const g = parseInt(settings.insetColor.slice(3, 5), 16)
  const b = parseInt(settings.insetColor.slice(5, 7), 16)
  ctx.strokeStyle = `rgba(${r},${g},${b},${settings.insetAlpha})`
  ctx.lineWidth = iw
  ctx.stroke()
  ctx.restore()
}
```

#### Step 3 — Same for CanvasPlayback.tsx

**File: `src/renderer/components/CanvasPlayback.tsx`**

Add the identical inset drawing code in `drawFrame()` after the video draw (after line 81, before `ctx.restore()`). Actually, since the video `ctx.restore()` already happened at line 81, add it after line 82 (inside the `if (video.readyState >= 2)` block, at the end):

```ts
// Draw inset
if (s.insetEnabled && s.insetWidth > 0 && pad > 0) {
  ctx.save()
  const iw = s.insetWidth
  roundedRectPath(ctx, pad + iw / 2, pad + iw / 2, videoW - iw, videoH - iw, Math.max(0, s.cornerRadius - iw / 2))
  const r = parseInt(s.insetColor.slice(1, 3), 16)
  const g = parseInt(s.insetColor.slice(3, 5), 16)
  const b = parseInt(s.insetColor.slice(5, 7), 16)
  ctx.strokeStyle = `rgba(${r},${g},${b},${s.insetAlpha})`
  ctx.lineWidth = iw
  ctx.stroke()
  ctx.restore()
}
```

#### Step 4 — Settings UI

**File: `src/renderer/components/SettingsPanel.tsx`**

Add after the shadow section (after line 149), inside the Appearance section:

```tsx
<div className="flex items-center justify-between py-0.5">
  <label className="text-[11px] font-medium text-zinc-400">Inset Border</label>
  <Toggle
    checked={settings.insetEnabled}
    onChange={(v) => updateSettings({ insetEnabled: v })}
  />
</div>

{settings.insetEnabled && (
  <>
    <Slider
      value={settings.insetWidth}
      min={1} max={8} step={0.5}
      onChange={(v) => updateSettings({ insetWidth: v })}
      label="Inset Width"
      format={(v) => `${v}px`}
    />
    <Slider
      value={settings.insetAlpha}
      min={0} max={1} step={0.05}
      onChange={(v) => updateSettings({ insetAlpha: v })}
      label="Inset Opacity"
      format={(v) => `${Math.round(v * 100)}%`}
    />
    <div>
      <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">Inset Color</label>
      <div className="flex items-center gap-2.5">
        <input
          type="color"
          value={settings.insetColor}
          onChange={(e) => updateSettings({ insetColor: e.target.value })}
          className="w-7 h-7 rounded-md cursor-pointer border border-zinc-700 bg-transparent"
        />
        <span className="text-[11px] text-zinc-600 font-mono">{settings.insetColor}</span>
      </div>
    </div>
  </>
)}
```

---

## P0-3: Shadow System (5-Parameter)

### Current State
`render-loop.ts:255-264` draws a basic shadow:
```ts
ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'  // hardcoded opacity
ctx.shadowBlur = settings.shadowBlur     // only configurable param
ctx.shadowOffsetX = 0                     // hardcoded
ctx.shadowOffsetY = 2                     // hardcoded
```

Settings panel (`SettingsPanel.tsx:133-149`) exposes only toggle + blur slider.

### Target
5 configurable shadow parameters matching Screen Studio: intensity (opacity), angle (direction), distance (offset magnitude), blur (radius), and directional toggle.

### Implementation

#### Step 1 — Update settings

**File: `src/shared/types.ts`** — Replace `shadowBlur: number` in `ProjectSettings` with:
```ts
shadowBlur: number       // 0-80, default 40
shadowIntensity: number  // 0-1 opacity, default 0.5
shadowAngle: number      // 0-360 degrees, default 180 (directly below)
shadowDistance: number    // 0-40 px offset, default 8
shadowIsDirectional: boolean  // true = light from angle, false = ambient (equal on all sides), default true
```

**File: `src/renderer/store/recording.ts`** — Add defaults:
```ts
shadowIntensity: 0.5,
shadowAngle: 180,
shadowDistance: 8,
shadowIsDirectional: true,
```

#### Step 2 — Update shadow drawing

**File: `src/renderer/engine/render-loop.ts`**

Replace lines 255-264 (the shadow block):

```ts
if (settings.shadowEnabled && settings.shadowBlur > 0 && pad > 0) {
  ctx.save()
  ctx.shadowColor = `rgba(0, 0, 0, ${settings.shadowIntensity})`
  ctx.shadowBlur = settings.shadowBlur
  if (settings.shadowIsDirectional) {
    // Convert angle (0=top, 90=right, 180=bottom, 270=left) to offset
    const angleRad = (settings.shadowAngle - 90) * (Math.PI / 180)
    ctx.shadowOffsetX = Math.cos(angleRad) * settings.shadowDistance
    ctx.shadowOffsetY = Math.sin(angleRad) * settings.shadowDistance
  } else {
    // Ambient shadow: no directional offset, just blur
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 0
  }
  ctx.fillStyle = '#000'
  roundedRectPath(ctx, pad, pad, videoW, videoH, settings.cornerRadius)
  ctx.fill()
  ctx.restore()
}
```

#### Step 3 — Same for CanvasPlayback.tsx

**File: `src/renderer/components/CanvasPlayback.tsx`**

Replace lines 62-72 (the shadow block in `drawFrame()`) with the identical updated shadow code.

#### Step 4 — Settings UI

**File: `src/renderer/components/SettingsPanel.tsx`**

Replace the shadow section (lines 133-149) with:

```tsx
<div className="flex items-center justify-between py-0.5">
  <label className="text-[11px] font-medium text-zinc-400">Drop Shadow</label>
  <Toggle
    checked={settings.shadowEnabled}
    onChange={(v) => updateSettings({ shadowEnabled: v })}
  />
</div>

{settings.shadowEnabled && (
  <>
    <Slider
      value={settings.shadowIntensity}
      min={0} max={1} step={0.05}
      onChange={(v) => updateSettings({ shadowIntensity: v })}
      label="Shadow Intensity"
      format={(v) => `${Math.round(v * 100)}%`}
    />
    <Slider
      value={settings.shadowBlur}
      min={0} max={80}
      onChange={(v) => updateSettings({ shadowBlur: v })}
      label="Shadow Blur"
      format={(v) => `${v}px`}
    />
    <Slider
      value={settings.shadowDistance}
      min={0} max={40}
      onChange={(v) => updateSettings({ shadowDistance: v })}
      label="Shadow Distance"
      format={(v) => `${v}px`}
    />
    <Slider
      value={settings.shadowAngle}
      min={0} max={360} step={15}
      onChange={(v) => updateSettings({ shadowAngle: v })}
      label="Shadow Angle"
      format={(v) => `${v}°`}
    />
    <div className="flex items-center justify-between py-0.5">
      <label className="text-[11px] font-medium text-zinc-400">Directional</label>
      <Toggle
        checked={settings.shadowIsDirectional}
        onChange={(v) => updateSettings({ shadowIsDirectional: v })}
      />
    </div>
  </>
)}
```

---

## P0-4: Background Types (Gradient + Image)

### Current State
`render-loop.ts:249-250` fills the background with a single solid color:
```ts
ctx.fillStyle = settings.background  // CSS color string like '#0a0a0a'
ctx.fillRect(0, 0, vw, vh)
```

Settings panel (`SettingsPanel.tsx:104-115`) has a single color picker.

### Target
Support three background types: solid color (current), gradient (generated from 2 colors), and custom image. Gradient alone would be a massive visual upgrade.

### Implementation

#### Step 1 — Update settings

**File: `src/shared/types.ts`** — Replace `background: string` with:
```ts
backgroundType: 'solid' | 'gradient' | 'image'
backgroundColor: string              // hex, default '#0a0a0a'
backgroundGradientFrom: string       // hex, default '#1a1a2e'
backgroundGradientTo: string         // hex, default '#16213e'
backgroundGradientAngle: number      // 0-360, default 135
backgroundImageDataUrl: string       // data URL or empty string
```

**File: `src/renderer/store/recording.ts`** — Update defaults:
```ts
backgroundType: 'solid' as const,
backgroundColor: '#0a0a0a',
backgroundGradientFrom: '#1a1a2e',
backgroundGradientTo: '#16213e',
backgroundGradientAngle: 135,
backgroundImageDataUrl: '',
```

**Migration:** The old `background` field was a CSS color string. To avoid breaking existing code, you can keep `background` as an alias for `backgroundColor` initially, then remove it.

#### Step 2 — Background drawing helper

**File: `src/renderer/engine/render-loop.ts`**

Add a helper function before `startRenderLoop()`:

```ts
function drawBackground(ctx: CanvasRenderingContext2D, vw: number, vh: number, settings: ProjectSettings, bgImage: HTMLImageElement | null) {
  switch (settings.backgroundType) {
    case 'gradient': {
      const angleRad = (settings.backgroundGradientAngle - 90) * (Math.PI / 180)
      const length = Math.max(vw, vh)
      const cx = vw / 2
      const cy = vh / 2
      const dx = Math.cos(angleRad) * length / 2
      const dy = Math.sin(angleRad) * length / 2
      const grad = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy)
      grad.addColorStop(0, settings.backgroundGradientFrom)
      grad.addColorStop(1, settings.backgroundGradientTo)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, vw, vh)
      break
    }
    case 'image': {
      if (bgImage && bgImage.complete) {
        // Cover: scale to fill, center crop
        const scale = Math.max(vw / bgImage.width, vh / bgImage.height)
        const w = bgImage.width * scale
        const h = bgImage.height * scale
        ctx.drawImage(bgImage, (vw - w) / 2, (vh - h) / 2, w, h)
      } else {
        ctx.fillStyle = settings.backgroundColor
        ctx.fillRect(0, 0, vw, vh)
      }
      break
    }
    default: {
      ctx.fillStyle = settings.backgroundColor
      ctx.fillRect(0, 0, vw, vh)
    }
  }
}
```

#### Step 3 — Load background image in render loop

In `startRenderLoop()`, after line 61 (after getting ctx), add:

```ts
let bgImage: HTMLImageElement | null = null
if (settings.backgroundType === 'image' && settings.backgroundImageDataUrl) {
  bgImage = new Image()
  bgImage.src = settings.backgroundImageDataUrl
}
```

Replace the background fill (lines 249-250) with:
```ts
drawBackground(ctx, vw, vh, settings, bgImage)
```

#### Step 4 — Same for CanvasPlayback.tsx

In `drawFrame()`, replace lines 57-58 with the same `drawBackground()` call. You'll need to import or inline the helper, and preload the bgImage in a ref.

#### Step 5 — Settings UI

**File: `src/renderer/components/SettingsPanel.tsx`**

Replace the background section (lines 104-115) with:

```tsx
<div>
  <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">Background</label>
  <div className="flex gap-1.5 mb-2">
    {(['solid', 'gradient', 'image'] as const).map((type) => (
      <button
        key={type}
        onClick={() => updateSettings({ backgroundType: type })}
        className={`flex-1 text-[11px] font-medium py-1.5 rounded-md border transition-all capitalize ${
          settings.backgroundType === type
            ? 'bg-zinc-700 border-zinc-600 text-white'
            : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600'
        }`}
      >
        {type}
      </button>
    ))}
  </div>

  {settings.backgroundType === 'solid' && (
    <div className="flex items-center gap-2.5">
      <input
        type="color"
        value={settings.backgroundColor}
        onChange={(e) => updateSettings({ backgroundColor: e.target.value })}
        className="w-7 h-7 rounded-md cursor-pointer border border-zinc-700 bg-transparent"
      />
      <span className="text-[11px] text-zinc-600 font-mono">{settings.backgroundColor}</span>
    </div>
  )}

  {settings.backgroundType === 'gradient' && (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-zinc-500 w-10">From</label>
        <input
          type="color"
          value={settings.backgroundGradientFrom}
          onChange={(e) => updateSettings({ backgroundGradientFrom: e.target.value })}
          className="w-7 h-7 rounded-md cursor-pointer border border-zinc-700 bg-transparent"
        />
        <label className="text-[10px] text-zinc-500 w-6 ml-2">To</label>
        <input
          type="color"
          value={settings.backgroundGradientTo}
          onChange={(e) => updateSettings({ backgroundGradientTo: e.target.value })}
          className="w-7 h-7 rounded-md cursor-pointer border border-zinc-700 bg-transparent"
        />
      </div>
      <Slider
        value={settings.backgroundGradientAngle}
        min={0} max={360} step={15}
        onChange={(v) => updateSettings({ backgroundGradientAngle: v })}
        label="Angle"
        format={(v) => `${v}°`}
      />
    </div>
  )}

  {settings.backgroundType === 'image' && (
    <div>
      <button
        onClick={async () => {
          const input = document.createElement('input')
          input.type = 'file'
          input.accept = 'image/*'
          input.onchange = () => {
            const file = input.files?.[0]
            if (!file) return
            const reader = new FileReader()
            reader.onload = () => {
              updateSettings({ backgroundImageDataUrl: reader.result as string })
            }
            reader.readAsDataURL(file)
          }
          input.click()
        }}
        className="w-full text-[11px] font-medium py-2 rounded-md border border-zinc-700/50 bg-zinc-800/50 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-all"
      >
        {settings.backgroundImageDataUrl ? 'Change Image...' : 'Choose Image...'}
      </button>
    </div>
  )}
</div>
```

---

## P0-5: Manual Zoom Range Editing

### Current State

**Zoom events are auto-generated** during recording by `ZoomController` (`zoom-controller.ts`). They're tracked in `render-loop.ts:176-197` and stored as `ZoomEvent[]` in `App.tsx` state (line 36, `zoomEvents`).

**Timeline displays zoom events read-only** in `Timeline.tsx:330-364` — purple blocks on a "Zoom Events" track. No click handlers, no drag handles, no add/remove.

The `ZoomEvent` type (`types.ts:65-69`) is:
```ts
{ startMs: number; endMs: number; type: 'click' | 'dwell' }
```

**CanvasPlayback.tsx** does NOT use zoom events at all — playback shows the raw video without any zoom/pan effects.

### Target
1. Make zoom ranges editable on the timeline (drag to resize, click to select, delete to remove)
2. Allow adding manual zoom ranges by clicking on the zoom track
3. Add zoom level per range (currently implicit from settings)
4. Replay zoom effects during playback (not just recording)

### Implementation

#### Step 1 — Extend ZoomEvent type

**File: `src/shared/types.ts`** — Update `ZoomEvent`:
```ts
export interface ZoomEvent {
  id: string           // unique identifier (add this)
  startMs: number
  endMs: number
  type: 'click' | 'dwell' | 'manual'  // add 'manual'
  zoomLevel: number    // add this — the zoom magnification (e.g. 1.9)
  targetX?: number     // normalized 0-1, center of zoom region (optional for manual)
  targetY?: number     // normalized 0-1
}
```

#### Step 2 — Update zoom event generation in render-loop

**File: `src/renderer/engine/render-loop.ts`**

When pushing zoom events (line 190-194), include the new fields:

```ts
zoomEventsRef.current.push({
  id: crypto.randomUUID(),
  startMs: currentZoomStartMs,
  endMs: elapsedMs,
  type: prevZoomState.startsWith('CLICK') ? 'click' : 'dwell',
  zoomLevel: prevZoomState.startsWith('CLICK') ? settings.autoZoomLevel : settings.dwellZoomLevel,
  targetX: smoothX,
  targetY: smoothY,
})
```

#### Step 3 — Pass zoom CRUD callbacks through App.tsx

**File: `src/renderer/App.tsx`**

Add handlers:

```ts
const handleAddZoomRange = useCallback((startMs: number) => {
  const duration = 3000 // default 3-second zoom
  const endMs = Math.min(startMs + duration, recordDuration)
  setZoomEvents(prev => [...prev, {
    id: crypto.randomUUID(),
    startMs,
    endMs,
    type: 'manual' as const,
    zoomLevel: settings.autoZoomLevel,
  }])
}, [settings.autoZoomLevel, recordDuration])

const handleRemoveZoomRange = useCallback((id: string) => {
  setZoomEvents(prev => prev.filter(z => z.id !== id))
}, [])

const handleUpdateZoomRange = useCallback((id: string, updates: Partial<ZoomEvent>) => {
  setZoomEvents(prev => prev.map(z => z.id === id ? { ...z, ...updates } : z))
}, [])
```

Pass these to `<Timeline>` as new props: `onAddZoomRange`, `onRemoveZoomRange`, `onUpdateZoomRange`.

#### Step 4 — Make zoom track interactive in Timeline.tsx

**File: `src/renderer/components/Timeline.tsx`**

Add to props interface:
```ts
onAddZoomRange?: (startMs: number) => void
onRemoveZoomRange?: (id: string) => void
onUpdateZoomRange?: (id: string, updates: Partial<ZoomEvent>) => void
selectedZoomId?: string
onSelectZoom?: (id: string | null) => void
```

Update the zoom events track (lines 330-364) to be interactive:

**A) Click to add:** Add an `onClick` handler on the zoom track background that calls `onAddZoomRange(clickedTimeMs)` when clicking empty space.

**B) Click to select:** Each zoom block gets an `onClick` handler that sets `selectedZoomId`.

**C) Drag to resize:** Add left/right trim handles on each zoom block (same pattern as segment trim handles at lines 307-321). On drag, call `onUpdateZoomRange(id, { startMs: newStart })` or `{ endMs: newEnd }`.

**D) Delete selected:** In the hotkey handler (App.tsx), when a zoom is selected and Delete is pressed, call `onRemoveZoomRange(selectedZoomId)`.

**E) Visual feedback:** Selected zoom block gets a brighter border. Manual zooms get a different color (e.g., teal vs purple for auto).

Here's the concrete change for the zoom block rendering:

```tsx
{/* Zoom Events Track */}
<div className="relative h-7 bg-zinc-800/25 rounded-md overflow-hidden">
  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] text-zinc-600 pointer-events-none z-10">
    Zoom Events
  </span>

  {/* Click empty space to add */}
  <div
    className="absolute inset-0"
    onClick={(e) => {
      if (!onAddZoomRange) return
      const rect = e.currentTarget.getBoundingClientRect()
      const frac = (e.clientX - rect.left) / rect.width
      const ms = visualFracToAbs(frac)
      // Only add if not clicking on existing zoom
      const existing = zoomEvents.find(z => ms >= z.startMs && ms <= z.endMs)
      if (!existing) onAddZoomRange(ms)
    }}
  />

  {zoomEvents.map((z) => {
    const left = absToVisualFrac(z.startMs) * 100
    const right = absToVisualFrac(z.endMs) * 100
    const width = right - left
    const isSelected = z.id === selectedZoomId
    const isManual = z.type === 'manual'

    return (
      <div
        key={z.id}
        className={`absolute top-0.5 bottom-0.5 rounded-sm cursor-pointer transition-colors ${
          isSelected ? 'ring-1 ring-white/40' : ''
        }`}
        style={{
          left: `${left}%`,
          width: `${width}%`,
          backgroundColor: isManual
            ? 'rgba(20, 184, 166, 0.4)'   // teal for manual
            : z.type === 'click'
              ? 'rgba(139, 92, 246, 0.4)'  // violet for click
              : 'rgba(99, 102, 241, 0.3)', // indigo for dwell
        }}
        onClick={(e) => {
          e.stopPropagation()
          onSelectZoom?.(isSelected ? null : z.id)
        }}
      >
        {/* Left trim handle */}
        <div
          className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-white/30"
          onMouseDown={(e) => {
            e.stopPropagation()
            // Same trim drag pattern as segment handles
            startZoomTrimDrag(z.id, 'left', e)
          }}
        />
        {/* Right trim handle */}
        <div
          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-white/30"
          onMouseDown={(e) => {
            e.stopPropagation()
            startZoomTrimDrag(z.id, 'right', e)
          }}
        />

        {/* Label */}
        {width > 4 && (
          <span className="absolute inset-0 flex items-center justify-center text-[8px] text-white/60 pointer-events-none truncate px-1">
            {z.zoomLevel?.toFixed(1)}x {z.type === 'manual' ? 'Manual' : z.type === 'click' ? 'Click' : 'Auto'}
          </span>
        )}
      </div>
    )
  })}
</div>
```

The `startZoomTrimDrag` function follows the same pattern as the existing `handleTrimDown` (lines 90-119) — add mousemove/mouseup listeners that calculate new startMs/endMs and call `onUpdateZoomRange`.

#### Step 5 — Replay zooms during playback (Phase 2)

This is the most complex part and can be a follow-up. The idea:

**File: `src/renderer/components/CanvasPlayback.tsx`**

1. Accept `zoomEvents` and `cursorFrames` as props
2. In the rAF render loop, look up the current playhead time against `zoomEvents`
3. If inside a zoom range, apply the same camera transform as `render-loop.ts` (translate + scale)
4. Interpolate cursor position from `cursorFrames` for the current time
5. Draw cursor on top

This requires storing `CursorFrame[]` alongside the recording (currently only saved to benchmark JSON files in `src/main/index.ts`). The cursor data needs to be passed back to the renderer after recording stops.

---

---

## P0-6: Timeline Scrubber — Dual-Cursor Preview System

### Current State

`Timeline.tsx` has basic hover scrub behavior. When the mouse hovers over the timeline tracks (lines ~367-382 area), it updates `playheadMs` via `onSetPlayheadMs`. But there is no separation between a "ghost cursor" (hover preview) and a "playhead" (committed position). Moving the mouse scrubs AND commits the position. The current hover logic is at the end of the timeline tracks area with `onMouseMove` and `onMouseLeave` handlers.

`CanvasPlayback.tsx:135-142` seeks the video whenever `playheadMs` changes externally (>1ms difference). This means every hover movement over the timeline triggers a video seek — there's no distinction between previewing and committing.

### Target

Implement a two-cursor model (like YouTube's thumbnail preview but updating the main canvas):

1. **Ghost cursor** — follows mouse position along the timeline bar during hover. The main video preview canvas updates in real-time to show the frame at the ghost cursor's timestamp. Full-resolution, sharp, instant.
2. **Playhead cursor** — represents the committed position. Only moves on click. When the user clicks, the playhead snaps to the ghost cursor's position.

### Behavior

| Event | Ghost Cursor | Playhead | Preview Shows |
|-------|-------------|----------|---------------|
| Mouse enters timeline | Appears, follows mouse | Stays put | Ghost cursor's frame |
| Mouse moves along bar | Follows mouse | Stays put | Ghost cursor's frame (scrub preview) |
| Mouse clicks | — | Jumps to ghost position | Clicked frame (now committed) |
| Mouse leaves timeline | Disappears | Stays put | Playhead's frame |

### Implementation

#### Step 1 — Add ghost cursor state

**File: `src/renderer/App.tsx`**

Add new state:
```ts
const [ghostMs, setGhostMs] = useState<number | null>(null) // null = not hovering
```

The video preview should seek to `ghostMs` when it's non-null, otherwise to `playheadMs`.

Pass `ghostMs` and `setGhostMs` to both `<Timeline>` and `<CanvasPlayback>`.

#### Step 2 — Separate hover from click in Timeline.tsx

**File: `src/renderer/components/Timeline.tsx`**

Add new props:
```ts
ghostMs: number | null
onGhostMsChange: (ms: number | null) => void
```

On the timeline track container, change the mouse event handlers:

- **`onMouseMove`**: Calculate time from mouse X position using `visualFracToAbs()`. Call `onGhostMsChange(calculatedMs)`. Do NOT call `onSetPlayheadMs`.
- **`onMouseLeave`**: Call `onGhostMsChange(null)`.
- **`onClick`**: Call `onSetPlayheadMs(ghostMs)` to commit the ghost position as the playhead. Also call `onPlayingChange(false)` to stop playback on click (current behavior).

#### Step 3 — Render both cursors visually

In `Timeline.tsx`, render two visual indicators:

**Playhead** (existing, lines 367-382): Keep the current blue vertical line + dot. This always shows at `playheadMs`.

**Ghost cursor** (new): Render a second vertical line at `ghostMs` when non-null. Style it as a thinner, semi-transparent white line (to distinguish from the blue playhead):

```tsx
{ghostMs !== null && (
  <div
    className="absolute top-0 bottom-0 w-px bg-white/30 pointer-events-none z-20"
    style={{ left: `${absToVisualFrac(ghostMs) * 100}%` }}
  >
    <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-white/50" />
  </div>
)}
```

#### Step 4 — Update CanvasPlayback to respond to ghost cursor

**File: `src/renderer/components/CanvasPlayback.tsx`**

Add new prop:
```ts
ghostMs: number | null
```

Update the seek effect (lines 135-142) to prefer `ghostMs` when present:

```ts
useEffect(() => {
  const video = videoRef.current
  if (!video) return
  const targetMs = ghostMs ?? playheadMs
  if (Math.abs(targetMs - lastReportedRef.current) > 1) {
    video.currentTime = targetMs / 1000
    lastReportedRef.current = targetMs
  }
}, [ghostMs, playheadMs])
```

This means: when hovering over the timeline, the preview instantly shows the ghost cursor's frame. When the mouse leaves, it reverts to the committed playhead frame.

#### Step 5 — Performance consideration

Video seeking to arbitrary timestamps can be slow if the seek target isn't a keyframe. For smooth scrubbing:

- The `<video>` element's `fastSeek()` method (where available) provides faster approximate seeking. Use it for ghost cursor scrubbing, and precise `currentTime` assignment for committed playhead seeks.
- The rAF render loop in `CanvasPlayback.tsx` already runs continuously and calls `drawFrame()` every frame, so the canvas will update as soon as the video seek completes.

```ts
// In the ghost seek path:
if (ghostMs !== null && video.fastSeek) {
  video.fastSeek(ghostMs / 1000)
} else {
  video.currentTime = targetMs / 1000
}
```

---

## P0-7: Floating Toolbar + Record Flow (Screen Studio Pattern)

### Current State

Kino launches as a single `BrowserWindow` (`src/main/index.ts:78-100`) with the full editor UI immediately visible. The window is 1200x800 with a hidden inset title bar. Recording starts from a button inside this editor window. There is no floating toolbar, no always-on-top control, and no phased flow.

The recording flow is:
1. User clicks "Record" in the editor (`App.tsx:handleRecord`, line 140)
2. 3-second countdown
3. Recording starts (full screen capture via `desktopCapturer`)
4. User clicks "Stop" in the editor
5. Playback loads in the same window

### Target

Three-phase architecture matching Screen Studio:

**Phase 1 — Pre-recording:** On app launch, show only a small floating always-on-top toolbar (not the full editor). The toolbar is draggable and persists across all desktops/spaces. The full editor does NOT open yet.

**Phase 2 — Recording:** On "Record" click, show a confirmation overlay/modal (screen selection, audio source options). Once confirmed, the floating toolbar transforms to show: Stop, Pause, Reset, Trash controls. These remain floating and always-on-top.

**Phase 3 — Post-recording:** On "Stop", the full Kino editor window opens with the recorded video loaded. The floating toolbar dismisses.

### Implementation

#### Step 1 — Create the floating toolbar window

**File: `src/main/index.ts`**

Add a new `BrowserWindow` for the floating toolbar. This replaces the current single-window launch:

```ts
let toolbarWindow: BrowserWindow | null = null

function createToolbarWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 360,
    height: 56,
    frame: false,               // no native title bar
    transparent: true,          // transparent background for floating look
    alwaysOnTop: true,          // stays above all windows
    resizable: false,
    hasShadow: true,
    skipTaskbar: true,          // don't show in dock/taskbar
    visibleOnAllWorkspaces: true, // persist across spaces/desktops
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  // Allow dragging the toolbar
  // (handled in the renderer with -webkit-app-region: drag CSS)

  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173/#/toolbar')
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/toolbar' })
  }

  return win
}
```

Update `app.whenReady()` to create the toolbar instead of the main window:

```ts
app.whenReady().then(() => {
  // Phase 1: Launch floating toolbar only
  toolbarWindow = createToolbarWindow()
  // Main editor window is NOT created yet
})
```

#### Step 2 — Create the toolbar renderer component

**File: `src/renderer/components/FloatingToolbar.tsx`** (new file)

This is a minimal React component that renders the floating toolbar UI:

**Pre-recording state:**
```
[ ● Record ]  [ ⚙ Settings ▾ ]
```
- Record button (red) — triggers recording flow
- Settings dropdown — screen selection, audio source

**Recording state:**
```
[ ■ Stop ]  [ ⏸ Pause ]  [ ↺ Reset ]  [ 🗑 Trash ]  [ 0:00 duration ]
```

The component should use `-webkit-app-region: drag` on the container for window dragging, and `-webkit-app-region: no-drag` on interactive buttons.

```tsx
export function FloatingToolbar() {
  const [status, setStatus] = useState<'idle' | 'recording'>('idle')
  const [duration, setDuration] = useState(0)

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-900/95 backdrop-blur-xl border border-zinc-700/50"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {status === 'idle' ? (
        <>
          <button
            onClick={() => window.kino.startRecording()}
            className="..."
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            Record
          </button>
          {/* Settings gear */}
        </>
      ) : (
        <>
          <button onClick={() => window.kino.stopRecording()} ...>Stop</button>
          <button onClick={() => {/* pause */}} ...>Pause</button>
          <button onClick={() => {/* reset */}} ...>Reset</button>
          <button onClick={() => {/* trash */}} ...>Trash</button>
          <span className="text-xs text-zinc-400 font-mono tabular-nums">{formatDuration(duration)}</span>
        </>
      )}
    </div>
  )
}
```

#### Step 3 — Add routing for toolbar vs editor

**File: `src/renderer/App.tsx`**

Use hash-based routing to render either the toolbar or the editor:

```tsx
function Root() {
  const hash = window.location.hash

  if (hash === '#/toolbar') {
    return <FloatingToolbar />
  }

  return <App />
}
```

Update `src/renderer/index.tsx` to render `<Root />` instead of `<App />`.

#### Step 4 — IPC for phase transitions

**File: `src/main/index.ts`**

Add IPC handlers for the recording flow transitions:

```ts
// When recording starts (from toolbar)
ipcMain.handle('start-recording', async () => {
  // Start cursor tracking, screen capture, etc. (existing logic)
  sendStatusToWindow(toolbarWindow, 'recording')
})

// When recording stops (from toolbar)
ipcMain.handle('stop-recording', async () => {
  // Stop capture, save data (existing logic)

  // Phase 3: Create editor window with recorded data
  mainWindow = createMainWindow()
  mainWindow.webContents.once('did-finish-load', () => {
    // Send recorded data to editor
    mainWindow?.webContents.send('load-recording', {
      videoPath: recordedFilePath,
      cursorData: cursorLog,
      zoomEvents: zoomEvents,
      metadata: recordingMetadata,
    })
  })

  // Dismiss toolbar
  toolbarWindow?.close()
  toolbarWindow = null
})
```

#### Step 5 — Toolbar dimensions during recording

When transitioning from idle to recording state, resize the toolbar window to accommodate the additional controls:

```ts
// In main process, on recording start:
toolbarWindow?.setSize(480, 56)

// On recording stop (before closing):
// No resize needed — window is about to close
```

#### Key Files to Modify

| File | Change |
|------|--------|
| `src/main/index.ts` | Add `createToolbarWindow()`, change `app.whenReady()` to launch toolbar first, add phase transition IPC |
| `src/renderer/components/FloatingToolbar.tsx` | **New file** — floating toolbar component with idle/recording states |
| `src/renderer/App.tsx` | Add hash-based routing for toolbar vs editor |
| `src/renderer/index.tsx` | Render `<Root />` with routing |
| `src/shared/channels.ts` | Add new IPC channel names for phase transitions |

#### Architecture Notes

- The toolbar and editor are separate `BrowserWindow` instances sharing the same Electron app process
- Recording state (cursor data, video chunks) lives in the main process and gets passed to the editor window via IPC after recording stops
- The toolbar window uses `transparent: true` + `frame: false` for the floating appearance; the actual UI background is rendered by the React component with `backdrop-blur` and rounded corners
- `alwaysOnTop: true` + `visibleOnAllWorkspaces: true` ensures the toolbar follows the user everywhere
- The `-webkit-app-region: drag` CSS property makes the toolbar draggable without a native title bar

---

## File Change Summary

| File | P0-1 Cursor | P0-2 Inset | P0-3 Shadow | P0-4 Background | P0-5 Zoom | P0-6 Scrubber | P0-7 Toolbar |
|------|:-----------:|:----------:|:-----------:|:----------------:|:---------:|:-------------:|:------------:|
| `src/shared/types.ts` | + `cursorType` | + `inset*` (4) | + `shadow*` (4) | Replace `background` (6) | Extend `ZoomEvent` | — | — |
| `src/renderer/store/recording.ts` | + default | + defaults | + defaults | + defaults | — | — | — |
| `src/renderer/engine/render-loop.ts` | Rewrite cursor (L295) | + inset draw | Rewrite shadow (L255) | Rewrite bg (L249) | Add id/level | — | — |
| `src/renderer/components/CanvasPlayback.tsx` | — (phase 2) | + inset draw | Rewrite shadow | Rewrite bg | — (phase 2) | + ghostMs seek | — |
| `src/renderer/components/SettingsPanel.tsx` | — (minor) | + inset controls | Expand shadow | Replace bg section | — | — | — |
| `src/renderer/components/Timeline.tsx` | — | — | — | — | Interactive zoom | + ghost cursor | — |
| `src/renderer/App.tsx` | — | — | — | — | + zoom CRUD | + ghostMs state | + hash routing |
| `src/renderer/assets/cursors/` | + arrow.png | — | — | — | — | — | — |
| `src/main/index.ts` | — | — | — | — | — | — | + toolbar window, phase IPC |
| `src/renderer/components/FloatingToolbar.tsx` | — | — | — | — | — | — | **New file** |
| `src/renderer/index.tsx` | — | — | — | — | — | — | + Root routing |

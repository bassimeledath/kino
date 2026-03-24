# Kino vs Screen Studio — Core Feature Gaps

> Core features Screen Studio has shipped since v1.0-v2.x that Kino is missing.
> Excludes AI features (captions, typing detection), shareable links, command menu,
> and other add-ons. Focuses on what makes a recording look professional.

---

## Priority 1 — Visual Polish (What Makes the Output Look Good)

### 1. Real Cursor Rendering

**Screen Studio:** Renders actual macOS system cursors (pointer, hand, text beam, crosshair) at high resolution. Replaces recorded cursor with crisp retina versions. Supports macOS cursor type and Touch (iPad-style) cursor. Custom cursor sets with adjustable size and color (v3.0+). Option to "always use default system cursor" to prevent cursor changes during text selection.

**Kino:** Draws a plain white circle (`arc(0, 2π)` with `rgba(255,255,255,0.93)` fill) at the cursor position. Size is adjustable (0.5-3x) but it's always a circle — never looks like a real cursor.

**Gap:** Need to capture and render the actual cursor image/type at each frame. At minimum, render the standard macOS arrow cursor SVG/PNG at the tracked position. The circle looks like a prototype, not a product.

**Properties to implement:** `cursorSet`, `cursorType` (macOS | touch), `cursorMacOS`, `cursorTouch`

---

### 2. Background Types (Gradient, Image, Wallpaper)

**Screen Studio:** Four background types — solid color, gradient (generated from chosen color), custom image, or macOS system wallpaper (curated selection including Screen Studio-designed options). Background blur slider. Background accent color. Configurable padding as a ratio.

**Kino:** Single solid color only (`backgroundColor: '#0a0a0a'`). Fixed pixel padding (0-120px).

**Gap:** Gradient backgrounds alone would be a massive visual upgrade. Most Screen Studio demos use gradient or wallpaper backgrounds — solid black is the least appealing option.

**Properties to implement:** `backgroundType` (solid | gradient | image | wallpaper), `backgroundGradient`, `backgroundImage`, `backgroundSystemName`, `backgroundBlur`, `backgroundAccent`, `backgroundPaddingRatio`

---

### 3. Shadow System (5-Parameter Control)

**Screen Studio:** Full shadow system — intensity (opacity), angle (direction), distance (offset), blur (radius), and directional vs ambient toggle. Presets from flat/minimal to dramatic.

**Kino:** Binary shadow toggle + single blur slider (0-80px). Fixed color `rgba(0,0,0,0.5)`, fixed Y offset of 2px.

**Gap:** The shadow is one of the most visible style elements. Screen Studio's directional shadow with angle control creates depth that a fixed-offset shadow can't match. Need at minimum: intensity, angle, distance, blur.

**Properties to implement:** `shadowIntensity`, `shadowAngle`, `shadowDistance`, `shadowBlur`, `shadowIsDirectional`

---

### 4. Corner Smoothing (Squircle)

**Screen Studio:** iOS-style squircle corner smoothing on the video frame. Uses `cornerSmoothing` parameter for continuous curvature (not just `border-radius`). Has a `roundingAndSmoothingBudget` system.

**Kino:** Standard circular arc `border-radius` (0-40px). No smoothing.

**Gap:** The squircle is a signature Apple aesthetic. Screen Studio's corners look noticeably better than a raw `border-radius`. This is a subtle but important polish detail.

**Properties to implement:** `cornerSmoothing` (0-1), `roundingAndSmoothingBudget`

---

### 5. Inset / Border Frame

**Screen Studio:** Configurable inset with color and alpha — adds a thin colored border/frame inside the padding area. `insetColor`, `insetAlpha`, `insetPadding`. Creates a "floating card" look.

**Kino:** No inset or border frame at all.

**Gap:** The inset is a key styling element in Screen Studio's signature look. Combined with shadow and background, it makes the recording look like a polished product screenshot.

**Properties to implement:** `insetColor`, `insetAlpha`, `insetPadding`

---

### 6. Motion Blur

**Screen Studio:** Four independent motion blur controls — overall amount, cursor movement blur, screen pan blur, and screen zoom blur. Enabled by default. Creates cinematic feel during zoom transitions and fast cursor movements.

**Kino:** No motion blur at all.

**Gap:** Motion blur is one of Screen Studio's signature effects. When the camera pans during a zoom transition, the slight blur makes it look like a real camera movement rather than a digital crop. The cursor motion blur makes fast movements feel fluid rather than teleporting.

**Properties to implement:** `motionBlurAmount`, `motionBlurCursorAmount`, `motionBlurScreenMoveAmount`, `motionBlurScreenZoomAmount`

---

### 7. Click Sound Effects

**Screen Studio:** Built-in library of click sound effects with volume slider. Preview before applying. Plays an audible "click" sound on every mouse click in the recording.

**Kino:** Visual click highlight (expanding golden ring) but no audio feedback.

**Gap:** Click sounds are a core part of the Screen Studio experience — they make clicks feel satisfying and help viewers follow interactions. The visual ripple alone isn't enough.

**Properties to implement:** `clickSoundEffect` (sound ID), `clickSoundEffectVolume` (0-1)

---

## Priority 2 — Recording Capabilities

### 8. Window & Area Recording Modes

**Screen Studio:** Three capture modes beyond full display — Window (select specific app window), Area (drag custom region with exact pixel input), and Device (connected iOS device via USB).

**Kino:** Full screen capture only (`desktopCapturer` with "Screen" source). No window selection, no area selection.

**Gap:** Window mode is essential — most users want to record a single app, not their entire desktop with notifications and other windows visible. Area mode is important for recording specific regions (e.g., hiding browser URL bar).

**Components to implement:** Recording mode selector (Display | Window | Area), window picker, area selection overlay with dimension input

---

### 9. Webcam / Camera Overlay

**Screen Studio:** Full webcam overlay system — position presets (corners), size slider, corner roundness (circle to square), aspect ratio, mirror, scale-during-zoom (default 70%), portrait mode, studio light, background wallpapers behind camera. Dynamic camera layouts (v3.0) for fullscreen/hidden/split-screen camera segments.

**Kino:** No webcam support at all.

**Gap:** The talking-head overlay is a core use case for tutorial and demo recordings. Even a basic circle webcam overlay in a corner would be a significant addition.

**Properties to implement:** `cameraSize`, `cameraPosition`, `cameraPositionPoint`, `cameraRoundness`, `cameraAspectRatio`, `cameraScaleDuringZoom`, `webcamPreviewType`

---

## Priority 3 — Editing & Timeline

### 10. Manual Zoom Range Editing

**Screen Studio:** Users can manually add, remove, duplicate, resize, and reposition zoom ranges on a dedicated timeline track. Drag zoom edges to adjust duration. Right-click to disable or remove. Bulk removal of all zooms. Select exact screen region to zoom into. Adjustable glide (camera drift while zoomed). Instant animation toggle.

**Kino:** Auto-zoom only (click-triggered and dwell-triggered via state machine). Zoom events are displayed on the timeline but cannot be manually edited, added, or repositioned. No manual zoom creation.

**Gap:** Auto-zoom is great for quick exports, but users need to tweak — remove a distracting zoom, add a zoom where there was no click, adjust how long a zoom holds. The zoom timeline is read-only in Kino.

**API to implement:** `addZoomRange`, `removeZoomRange`, `duplicateZoomRange`, `updateZoomRange`, zoom range drag handles on timeline, manual zoom region selector

---

### 11. Aspect Ratio Selection

**Screen Studio:** Six presets above the preview — Auto, Wide (16:9), Vertical (9:16), Square (1:1), Classic (4:3), Tall (3:4). "Always keep zoomed in" option that crops to selected ratio with cursor position dictating visible area.

**Kino:** Native recording aspect ratio only. Export can target 4K/1080p/720p resolutions but no aspect ratio transformation.

**Gap:** Vertical (9:16) export for social media is a common need. The "always keep zoomed in" mode with cursor-following is particularly useful for vertical exports from horizontal recordings.

**Properties to implement:** `aspectRatio` preset selector, `expandToMatchAspectRatio`, `alwaysKeepZoomedIn` (cursor-following crop)

---

### 12. Speed Control UI

**Screen Studio:** Right-click segment > "Set speed" with presets (1.2x, 1.4x, 1.6x, 2x, 4x). Speed label shown on timeline segment. Typing detection suggests speed-ups for typing-heavy segments.

**Kino:** Per-segment `speed` property exists in the data model (`TimelineSegment.speed`) but there is no UI to change it. The timeline shows speed labels but they can't be edited.

**Gap:** The data model supports it — just needs a context menu or inline editor on segments.

**UI to implement:** Right-click context menu on timeline segments with speed presets, speed label display on segments

---

### 13. Keyboard Shortcut Overlay

**Screen Studio:** Records keypresses during recording and displays them as an overlay in the video. Toggle show/hide. Adjustable label size. "Show single key shortcuts" filter. Dedicated timeline track for enabling/disabling individual shortcuts.

**Kino:** No keyboard input recording or display.

**Gap:** Key overlays are essential for tutorials — viewers need to see what keyboard shortcuts the presenter is pressing.

**Implementation needed:** Capture keyboard events during recording, render key labels on video during playback/export, shortcut timeline track

---

## Priority 4 — Entry Animations & Transitions

### 14. Entry/Exit Animations

**Screen Studio:** 9+ entry animations — fadeIn, slideUpFadeIn, slideDownFadeIn, longSlideUpFadeIn, zoomFadeIn, strongZoomFadeIn, blurFadeIn, slideRightFadeIn, slideLeftFadeIn. Crossfade between segments. `hasInstantAnimation` flag to skip.

**Kino:** No entry or exit animations. Recording starts and ends abruptly.

**Gap:** A smooth fade-in at the start and fade-out at the end is the minimum bar for a polished recording. The abrupt start/stop makes Kino recordings feel raw.

**Properties to implement:** `enterAnimation` (enum of animation types), `exitAnimation`, `hasInstantAnimation`

---

## Summary Table

| # | Feature | Screen Studio | Kino | Impact |
|---|---------|--------------|------|--------|
| 1 | Real cursor rendering | macOS/touch/custom cursors | White circle | **Critical** — looks like prototype |
| 2 | Background types | Solid/gradient/image/wallpaper | Solid color only | **Critical** — biggest visual differentiator |
| 3 | Shadow system | 5 parameters + presets | Toggle + blur only | **High** — depth and polish |
| 4 | Corner smoothing | Squircle (continuous curvature) | Basic border-radius | **Medium** — subtle but noticeable |
| 5 | Inset/border frame | Color + alpha + padding | None | **High** — signature floating card look |
| 6 | Motion blur | 4 independent controls | None | **High** — cinematic feel |
| 7 | Click sounds | Sound library + volume | Visual ripple only | **Medium** — satisfying feedback |
| 8 | Window/Area recording | 3 modes + device | Full screen only | **Critical** — basic recording need |
| 9 | Webcam overlay | Full PiP system | None | **High** — core use case |
| 10 | Manual zoom editing | Full CRUD on timeline | Auto-zoom only (read-only) | **High** — users need to tweak |
| 11 | Aspect ratio | 6 presets + cursor-follow | Native only | **High** — social media export |
| 12 | Speed control UI | Context menu + presets | Data model exists, no UI | **Medium** — easy win |
| 13 | Keyboard overlay | Full capture + display | None | **Medium** — tutorial essential |
| 14 | Entry/exit animations | 9+ types + crossfade | None (abrupt start/stop) | **High** — minimum polish bar |

### Suggested Implementation Order

1. **Real cursor** — removes "prototype" feel immediately
2. **Background gradient + image** — biggest visual upgrade with moderate effort
3. **Entry/exit animations** — simple fade-in/out raises the polish floor
4. **Shadow system** — extend existing shadow with angle/distance/intensity
5. **Inset/border** — small feature, big visual impact
6. **Window recording mode** — unlock the primary use case
7. **Manual zoom editing** — make the zoom timeline interactive
8. **Motion blur** — signature cinematic effect
9. **Aspect ratio** — unlock social media vertical exports
10. **Speed control UI** — expose existing data model capability
11. **Webcam overlay** — important but complex
12. **Corner smoothing** — subtle polish detail
13. **Click sounds** — nice-to-have polish
14. **Keyboard overlay** — important for tutorials

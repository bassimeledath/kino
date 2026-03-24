# Screen Studio — Complete Feature Inventory

> Extracted from live app inspection via CDP (v3.6.0-4214, Electron 39.1.2, Chrome 142),
> official docs (screen.studio/guide/*), changelog, reviews, and social media.
> For cloning reference. Last updated: 2026-03-22.

---

## Version History

| Version | Date | Key Features |
|---------|------|--------------|
| 1.x–2.11 | 2023 | Initial launch: screen recording, auto-zoom, smooth cursor, background styling, webcam overlay, basic editing |
| 2.12.0 | Jun 2023 | Preset Files — presets saved to `~/Documents/Screen Studio Presets`, shareable |
| 3.0.0 | Dec 2024 | Shareable links, dynamic camera layouts, command menu (Cmd+K), quick share widget, custom cursors, typing detection |
| 3.1.0 | Mar 2025 | Masks — blur sensitive data, highlight areas |
| 3.2.0 | Apr 2025 | Pause/resume recording, iPhone audio, .MOV support, recording recovery |
| 3.6.0 | 2026 | Current version (build 4214) |

---

## Architecture

- **Framework:** Electron + React + styled-components (v6.1.18)
- **State management:** MobX (observable stores, `SyncedObservableStore`)
- **IPC:** `electronTRPC` (invoke, subscriptions, message passing)
- **UI components:** Squircle-based buttons (`SquircleFill`), `HoverMagnet` hover effects, SF Symbol icons
- **Recording backend:** ScreenCaptureKit (macOS native), custom `polyrecorder` binary
- **Audio:** `swift-audio-composer` native module
- **Styling:** Corner smoothing (squircle), spring-based animations throughout

---

## 1. Recording

### 1.1 Recording Modes (Floating Toolbar)
The app opens with a persistent floating toolbar (HUD-style, dark translucent, auto-width).

| Mode | Icon | Description |
|------|------|-------------|
| **Display** | `􀏞` (monitor) | Record entire display/screen |
| **Window** | `􀏜` (browser window) | Record a specific application window |
| **Area** | `􀓔` (selection rectangle) | Record a custom-selected area |
| **Device** | `􀟞` (phone) | Record a connected iOS/Android device (iPad, iPhone) |

### 1.2 Input Sources (Toolbar)

| Source | Icon | Component | States |
|--------|------|-----------|--------|
| **Camera/Webcam** | `􀍍` | `CameraButton` | "No camera" / selected camera name |
| **Microphone** | `􀊳` | `MicrophoneButton` | "No microphone" / selected mic name, stereo option (`isMicrophoneStereoOptionVisible`) |
| **System Audio** | `􀎵` | `SystemAudioButton` | "No system audio" / enabled |

### 1.3 Recording Controls

| Feature | Property/Component | UX Details |
|---------|-------------------|------------|
| **Countdown timer** | `recordingCountdownDuration` | Configurable delay (3, 5, 10s) before recording starts |
| **Recording indicator** | `ActiveRecordingWidget` | Floating HUD showing elapsed time (`0:00`). Can be hidden (right-click > "Hide"). Auto-excluded from output on macOS 12.3+ |
| **Stop button** | `ActiveRecordingWidget__UIStopButton` | Squircle stop button — ends recording |
| **Pause/Resume** | `􀜪` icon (v3.2+) | Keyboard shortcut to pause/resume mid-recording |
| **Restart** | Button in widget | Clears and begins again |
| **Cancel recording** | `􀅉` icon button | Deletes entire recording |
| **Recording Flag** | `Cmd+Option+Ctrl+F` | Marks important moments during recording. Flags appear on timeline for navigation |
| **ScreenCaptureKit** | `recordingUseScreenCaptureKit` | macOS native capture API |
| **Retina/HiDPI** | `recordingScale` | Capture at native retina resolution |
| **Display refresh rate** | `displayRefreshRate` | Matches display Hz, up to 4K 60fps |
| **Enhanced mic audio** | Toggle in toolbar | Voice volume normalization + background noise removal |
| **System audio per-app** | Select specific apps | Record from all apps or selected apps only |
| **Recording recovery** | v3.2+ | Enhanced crash/failure recovery system |

### 1.4 Speaker Notes / Teleprompter
- Accessed via settings icon in recording modal > "Show Speaker Notes"
- Acts as a personal teleprompter visible only to the user (not in recording)
- Start prompter with keyboard shortcut `Cmd+Option`
- Adjustable scrolling speed and opacity

### 1.4 Recording Area/Crop

| Feature | Property |
|---------|----------|
| **Area crop presets** | `recordingAreaCropPresets` — predefined crop dimensions |
| **Window size presets** | `recordingWindowSizePresets` — predefined window sizes |
| **Recording crop** | `recordingCrop` — custom crop region |
| **Area cover overlay** | `recordingAreaCover` — darkens area outside recording region |
| **Recording markers** | `recordingMarkers` — mark points during recording |
| **Recording flags** | `recordingFlags` — metadata flags |

### 1.5 Pre-Crop Editor (Post-Recording, Pre-Edit)

| Component | Description |
|-----------|-------------|
| `CropEditor` | Full crop editing interface |
| `CropSettings` | Crop background, items, holder |
| `CropToolbar` | Toolbar with labeled sections |
| `CropTools` | Size, dimensions, position controls, with unit display |
| `CropVideoPreview` | Live video preview of crop |
| `CropWindow` | Standalone crop window with buttons, title, toolbar |
| `AdditionalCropTools` | Additional tools with select dropdown |
| `PreCrop` | Aspect ratio measurer and content positioner |
| `AspectRatioFit` | Recording preview with aspect ratio fit |
| `AspectRatioSelect` | Section for aspect ratio selection |

---

## 2. Camera/Webcam Overlay

| Property | Description |
|----------|-------------|
| `cameraSize` | Size of the webcam overlay |
| `cameraPosition` | Position preset (e.g., bottom-left, bottom-right) |
| `cameraPositionPoint` | Exact position coordinates |
| `cameraRoundness` | Corner roundness (circle to rectangle slider) |
| `cameraAspectRatio` | Webcam aspect ratio |
| `cameraScaleDuringZoom` | How camera scales when screen zooms in |
| `webcamPreviewType` | Preview display type |
| `webcamVideoPath` | Path to webcam recording |
| `webcamMeta` | Webcam metadata |

### Camera Modes
- `camera-mode` — recording mode selector
- `only-camera` — camera-only recording mode (no screen)
- `only-screen` — screen-only mode (no camera)

### Camera Enhancement Effects
- **Background Wallpapers** — add background wallpapers behind camera feed
- **Portrait Mode** — depth-of-field effect focusing on subject
- **Studio Light** — enhanced lighting for professional appearance
- **Mirror** — flip camera feed horizontally

### Dynamic Camera Layouts (v3.0+)
- Dedicated layouts timeline for camera layout changes
- **Fullscreen layout** — camera occupies entire display
- **Default layout** — camera + screen visible simultaneously
- **Hidden layout** — camera hidden for that segment
- Flexible repositioning at any point in recording
- Split-screen layouts supported
- Dynamic transitions between camera views

---

## 3. Cursor & Mouse Effects

| Property | Description |
|----------|-------------|
| `cursorSize` | Cursor display size |
| `cursorSet` | Cursor style/theme set |
| `cursorType` | Cursor type (default, pointer, etc.) |
| `cursorMacOS` | macOS cursor variant |
| `cursorTouch` | Touch cursor variant |
| `cursorBaseRotation` | Base rotation angle of cursor |
| `cursorRotateOnXMovementRatio` | Cursor tilt on horizontal movement |
| `clickEffect` | Visual effect on click (ripple, highlight, etc.) |
| `clickSoundEffect` | Audio click sound effect |
| `clickSoundEffectVolume` | Click sound volume level |
| `highlightMaskOpacity` | Opacity of the click highlight mask |

### Cursor Advanced Settings (click "Advanced" in cursor panel)
- **Rotate cursor while moving** — slight rotation mimicking natural movement
- **Stop cursor movement at end** — halt cursor before video ends
- **Remove cursor shakes** — eliminate unintended movements from accessibility tools
- **Optimize original cursor types** — minimize rapid cursor type changes
- **Disable text-field cursor** — keep consistent pointer throughout
- **Hide cursor if not moving** — auto-hide when idle with animation
- **Loop cursor position** — cursor returns to initial position near video end (for seamless social media loops)
- **Hide cursor in specific sections** — right-click timeline fragment > "Hide mouse cursor"

### Smooth Mouse Movement (Spring Physics)

| Property | Description |
|----------|-------------|
| `mouseMovementSpring` | Spring physics for cursor follow |
| `mouseClickSpring` | Spring physics for click animation |
| `disableMouseMovementSpring` | Option to disable spring motion |

Speed presets: **Smooth, Medium, Rapid, None**
Advanced customization: **Tension** (snappiness), **Friction** (bounciness), **Mass** (weight/inertia)
Can be disabled per timeline segment via right-click

---

## 4. Zoom System

| Property | Description |
|----------|-------------|
| `useAutomaticZooms` | Enable/disable auto-zoom |
| `createAutomaticZooms` | Generate zoom events from cursor activity |
| `defaultZoomLevel` | Default zoom magnification |
| `initialZoom` | Starting zoom level |
| `alwaysKeepZoomedIn` | Keep zoom persistent |
| `zoomRanges` | Array of zoom range definitions |
| `zoomRangesWithSystem` | System-merged zoom ranges |
| `addZoomRange` | Add a zoom range at position |
| `addZoomRangeAt` | Add zoom at specific time |
| `removeZoomRange` | Remove a zoom range |
| `duplicateZoomRange` | Duplicate existing zoom range |
| `updateZoomRange` | Modify zoom range properties |
| `getZoomRangeById` | Lookup zoom by ID |
| `findZoomRangeAt` | Find zoom at time position |
| `getFreeZoomRangeAt` | Find available zoom slot |
| `resetZoomRanges` | Reset all zoom ranges |
| `follow-click-groups` | Group zoom by click activity clusters |
| `follow-mouse` | Zoom follows mouse movement |

### Screen Movement Springs

| Property | Description |
|----------|-------------|
| `screenMovementSpring` | Spring physics for screen panning |

---

## 5. Motion Blur

| Property | Description |
|----------|-------------|
| `motionBlurAmount` | Overall motion blur intensity |
| `motionBlurCursorAmount` | Motion blur on cursor movement |
| `motionBlurScreenMoveAmount` | Motion blur on screen pan |
| `motionBlurScreenZoomAmount` | Motion blur on zoom transitions |

---

## 6. Background & Styling

### 6.1 Background

| Property | Description |
|----------|-------------|
| `backgroundType` | Type: solid, gradient, image, system wallpaper |
| `backgroundColor` | Solid background color |
| `backgroundGradient` | Gradient definition |
| `backgroundImage` | Custom image path |
| `backgroundSystemName` | macOS system wallpaper name |
| `backgroundAccent` | Accent color for background |
| `backgroundBlur` | Background blur amount |
| `backgroundPaddingRatio` | Padding ratio around content |
| `backgroundPaddingSize` | Absolute padding size |
| `backgroundPositionX` | Horizontal position |
| `backgroundPositionY` | Vertical position |

### 6.2 Background Audio

| Property | Description |
|----------|-------------|
| `backgroundAudioFileName` | Background music file |
| `backgroundAudioVolume` | Background music volume |

### 6.3 Window Styling

| Property | Description |
|----------|-------------|
| `windowBorderRadius` | Window corner radius |
| `cornerRadius` | General corner radius |
| `cornerSmoothing` | Squircle corner smoothing (iOS-style) |
| `roundness` | Overall roundness control |
| `roundingAndSmoothingBudget` | Smoothing budget for corners |

### 6.4 Shadow

| Property | Description |
|----------|-------------|
| `shadowIntensity` | Shadow darkness/opacity |
| `shadowAngle` | Shadow direction angle |
| `shadowDistance` | Shadow offset distance |
| `shadowBlur` | Shadow blur radius |
| `shadowIsDirectional` | Directional vs ambient shadow |

### 6.5 Inset/Border

| Property | Description |
|----------|-------------|
| `insetColor` | Border/inset stroke color |
| `insetAlpha` | Border/inset opacity |
| `insetPadding` | Inner padding/inset amount |
| `screenWithInset` | Screen with inset frame applied |

### 6.6 Padding

| Property | Description |
|----------|-------------|
| `paddingX` / `paddingY` | Horizontal/vertical padding |
| `paddingTop/Right/Bottom/Left` | Individual padding sides |
| `paddingHorizontal/Vertical` | Axis padding |

---

## 7. Device Frames

| Component | Description |
|-----------|-------------|
| `DeviceFramesBrowser` | Browse available device frames |
| `DeviceFrameDisplayer` | Render device mockup around recording |
| `DeviceFrameDebugger` | Debug device frame rendering |
| `deviceFrameKey` | Selected device frame identifier |
| `deviceName` | Device name label |

### Supported devices (from source):
- iPad
- (iPhone, MacBook, Android — inferred from "Device" recording mode and `deviceFrameKey`)

---

## 8. Audio

| Property | Description |
|----------|-------------|
| `audioVolume` | Main audio volume |
| `audioComposerMethod` | Audio composition method (uses `swift-audio-composer`) |
| `audioSessions` | Audio session management |
| `playbackAudioScrubber` | Scrubbing audio during playback |
| `backgroundAudioFileName` | Background music file — built-in royalty-free library |
| `backgroundAudioVolume` | Background music volume level |

### Audio UX Details
- **Microphone selection** with white bar sound level indicator in recording picker
- **System audio per-app** — record from all apps or select/ignore specific apps
- **Enhanced microphone audio** — automatic voice normalization + background noise removal (toggle)
- **Background music** — built-in royalty-free library + custom upload (MP3/MP4) via Audio section in right sidebar
- **Click sound effects** — multiple built-in sounds, volume slider, preview before applying
- **Audio from iPhone** — record audio from connected iPhone via USB (v3.2+)

---

## 9. Playback & Timeline

### 9.1 Playback Controls

| Property | Description |
|----------|-------------|
| `playbackSpeed` | Playback speed multiplier |
| `playbackRate` | Playback rate control |
| `playbackDurationMs` | Total playback duration |
| `playbackStartMs` / `playbackEndMs` | Playback range selection |
| `playbackLoop` | Loop playback |
| `playbackEnergyMode` | Energy-saving playback mode |
| `playbackQualityMode` | Preview quality level |
| `playbackPreviewMaxHeight` | Preview resolution cap |

### 9.2 Timeline

| Property | Description |
|----------|-------------|
| `timeline` | Timeline component |
| `project-view-timeline-zoom` | Timeline zoom level (persisted in localStorage via MobX) |
| `increaseTimelineZoom` | Zoom into timeline — slider next to scissors icon |
| `hide-timeline` | Toggle timeline visibility |
| `project-view-visible-tracks-v2` | Which tracks are visible (persisted) |

**Multiple timeline tracks:**
- **Main clip timeline** (yellow bar) — shows clip length and speed
- **Zoom timeline** (purple blocks) — zoom range indicators
- **Mask timeline** — blur/highlight mask segments
- **Keyboard shortcuts timeline** — key press overlays
- **Layouts timeline** (v3.0) — camera layout changes (fullscreen/default/hidden)

Timeline navigation: trackpad/Magic Mouse gestures, scroll bar, scrubber drag

### 9.3 Editing Operations

| Feature | Property | UX Details |
|---------|----------|------------|
| **Trim edges** | `trimStart` / `trimEnd` | Click and hold clip edges, drag left/right. Yellow bubble with scissors icon for undo |
| **Cut at cursor** | Press `C` key | Cuts at current cursor position |
| **Split clip** | `splitAt` / Press `S` | Splits at playhead |
| **Scissors tool** | Press `Option` key | Toggle scissors/cutting mode |
| **Remove segment** | Right-click > "Remove" | Delete selected segment |
| **Copy frame** | `Cmd+C` | Copy current frame as image to clipboard |
| **Recording range** | `recordingStartMs` / `recordingEndMs` | Time range selection |
| **Keyframes** | `keyframes` | Keyframe animation support |

### 9.4 Speed Control

| Feature | UX Details |
|---------|------------|
| **Segment speed** | Right-click segment > "Set speed" > 1.2x, 1.4x, 1.6x, 2x, 4x |
| **Typing detection** (v3.0) | AI auto-detects typing segments, suggests speeding them up |
| **Apply to all typing** | "Apply to all typing parts" button for consistent speed |
| **Apply all suggestions** | Batch application of speed suggestions |

---

## 10. Transitions & Animations

### Entry Animations
| Value | Description |
|-------|-------------|
| `fadeIn` | Simple fade in |
| `slideUpFadeIn` | Slide up + fade |
| `slideDownFadeIn` | Slide down + fade |
| `longSlideUpFadeIn` | Long slide up + fade |
| `zoomFadeIn` | Zoom in + fade |
| `strongZoomFadeIn` | Strong zoom in + fade |
| `blurFadeIn` | Blur to sharp + fade |
| `slideRightFadeIn` | Slide right + fade |
| `slideLeftFadeIn` | Slide left + fade |
| `crossfade` | Crossfade between segments |

### Animation Components
- `EnterAnimation__UIHolder` — enter animation container
- `hasInstantAnimation` — skip animation flag
- `skipAnimations` — globally disable animations

### Spring Physics
- `spring` — spring animation curve
- `bounce` — bounce animation
- `bounceStiffness` — bounce spring stiffness
- `bounceDamping` — bounce spring damping
- `innerSprings` — nested spring animations
- `isHoveredSpring` — hover state spring
- `isPressedSpring` — press state spring
- `offsetSpring` — offset animation spring
- `NumberSpring` — numeric value spring interpolation

---

## 11. Export / Rendering

### Formats
| Format | Notes |
|--------|-------|
| **MP4** | Default, fastest export |
| **GIF** | Optimized; significantly longer export; not recommended for >1 min |
| **MOV** | Added in v3.2 |

### Quality Presets
| Preset | Use Case |
|--------|----------|
| **Studio** | Highest quality — for importing into Final Cut Pro, Premiere, DaVinci Resolve |
| **Social Media** | Slightly compressed for platform optimization |
| **Web** | Balanced quality for web use |
| **Web Low Quality** | Maximum compression, smallest file size |

### Resolution & Frame Rate
- Up to **4K** (3840x2160) resolution
- **60fps** default, configurable down to 10fps
- **Vertical mode export** — one-click 9:16 conversion with auto-recalculated zoom animations

### Sharing (v3.0+)
| Feature | Details |
|---------|---------|
| **Export to file** | Save locally as MP4/GIF/MOV |
| **Copy to clipboard** | Export and auto-copy for immediate paste |
| **Shareable links** | Cloud-hosted streaming at `screen.studio/share/*`, 30-minute limit |
| **Quick share widget** | Bottom-left widget after recording: "Share" (instant link) or "Edit" (open editor). Can be disabled in settings |
| **Comments on shared links** | Viewers can leave timestamped comments (`Cmd+Enter` to post) |
| **Manage shareable links** | Dashboard via Screen Studio menu > Manage Shareable Links |
| **Multiple project exports** | Export multiple projects simultaneously |
| **Raw file extraction** | Export > "Extract raw recording files..." — separate camera and screen files without effects |

### Internal Properties
| Property | Description |
|----------|-------------|
| `exportId` | Export job identifier |
| `exportManager` | Export job manager |
| `exportedDensity` | Export pixel density (1x, 2x retina) |
| `exports` | Export history/queue |
| `renderingStartTime` | Render start timestamp |

### Preview Performance Modes
| Mode | Description |
|------|-------------|
| **Quality Mode** | Preview matches exported video exactly |
| **Performance Mode** | Disables motion blur in preview, higher FPS editing |
| **Power Saving Mode** | Reduces CPU/GPU usage, may decrease preview FPS |

### Aspect Ratios
- **Presets:** Auto, Wide (16:9), Vertical (9:16), Square (1:1), Classic (4:3), Tall (3:4)
- `aspectRatio` — output aspect ratio
- `preserve-aspect` — maintain aspect ratio
- `expandToMatchAspectRatio` — expand content to fill
- **"Always keep zoomed in"** — crops to selected ratio, cursor position dictates visible area

---

## 12. Keyboard Shortcuts

### In-Video Shortcut Overlay
| Property | Description |
|----------|-------------|
| `shortcutGuide` | Keyboard shortcut overlay shown in recording |
| `shortcutsSizeRatio` | Adjustable label size slider |
| `shortcutAllowFocusedInput` | Allow shortcuts when input is focused |
| **Show shortcuts toggle** | Keyboard Shortcuts panel > toggle "Show shortcuts" |
| **"Show single key shortcuts"** | Ignores keystrokes near each other during typing |
| **Timeline view** | Shortcuts appear on dedicated timeline track, individually enable/disable |

### App Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `Cmd+K` | Open command menu |
| `Cmd+S` | Save project |
| `Cmd+Shift+S` | Save project as |
| `Cmd+,` | Open settings |
| `Cmd+/` | View all keyboard shortcuts |
| `Cmd+C` | Copy current frame as image |
| `Cmd+Option+Enter` | Open recording modal |
| `Cmd+Option+Ctrl+F` | Create recording flag during recording |
| `Cmd+Option` | Start speaker notes prompter |
| `C` | Cut at cursor position / Open crop tool |
| `S` | Split clip at playhead |
| `Option` | Toggle scissors/cutting tool |
| `4` | Access mask timeline |
| `Cmd+Enter` | Post timestamped comment on shareable link |

All shortcuts are customizable via Settings > Shortcuts tab

---

## 13. Command Menu (Palette)

| Component | Description |
|-----------|-------------|
| `CommandMenu` | Command palette (cmd+K style) |
| `CommandMenu__UICommandInput` | Search input |
| `CommandMenu__UIBrowserHolder` | Results browser |
| `CommandMenu__UICover` | Overlay cover |
| `CommandLabel` | Command item with icon, labels, shortcut preview |
| `CommandsBrowser` | Browse commands by group |
| `CommandsBrowser__UIGroup` | Command group |
| `CommandsBrowser__UIGroupLabel` | Group label |
| `ParentActionsLabel` | Breadcrumb/parent action navigation |

---

## 14. UI Layout & Navigation

### Window Types
- `GenericWindow` — generic window container
- `PopoverWindow` — popover with topbar
- `CropWindow` — dedicated crop editor window
- `ChildWindow` — child/satellite windows

### Layout
- `TopbarLayout` — topbar + body layout
- `FullScreenActionView` — full-screen action with head, body, footer, go-back
- `SizeWatchingDiv` — responsive size observer

### Sidebar
- `hide-sidebar` — toggle sidebar visibility
- `sidebarItem` — sidebar navigation item
- `sidebarRoot` — sidebar root container
- `highlightSidebarNavigationLabels` — highlight active sidebar label

### Panels
- `panel` — standard panel
- `largePanel` — wide panel variant
- `toolbarWide` — wide toolbar variant
- `SidebarPortal` — portal for sidebar rendering

---

## 15. Settings & Preferences

| Property | Description |
|----------|-------------|
| `settings` | Global settings |
| `projectConfig` | Per-project configuration |
| `useLastProjectConfigForNewProjects` | Copy settings to new projects |
| `presetConfig` | Preset configuration |
| `presetPreview` | Preset preview thumbnail |
| `presetsFolderPath` | Custom presets folder |
| `templateSettings` | Template settings |
| `persistedConfig` | Settings persistence |
| `updateConfig` | Settings update handler |
| `clientPreferences` | Client-side preferences |

---

## 16. Annotations, Masks & Captions

### Masks (v3.1+)
| Feature | Details |
|---------|---------|
| **Sensitive data blur** | Click "Mask" > "Sensitive data" > drag/resize blur rectangle on canvas |
| **Highlight mode** | Highlight important areas with adjustable opacity |
| **Timeline duration** | Adjust how long mask appears via timeline |
| **Adjustable blur intensity** | Control blur strength |
| **Rectangle-based** | Currently rectangular only; fixed position (doesn't follow scrolling) |
| **Permanent** | Blur removes pixel information in exported video |
| **Shortcut** | Press `4` to access mask timeline |

### AI Captions / Subtitles
| Feature | Details |
|---------|---------|
| **Whisper AI** | Local processing; models: Base (fast), Small (balanced), Medium (accurate) |
| **Apple Speech Recognition** | Local processing; requires macOS 26.0+ |
| **Auto language detection** | With manual override option |
| **Prompt field** | Optional text for transcription accuracy (custom names, technical terms) |
| **Word-by-word highlighting** | Captions highlight each word in sync with audio |
| **Edit transcript** | Click "Edit transcript" to fix errors/typos |
| **Caption size** | Adjustable caption size in video |
| **Show/hide captions** | Toggle visibility in preview |
| **Export transcript** | Save transcript as separate file |
| **Requires mic audio** | Unavailable without voiceover |

### Markers & Annotations
| Property | Description |
|----------|-------------|
| `annotation` / `annotations` | Annotation data (planned feature, limited implementation) |
| `markers` | Timeline markers for navigation |
| `subtitle` | Subtitle/caption text |
| `caption` | Caption text |

**Note:** Full annotation/drawing tools (arrows, lines, shapes, text) are NOT yet implemented — commonly requested feature with 359+ upvotes.

---

## 17. Screen Continuity

| Property | Description |
|----------|-------------|
| `ScreenContinuity` | Maintain visual continuity across screen changes |
| `windowBoundChanges` | Track window position/size changes |
| `windowBounds` | Current window bounds |

---

## 18. Activation & Licensing

| Component | Description |
|-----------|-------------|
| `ActivateViewFooter` | License activation footer |
| `ActivationIfNeeded` | Activation gate |
| `AcceptTermsAndConditions` | T&C acceptance |
| `StageEnterEmail` | Email entry |
| `StageEnterLicenseKey` | License key entry |
| `StageVerificationCode` | Email verification |
| `StagePickLicenseKey` | License key picker |
| `StagePickAuthorizationType` | Auth type selection |
| `StageLicenseExpired` | License expired view |
| `StageLicenseRefunded` | License refunded view |
| `StageNoActiveProductsFound` | No products found |
| `CodeInput` | Verification code input |

---

## 19. Updates

| Component | Description |
|-----------|-------------|
| `UpdateWindowView` | Update window |
| `UpdateAvailable` | New update available |
| `UpdateChecking` | Checking for updates |
| `UpdateDownloading` | Download progress |
| `UpdateReadyToInstall` | Ready to install |
| `UpdateError` | Update error with info |
| `UpdateHasLatestVersion` | Already up to date |
| `UpdateNeedsLicenseRenewal` | License renewal needed for update |
| `UpdateNewCustomer` | New customer update flow |

---

## 20. Integrations

| Feature | Description |
|---------|-------------|
| **Google Drive** | Google Drive integration |
| **External drive export** | Export to external drives |
| **Safari extension** | Safari web extension |
| **Raycast extension** | Official extension — start recordings, manage projects from Raycast |
| **iOS device connection** | USB cable for screen recording; USB-C to Lightning recommended |
| **Continuity Camera** | Use iPhone as webcam via Apple's Continuity Camera |
| **Final Cut Pro** | Studio quality export compatible with FCP |
| **Adobe Premiere** | Studio quality export compatible with Premiere |
| **DaVinci Resolve** | Studio quality export compatible with DaVinci |
| **Cloud sharing** | Built-in link sharing at screen.studio/share/* |
| **Homebrew** | `brew install --cask screen-studio` |
| **Create from video** | File > Create project from video — import existing MP4 for enhancement |

---

## 21. Misc UI Components

| Component | Description |
|-----------|-------------|
| `Button` | Standard button with icon, dropdown, content |
| `Checkbox` | Checkbox with label, check icon, wave effect |
| `IconButton` | Icon-only button |
| `Input` | Text input and textarea |
| `InputWithLabel` | Labeled input with spinner |
| `NumberInput` | Numeric input |
| `NamedField` | Settings field with name, description, tip, toggle |
| `Popover` | Popover card with trigger |
| `RecordButton` | Record button with notice |
| `DurationLabel` | Time duration display |
| `Spinner` | Loading spinner with description and progress bar |
| `HeroTitle` | Title + description hero section |
| `InfoCard` | Info card with icon, title, copy, loading cover |
| `NotificationLabel` | Notification with icon |
| `ElectronLink` | External link handler |
| `EmojiConfetti` | Celebration confetti animation |
| `ErrorBoundary` | Error boundary with logo, title, subtitle, buttons |
| `ZodForm` | Zod-validated form with fields and notification |
| `ShortcutPreview` | Keyboard shortcut preview label |
| `Tooltip` | Tooltip with placement, shortcut, max-width (via data attrs) |

---

## 22. Toolbar UI Details

### Floating Toolbar Layout
```
[X Close] | [Display] [Window] [Area] [Device] | [No camera] [No microphone] [No system audio] | [⚙️ Settings ▾]
```

- **Shape:** Squircle buttons with `HoverMagnet` magnetic hover effect
- **SVG paths:** Squircle paths generated with specific corner radii (6px smooth corners)
- **Delimiter:** `ui__UIDelimiter` thin vertical separator
- **Auto-width:** `AutoWidthHUDWindow` — width adjusts to content
- **Close button:** `RecordingPicker__UICloseButton` — X icon (SF Symbol `􀁡`)
- **Settings:** `OptionsButton` with gear icon (`􀍟`) + chevron (`􀆈`)

### Active Recording Widget Layout
```
[Loading Overlay] [Stop ■] [Duration 0:00] | [Pause 􀜪] [Mic 􀊗] [Cancel 􀅉] [Clipboard 􀈑]
```

### Toast Notifications
- `ToastsView__UIToastsHolder` — notification container
- `ToastsView__UIToastsTasksHolder` — task notification container

---

## 23. Data Model Summary

### Recording Project (`RecordingProject`)
A project contains:
- Recording data (video path, metadata, timestamps)
- Project configuration (all visual settings)
- Zoom ranges (automatic + manual)
- Annotations and markers
- Audio sessions
- Export history

### Key Config Properties (exhaustive list from source)
```
backgroundType, backgroundColor, backgroundGradient, backgroundImage,
backgroundSystemName, backgroundAccent, backgroundBlur,
backgroundPaddingRatio, backgroundPaddingSize,
backgroundAudioFileName, backgroundAudioVolume,
cameraSize, cameraPosition, cameraPositionPoint, cameraRoundness,
cameraAspectRatio, cameraScaleDuringZoom,
webcamPreviewType,
cursorSize, cursorSet, cursorType, cursorBaseRotation,
cursorRotateOnXMovementRatio,
clickEffect, clickSoundEffect, clickSoundEffectVolume,
highlightMaskOpacity,
mouseMovementSpring, mouseClickSpring, screenMovementSpring,
disableMouseMovementSpring,
motionBlurAmount, motionBlurCursorAmount,
motionBlurScreenMoveAmount, motionBlurScreenZoomAmount,
useAutomaticZooms, defaultZoomLevel, alwaysKeepZoomedIn,
initialZoom, zoomRanges,
shadowIntensity, shadowAngle, shadowDistance, shadowBlur, shadowIsDirectional,
windowBorderRadius, cornerRadius, cornerSmoothing,
insetColor, insetAlpha, insetPadding,
aspectRatio, deviceFrameKey,
playbackSpeed, playbackEnergyMode, playbackQualityMode,
recordingCountdownDuration, recordingScale,
shortcutGuide, shortcutsSizeRatio,
audioVolume, audioComposerMethod
```

---

## 24. Editor Layout Details

### Overall Layout
- **Dark theme** interface with black background
- **Purple primary accent** color (#4d2ff5)
- Menu bar icon for quick access

### Editor Layout
```
┌──────────────────────────────────────────────────┐
│  [Topbar: Crop | Aspect Ratio | Export]           │
├──────────────────────────────────┬────────────────┤
│                                  │  Right Sidebar │
│                                  │  ┌────────────┐│
│      Video Preview Canvas        │  │ Background ││
│      (with playback controls)    │  │ & Screen   ││
│                                  │  ├────────────┤│
│                                  │  │ Cursor     ││
│                                  │  ├────────────┤│
│                                  │  │ Camera     ││
│                                  │  ├────────────┤│
│                                  │  │ Captions   ││
│                                  │  ├────────────┤│
│                                  │  │ Audio      ││
│                                  │  ├────────────┤│
│                                  │  │ Animations ││
│                                  │  └────────────┘│
├──────────────────────────────────┴────────────────┤
│  Timeline Bar                                     │
│  ├─ Main clip (yellow) ──────────────────────────│
│  ├─ Zoom ranges (purple blocks) ─────────────────│
│  ├─ Masks ───────────────────────────────────────│
│  ├─ Keyboard shortcuts ─────────────────────────│
│  └─ Camera layouts ─────────────────────────────│
└──────────────────────────────────────────────────┘
```

- Sidebar can be toggled with `hide-sidebar`
- Timeline zoom via slider next to scissors icon
- Navigate timeline via trackpad swipe or scroll bar

---

## 25. Pricing

| Period | Model | Price |
|--------|-------|-------|
| 2023–2024 | One-time purchase | $89 (1 device) / $189 (3 devices) + 1 year updates |
| 2025–2026 | Subscription | $29/month or $108/year ($9/mo) |
| — | One-time license | $229 (updates for 1 year only) |

- All tiers include identical features
- Up to 3 personal macOS devices per license
- Free trial available (no credit card, all features)
- 40% student/educator discount (valid .edu email)
- macOS 13.1 (Ventura)+ required, Apple Silicon recommended

---

## 26. Features NOT Currently Supported

Commonly requested features that Screen Studio does NOT have:

| Missing Feature | Notes |
|----------------|-------|
| **Annotation/drawing tools** | Arrows, lines, shapes, text — 359+ upvotes, planned |
| **Transitions between clips** | No cross-clip transitions |
| **Import/merge external videos** | Cannot combine multiple clips |
| **Audio waveform in timeline** | No visual waveform |
| **Separate audio tracks** | Mic vs system audio not separately editable |
| **Per-segment audio volume** | No granular audio control |
| **Multiple mask layers** | Single mask at a time |
| **Non-rectangle masks** | Only rectangular shapes |
| **Scrolling-aware masks** | Masks don't follow content when scrolling |
| **Zoom during typing** | Auto-zoom doesn't activate during typing |
| **Per-clip crop** | Same crop for entire recording |
| **Batch export queue** | Limited batch support |
| **Windows/Linux version** | macOS only |
| **Pixel-perfect camera placement** | Only preset corner positions |

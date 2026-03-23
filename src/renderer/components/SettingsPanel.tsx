import type { ProjectSettings } from '../../shared/types'

interface SettingsPanelProps {
  settingsOpen: boolean
  settings: ProjectSettings
  updateSettings: (partial: Partial<ProjectSettings>) => void
  onClose: () => void
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3 mt-1">
      <span className="text-[10px] font-semibold text-zinc-500 tracking-widest uppercase">{children}</span>
      <div className="flex-1 h-px bg-zinc-800/80" />
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${
        checked ? 'bg-red-500' : 'bg-zinc-700'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
          checked ? 'translate-x-[18px]' : 'translate-x-[3px]'
        }`}
      />
    </button>
  )
}

function Slider({
  value,
  min,
  max,
  step,
  onChange,
  label,
  format,
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  label: string
  format: (v: number) => string
}) {
  return (
    <div>
      <div className="flex justify-between mb-1.5">
        <label className="text-[11px] font-medium text-zinc-400">{label}</label>
        <span className="text-[11px] font-mono text-zinc-500 tabular-nums">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="settings-range w-full"
      />
    </div>
  )
}

export function SettingsPanel(props: SettingsPanelProps) {
  const { settingsOpen, settings, updateSettings, onClose } = props

  if (!settingsOpen) return null

  return (
    <div
      data-testid="settings-panel"
      className="w-[280px] border-l border-zinc-800/60 bg-zinc-900/95 overflow-y-auto flex-shrink-0"
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[13px] font-semibold text-zinc-200 tracking-tight">Settings</h2>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-md text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-all"
          >
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          {/* ── Appearance ── */}
          <SectionHeader>Appearance</SectionHeader>

          <div>
            <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">Background</label>
            <div className="flex items-center gap-2.5">
              <input
                type="color"
                value={settings.backgroundColor}
                onChange={(e) => updateSettings({ backgroundColor: e.target.value })}
                className="w-7 h-7 rounded-md cursor-pointer border border-zinc-700 bg-transparent"
              />
              <span className="text-[11px] text-zinc-600 font-mono">{settings.backgroundColor}</span>
            </div>
          </div>

          <Slider
            value={settings.padding}
            min={0} max={120}
            onChange={(v) => updateSettings({ padding: v })}
            label="Padding"
            format={(v) => `${v}px`}
          />

          <Slider
            value={settings.cornerRadius}
            min={0} max={40}
            onChange={(v) => updateSettings({ cornerRadius: v })}
            label="Corner Radius"
            format={(v) => `${v}px`}
          />

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
                label="Intensity"
                format={(v) => `${Math.round(v * 100)}%`}
              />
              <Slider
                value={settings.shadowBlur}
                min={0} max={80}
                onChange={(v) => updateSettings({ shadowBlur: v })}
                label="Blur"
                format={(v) => `${v}px`}
              />
              <Slider
                value={settings.shadowDistance}
                min={0} max={40}
                onChange={(v) => updateSettings({ shadowDistance: v })}
                label="Distance"
                format={(v) => `${v}px`}
              />
              <Slider
                value={settings.shadowAngle}
                min={0} max={360} step={15}
                onChange={(v) => updateSettings({ shadowAngle: v })}
                label="Angle"
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
                label="Border Width"
                format={(v) => `${v}px`}
              />

              <Slider
                value={settings.insetAlpha}
                min={0} max={1} step={0.01}
                onChange={(v) => updateSettings({ insetAlpha: v })}
                label="Border Opacity"
                format={(v) => `${Math.round(v * 100)}%`}
              />

              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">Border Color</label>
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

          {/* ── Zoom & Cursor ── */}
          <SectionHeader>Zoom & Cursor</SectionHeader>

          <Slider
            value={settings.autoZoomLevel}
            min={1} max={4} step={0.1}
            onChange={(v) => updateSettings({ autoZoomLevel: v })}
            label="Click Zoom"
            format={(v) => `${v.toFixed(1)}x`}
          />

          <Slider
            value={settings.dwellZoomLevel}
            min={1} max={3} step={0.1}
            onChange={(v) => updateSettings({ dwellZoomLevel: v })}
            label="Dwell Zoom"
            format={(v) => `${v.toFixed(1)}x`}
          />

          <Slider
            value={settings.dwellDelay}
            min={1000} max={8000} step={500}
            onChange={(v) => updateSettings({ dwellDelay: v })}
            label="Dwell Delay"
            format={(v) => `${(v / 1000).toFixed(1)}s`}
          />

          <Slider
            value={settings.cursorSize}
            min={0.5} max={3} step={0.1}
            onChange={(v) => updateSettings({ cursorSize: v })}
            label="Cursor Size"
            format={(v) => `${v.toFixed(1)}x`}
          />

          <div className="flex items-center justify-between py-0.5">
            <label className="text-[11px] font-medium text-zinc-400">Cursor Smoothing</label>
            <Toggle
              checked={settings.cursorSmoothing}
              onChange={(v) => updateSettings({ cursorSmoothing: v })}
            />
          </div>

          <div className="flex items-center justify-between py-0.5">
            <label className="text-[11px] font-medium text-zinc-400">Click Highlight</label>
            <Toggle
              checked={settings.clickHighlight}
              onChange={(v) => updateSettings({ clickHighlight: v })}
            />
          </div>

          {/* ── Export ── */}
          <SectionHeader>Export</SectionHeader>

          <div>
            <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">Frame Rate</label>
            <div className="flex gap-1.5">
              {([30, 60] as const).map((fps) => (
                <button
                  key={fps}
                  onClick={() => updateSettings({ fps })}
                  className={`flex-1 text-[11px] font-medium py-1.5 rounded-md border transition-all ${
                    settings.fps === fps
                      ? 'bg-zinc-700 border-zinc-600 text-white'
                      : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600'
                  }`}
                >
                  {fps} fps
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">Resolution</label>
            <select
              value={settings.resolution}
              onChange={(e) =>
                updateSettings({ resolution: e.target.value as ProjectSettings['resolution'] })
              }
              className="w-full rounded-md bg-zinc-800/80 border border-zinc-700/50 text-[11px] text-zinc-300 px-2.5 py-1.5 cursor-pointer focus:outline-none focus:border-zinc-600 transition-colors"
            >
              <option value="native">Native</option>
              <option value="4k">4K (3840x2160)</option>
              <option value="1080p">1080p (1920x1080)</option>
              <option value="720p">720p (1280x720)</option>
            </select>
          </div>

          {/* ── Physics ── */}
          <SectionHeader>Spring Physics</SectionHeader>

          <Slider
            value={settings.screenSpringStiffness}
            min={50} max={500} step={10}
            onChange={(v) => updateSettings({ screenSpringStiffness: v })}
            label="Stiffness"
            format={(v) => `${v}`}
          />

          <Slider
            value={settings.screenSpringDamping}
            min={10} max={100} step={5}
            onChange={(v) => updateSettings({ screenSpringDamping: v })}
            label="Damping"
            format={(v) => `${v}`}
          />

          <Slider
            value={settings.screenSpringMass}
            min={0.5} max={5} step={0.25}
            onChange={(v) => updateSettings({ screenSpringMass: v })}
            label="Mass"
            format={(v) => `${v.toFixed(2)}`}
          />
        </div>
      </div>
    </div>
  )
}

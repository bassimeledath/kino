import type { ProjectSettings } from '../../shared/types'

interface SettingsPanelProps {
  settingsOpen: boolean
  settings: ProjectSettings
  updateSettings: (partial: Partial<ProjectSettings>) => void
  onClose: () => void
}

export function SettingsPanel(props: SettingsPanelProps) {
  const { settingsOpen, settings, updateSettings, onClose } = props

  if (!settingsOpen) return null

  return (
    <div
      data-testid="settings-panel"
      className="w-72 border-l border-zinc-800 bg-zinc-900 overflow-y-auto flex-shrink-0"
    >
      <div className="p-5">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-zinc-100">Settings</h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="space-y-5">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-2">Background Color</label>
            <div className="flex items-center gap-2.5">
              <input
                type="color"
                value={settings.background}
                onChange={(event) => updateSettings({ background: event.target.value })}
                className="w-8 h-8 rounded-md cursor-pointer border border-zinc-700 bg-transparent"
              />
              <span className="text-xs text-zinc-500 font-mono">{settings.background}</span>
            </div>
          </div>

          <div>
            <div className="flex justify-between mb-2">
              <label className="text-xs font-medium text-zinc-400">Padding</label>
              <span className="text-xs font-mono text-zinc-500">{settings.padding}px</span>
            </div>
            <input
              type="range"
              min="0"
              max="120"
              value={settings.padding}
              onChange={(event) => updateSettings({ padding: Number(event.target.value) })}
              className="w-full h-1.5 accent-red-500 cursor-pointer"
            />
          </div>

          <div>
            <div className="flex justify-between mb-2">
              <label className="text-xs font-medium text-zinc-400">Corner Radius</label>
              <span className="text-xs font-mono text-zinc-500">{settings.cornerRadius}px</span>
            </div>
            <input
              type="range"
              min="0"
              max="40"
              value={settings.cornerRadius}
              onChange={(event) => updateSettings({ cornerRadius: Number(event.target.value) })}
              className="w-full h-1.5 accent-red-500 cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between py-0.5">
            <label className="text-xs font-medium text-zinc-400">Drop Shadow</label>
            <input
              type="checkbox"
              checked={settings.shadowEnabled}
              onChange={(event) => updateSettings({ shadowEnabled: event.target.checked })}
              className="h-4 w-4 rounded accent-red-500 cursor-pointer"
            />
          </div>

          <div>
            <div className="flex justify-between mb-2">
              <label className="text-xs font-medium text-zinc-400">Zoom Level</label>
              <span className="text-xs font-mono text-zinc-500">{settings.autoZoomLevel.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="1"
              max="4"
              step="0.1"
              value={settings.autoZoomLevel}
              onChange={(event) => updateSettings({ autoZoomLevel: Number(event.target.value) })}
              className="w-full h-1.5 accent-red-500 cursor-pointer"
            />
          </div>

          <div>
            <div className="flex justify-between mb-2">
              <label className="text-xs font-medium text-zinc-400">Cursor Size</label>
              <span className="text-xs font-mono text-zinc-500">{settings.cursorSize.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="3"
              step="0.1"
              value={settings.cursorSize}
              onChange={(event) => updateSettings({ cursorSize: Number(event.target.value) })}
              className="w-full h-1.5 accent-red-500 cursor-pointer"
            />
          </div>

          <div className="border-t border-zinc-800" />

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-2">Frame Rate</label>
            <select
              value={settings.fps}
              onChange={(event) => updateSettings({ fps: Number(event.target.value) as 30 | 60 })}
              className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-xs text-white px-3 py-2 cursor-pointer"
            >
              <option value={30}>30 fps</option>
              <option value={60}>60 fps</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-2">Export Resolution</label>
            <select
              value={settings.resolution}
              onChange={(event) =>
                updateSettings({ resolution: event.target.value as ProjectSettings['resolution'] })
              }
              className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-xs text-white px-3 py-2 cursor-pointer"
            >
              <option value="native">Native</option>
              <option value="4k">4K (3840×2160)</option>
              <option value="1080p">1080p (1920×1080)</option>
              <option value="720p">720p (1280×720)</option>
            </select>
          </div>

          <div className="flex items-center justify-between py-0.5">
            <label className="text-xs font-medium text-zinc-400">Click Highlight</label>
            <input
              type="checkbox"
              checked={settings.clickHighlight}
              onChange={(event) => updateSettings({ clickHighlight: event.target.checked })}
              className="h-4 w-4 rounded accent-red-500 cursor-pointer"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

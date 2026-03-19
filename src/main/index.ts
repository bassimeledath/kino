import { app, BrowserWindow, ipcMain, screen, desktopCapturer, dialog } from 'electron'
import { join } from 'path'
import { spawn, execFileSync } from 'child_process'
import { writeFileSync, mkdtempSync, mkdirSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { Channels } from '../shared/channels'
import type { CursorFrame, ExportDoneResult, ExportStartConfig } from '../shared/types'

// Allow CDP WebSocket connections from any origin (required for benchmark tooling)
app.commandLine.appendSwitch('remote-allow-origins', '*')

// C helper that polls CGEventSourceButtonState at ~120Hz and emits "down"/"up" on state change.
// Compiled with clang at startup — more reliable than Swift across macOS SDK versions.
const CLICK_MONITOR_C = `#include <CoreGraphics/CoreGraphics.h>
#include <stdio.h>
#include <unistd.h>
int main() {
    setbuf(stdout, NULL);
    int last = 0;
    while(1) {
        int down = CGEventSourceButtonState(kCGEventSourceStateCombinedSessionState, kCGMouseButtonLeft);
        if (down != last) { last = down; puts(down ? "down" : "up"); }
        usleep(8000);
    }
}
`

const CLICK_MONITOR_BIN = join(tmpdir(), 'kino-click-monitor')
const CLICK_MONITOR_SRC = CLICK_MONITOR_BIN + '.c'
let clickMonitorReady = false

function compileClickMonitor(): boolean {
  try {
    writeFileSync(CLICK_MONITOR_SRC, CLICK_MONITOR_C)
    execFileSync('cc', ['-framework', 'CoreGraphics', '-o', CLICK_MONITOR_BIN, CLICK_MONITOR_SRC])
    return true
  } catch (err) {
    console.error('[click-monitor] compile failed', err)
    return false
  }
}

let mainWindow: BrowserWindow | null = null
let cursorInterval: ReturnType<typeof setInterval> | null = null
let clickProcess: ReturnType<typeof spawn> | null = null
let isMouseDown = false
let recordingStartTime = 0
const cursorLog: CursorFrame[] = []

function exportDataToBuffer(raw: unknown): Buffer | null {
  if (!raw) return null
  if (Buffer.isBuffer(raw)) return raw
  if (raw instanceof ArrayBuffer) return Buffer.from(raw)
  if (raw instanceof Uint8Array) return Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength)
  if (ArrayBuffer.isView(raw)) {
    const view = raw as ArrayBufferView
    return Buffer.from(view.buffer, view.byteOffset, view.byteLength)
  }
  if (Array.isArray(raw)) return Buffer.from(raw)
  return null
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false, // CRITICAL: keep canvas rendering when app loses focus
    },
  })

  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  // Compile the C click monitor at startup so it's ready for recording
  if (process.platform === 'darwin') {
    clickMonitorReady = compileClickMonitor()
  }

  mainWindow = createMainWindow()

  // IPC: List capture sources
  ipcMain.handle(Channels.SOURCES_LIST, async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 },
    })
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      thumbnailDataURL: s.thumbnail.toDataURL(),
      display_id: s.display_id,
    }))
  })

  // IPC: Check permissions
  ipcMain.handle(Channels.PERMISSIONS_CHECK, async (_event, type: string) => {
    const { systemPreferences } = await import('electron')
    switch (type) {
      case 'microphone':
        return systemPreferences.getMediaAccessStatus('microphone')
      case 'camera':
        return systemPreferences.getMediaAccessStatus('camera')
      case 'screen':
        return 'unknown'
      default:
        return 'unknown'
    }
  })

  // IPC: Recording start — kick off cursor tracking at ~60Hz
  ipcMain.on(Channels.RECORDING_START, (_event, _config) => {
    cursorLog.length = 0
    recordingStartTime = Date.now()
    isMouseDown = false

    // Start macOS click monitor (C helper polling CGEventSourceButtonState)
    if (process.platform === 'darwin' && clickMonitorReady) {
      clickProcess = spawn(CLICK_MONITOR_BIN, [], { stdio: ['ignore', 'pipe', 'ignore'] })
      clickProcess.stdout!.on('data', (data: Buffer) => {
        for (const line of data.toString().split('\n')) {
          if (line === 'down') isMouseDown = true
          else if (line === 'up') isMouseDown = false
        }
      })
      clickProcess.on('error', () => { clickProcess = null })
    }

    if (cursorInterval) clearInterval(cursorInterval)
    cursorInterval = setInterval(() => {
      const pos = screen.getCursorScreenPoint()
      const frame: CursorFrame = {
        t: Date.now() - recordingStartTime,
        x: pos.x,
        y: pos.y,
        click: isMouseDown,
      }
      cursorLog.push(frame)
      mainWindow?.webContents.send(Channels.CURSOR_DATA, frame)
    }, 16) // ~60Hz

    mainWindow?.webContents.send(Channels.RECORDING_STATUS, 'recording')
  })

  // IPC: Recording stop — stop cursor tracking and click monitor
  ipcMain.on(Channels.RECORDING_STOP, () => {
    if (cursorInterval) {
      clearInterval(cursorInterval)
      cursorInterval = null
    }
    if (clickProcess) {
      clickProcess.kill()
      clickProcess = null
    }
    isMouseDown = false

    // Save cursor log to benchmarks/cursor-log.json
    const benchDir = join(__dirname, '../../benchmarks')
    mkdirSync(benchDir, { recursive: true })
    writeFileSync(join(benchDir, 'cursor-log.json'), JSON.stringify(cursorLog))

    mainWindow?.webContents.send(Channels.RECORDING_STATUS, 'idle')
  })

  // IPC: Export — transcode WebM to MP4 via ffmpeg-static
  ipcMain.handle(Channels.EXPORT_START, async (_event, config: ExportStartConfig): Promise<ExportDoneResult> => {
    const videoBuffer = exportDataToBuffer(config?.data)
    const dataLen = videoBuffer?.byteLength ?? 0
    console.log('[export] start', {
      hasData: !!videoBuffer,
      dataLen,
      dataType: config?.data ? Object.prototype.toString.call(config.data) : 'undefined',
      fps: config?.fps ?? 30,
      resolution: config?.resolution ?? 'native',
    })

    if (!videoBuffer || dataLen === 0) {
      const error = 'No export data received in main process.'
      console.error('[export] no data available; aborting')
      mainWindow?.webContents.send(Channels.EXPORT_PROGRESS, 1)
      mainWindow?.webContents.send(Channels.EXPORT_DONE, { path: null, error })
      return { path: null, error }
    }

    // Save WebM blob to temp file
    const tmpDir = mkdtempSync(join(tmpdir(), 'kino-export-'))
    const inputPath = join(tmpDir, 'input.webm')
    writeFileSync(inputPath, videoBuffer)
    console.log('[export] temp input written', { inputPath, bytes: dataLen })

    // Ask user for save path
    mainWindow?.show()
    mainWindow?.focus()
    const saveResult = await dialog.showSaveDialog(mainWindow!, {
      title: 'Export as MP4',
      defaultPath: 'kino-recording.mp4',
      filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
    })
    if (saveResult.canceled || !saveResult.filePath) {
      console.log('[export] save dialog canceled')
      mainWindow?.webContents.send(Channels.EXPORT_PROGRESS, 1)
      mainWindow?.webContents.send(Channels.EXPORT_DONE, { path: null })
      return { path: null }
    }

    const outputPath = saveResult.filePath
    console.log('[export] output selected', { outputPath })

    // Resolve resolution
    const resMap: Record<string, string> = {
      '720p': '1280:720',
      '1080p': '1920:1080',
      '4k': '3840:2160',
    }
    const targetScale = resMap[config.resolution ?? 'native']
    const vf = targetScale
      ? `scale=${targetScale}:force_original_aspect_ratio=decrease,pad=${targetScale}:-1:-1:color=black`
      : 'scale=trunc(iw/2)*2:trunc(ih/2)*2'
    const fps = config.fps || 30

    // Load ffmpeg-static path
    let ffmpegBin: string | null = null
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      ffmpegBin = require('ffmpeg-static') as string | null
    } catch (error) {
      console.error('[export] failed to resolve ffmpeg-static', error)
    }
    console.log('[export] ffmpeg resolved', { ffmpegBin })

    if (!ffmpegBin || !existsSync(ffmpegBin)) {
      const error = ffmpegBin
        ? `ffmpeg binary not found at ${ffmpegBin}`
        : 'ffmpeg-static not available in main process'
      console.error('[export] ffmpeg unavailable', { error })
      mainWindow?.webContents.send(Channels.EXPORT_PROGRESS, 1)
      mainWindow?.webContents.send(Channels.EXPORT_DONE, { path: null, error })
      return { path: null, error }
    }

    const args = [
      '-y',
      '-i', inputPath,
      '-vf', vf,
      '-r', String(fps),
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      outputPath,
    ]

    return await new Promise<ExportDoneResult>((resolve) => {
      const proc = spawn(ffmpegBin, args)
      let stderrTail = ''

      proc.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString()
        stderrTail = (stderrTail + text).slice(-5000)
        // Parse progress from ffmpeg output "time=HH:MM:SS.ss"
        const match = text.match(/time=(\d+):(\d+):(\d+\.\d+)/)
        if (match) {
          const secs = parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseFloat(match[3])
          // We don't know total duration easily, so use a soft estimate
          const progress = Math.min(secs / 10, 0.95)
          mainWindow?.webContents.send(Channels.EXPORT_PROGRESS, progress)
        }
      })

      proc.on('error', (error) => {
        const message = `ffmpeg spawn error: ${error.message}`
        console.error('[export] ffmpeg spawn error', error)
        mainWindow?.webContents.send(Channels.EXPORT_PROGRESS, 1)
        mainWindow?.webContents.send(Channels.EXPORT_DONE, { path: null, error: message })
        resolve({ path: null, error: message })
      })

      proc.on('close', (code) => {
        console.log('[export] ffmpeg closed', { code })
        if (code === 0) {
          mainWindow?.webContents.send(Channels.EXPORT_PROGRESS, 1)
          mainWindow?.webContents.send(Channels.EXPORT_DONE, { path: outputPath })
          resolve({ path: outputPath })
          return
        }

        const message = `ffmpeg exit ${code ?? 'unknown'}${stderrTail ? `: ${stderrTail}` : ''}`
        console.error('[export] ffmpeg failed', { code, stderrTail })
        mainWindow?.webContents.send(Channels.EXPORT_PROGRESS, 1)
        mainWindow?.webContents.send(Channels.EXPORT_DONE, { path: null, error: message })
        resolve({ path: null, error: message })
      })
    })
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (cursorInterval) clearInterval(cursorInterval)
  if (clickProcess) clickProcess.kill()
  app.quit()
})

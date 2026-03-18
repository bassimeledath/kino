import { app, BrowserWindow, ipcMain, screen, desktopCapturer, dialog } from 'electron'
import { join } from 'path'
import { spawn } from 'child_process'
import { writeFileSync, mkdtempSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { Channels } from '../shared/channels'
import type { CursorFrame } from '../shared/types'

// Allow CDP WebSocket connections from any origin (required for benchmark tooling)
app.commandLine.appendSwitch('remote-allow-origins', '*')

// Swift helper that polls CGEventSourceButtonState at ~120Hz and emits "down"/"up" on state change.
// Requires no special permissions — CGEventSourceButtonState reads combined session state.
const CLICK_MONITOR_SWIFT = `import CoreGraphics
import Foundation
setbuf(stdout, nil)
var lastState = false
while true {
    let down = CGEventSource.buttonState(.combinedSessionState, button: .left)
    if down != lastState {
        lastState = down
        print(down ? "down" : "up")
    }
    Thread.sleep(forTimeInterval: 0.008)
}
`

let mainWindow: BrowserWindow | null = null
let cursorInterval: ReturnType<typeof setInterval> | null = null
let clickProcess: ReturnType<typeof spawn> | null = null
let isMouseDown = false
let recordingStartTime = 0
const cursorLog: CursorFrame[] = []

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

    // Start macOS click monitor (Swift helper polling CGEventSourceButtonState)
    if (process.platform === 'darwin') {
      const tmpSwift = join(tmpdir(), 'kino-click-monitor.swift')
      writeFileSync(tmpSwift, CLICK_MONITOR_SWIFT)
      clickProcess = spawn('/usr/bin/swift', [tmpSwift], { stdio: ['ignore', 'pipe', 'ignore'] })
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
  ipcMain.on(Channels.EXPORT_START, async (_event, config) => {
    // If no video data was sent, just do a mock progress animation
    if (!config?.data || !config.data.byteLength) {
      let p = 0
      const iv = setInterval(() => {
        p = Math.min(p + 0.12, 1)
        mainWindow?.webContents.send(Channels.EXPORT_PROGRESS, p)
        if (p >= 1) {
          clearInterval(iv)
          mainWindow?.webContents.send(Channels.EXPORT_DONE, { path: null })
        }
      }, 200)
      return
    }

    // Save WebM blob to temp file
    const tmpDir = mkdtempSync(join(tmpdir(), 'kino-export-'))
    const inputPath = join(tmpDir, 'input.webm')
    writeFileSync(inputPath, Buffer.from(config.data))

    // Ask user for save path
    const saveResult = await dialog.showSaveDialog(mainWindow!, {
      title: 'Export as MP4',
      defaultPath: 'kino-recording.mp4',
      filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
    })
    if (saveResult.canceled || !saveResult.filePath) {
      mainWindow?.webContents.send(Channels.EXPORT_PROGRESS, 1)
      mainWindow?.webContents.send(Channels.EXPORT_DONE, { path: null })
      return
    }

    const outputPath = saveResult.filePath

    // Resolve resolution
    const resMap: Record<string, string> = {
      '720p': '1280:720',
      '1080p': '1920:1080',
      '4k': '3840:2160',
    }
    const vf = resMap[config.resolution] ? `scale=${resMap[config.resolution]}:force_original_aspect_ratio=decrease,pad=${resMap[config.resolution]}:-1:-1:color=black` : 'scale=trunc(iw/2)*2:trunc(ih/2)*2'
    const fps = config.fps || 30

    // Load ffmpeg-static path
    let ffmpegBin: string
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      ffmpegBin = require('ffmpeg-static') as string
    } catch {
      // ffmpeg not available — do mock progress
      let p = 0
      const iv = setInterval(() => {
        p = Math.min(p + 0.1, 1)
        mainWindow?.webContents.send(Channels.EXPORT_PROGRESS, p)
        if (p >= 1) {
          clearInterval(iv)
          mainWindow?.webContents.send(Channels.EXPORT_DONE, { path: null })
        }
      }, 200)
      return
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

    const proc = spawn(ffmpegBin, args)

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      // Parse progress from ffmpeg output "time=HH:MM:SS.ss"
      const match = text.match(/time=(\d+):(\d+):(\d+\.\d+)/)
      if (match) {
        const secs = parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseFloat(match[3])
        // We don't know total duration easily, so use a soft estimate
        const progress = Math.min(secs / 10, 0.95)
        mainWindow?.webContents.send(Channels.EXPORT_PROGRESS, progress)
      }
    })

    proc.on('close', (code) => {
      if (code === 0) {
        mainWindow?.webContents.send(Channels.EXPORT_PROGRESS, 1)
        mainWindow?.webContents.send(Channels.EXPORT_DONE, { path: outputPath })
      } else {
        mainWindow?.webContents.send(Channels.EXPORT_PROGRESS, 1)
        mainWindow?.webContents.send(Channels.EXPORT_DONE, { path: null, error: `ffmpeg exit ${code}` })
      }
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

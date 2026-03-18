export type ZoomState = 'IDLE' | 'ZOOM_IN' | 'HOLD' | 'ZOOM_OUT'

interface ZoomUpdateInput {
  autoZoomEnabled: boolean
  autoZoomLevel: number
  speed: number
  dtMs: number
  currentZoom: number
}

export class ZoomController {
  private dwellMs = 0
  private zoomCooldownMs = 0
  private state: ZoomState = 'IDLE'

  update(input: ZoomUpdateInput): number {
    const { autoZoomEnabled, autoZoomLevel, speed, dtMs, currentZoom } = input

    if (!autoZoomEnabled) {
      this.dwellMs = 0
      this.zoomCooldownMs = 0
      this.setState('IDLE', speed)
      return 1
    }

    if (speed > 30) {
      this.dwellMs = 0
      this.zoomCooldownMs = 300
    } else {
      this.dwellMs += dtMs
    }

    if (this.dwellMs > 400) {
      this.setState('ZOOM_IN', speed)
      return autoZoomLevel
    }

    if (this.zoomCooldownMs > 0) {
      this.zoomCooldownMs -= dtMs
      this.setState('HOLD', speed)
      return currentZoom
    }

    this.setState('ZOOM_OUT', speed)
    return 1
  }

  private setState(next: ZoomState, speed: number) {
    if (this.state === next) return
    console.log(`[zoom] state: ${this.state} -> ${next}, speed=${speed.toFixed(1)}`)
    this.state = next
  }
}

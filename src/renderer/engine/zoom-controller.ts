export type ZoomState =
  | 'IDLE'
  | 'CLICK_ZOOM_IN' | 'CLICK_HOLD' | 'CLICK_ZOOM_OUT'
  | 'DWELL_ZOOM_IN' | 'DWELL_HOLD' | 'DWELL_ZOOM_OUT'

interface ZoomUpdateInput {
  autoZoomEnabled: boolean
  autoZoomLevel: number      // click zoom target (e.g. 1.9)
  dwellZoomLevel: number     // dwell zoom target (e.g. 1.3)
  dwellThresholdMs: number   // idle time before dwell triggers (e.g. 4000)
  speed: number
  dtMs: number
  clicked: boolean
}

export class ZoomController {
  private state: ZoomState = 'IDLE'
  private dwellMs = 0
  private holdMs = 0
  private cooldownMs = 0
  private timeSinceLastClickMs = 0

  private readonly idleSpeedThreshold = 15
  private readonly clickGroupGapMs = 2000   // clicks within 2s extend the zoom session
  private readonly clickHoldMinMs = 2000    // minimum hold after last click in group
  private readonly cooldownAfterZoomMs = 500

  update(input: ZoomUpdateInput): number {
    const { autoZoomEnabled, autoZoomLevel, dwellZoomLevel, dwellThresholdMs, speed, dtMs, clicked } = input

    if (!autoZoomEnabled) {
      this.reset()
      return 1
    }

    // Click always takes priority — groups rapid clicks into a single zoom session
    if (clicked) {
      if (this.state === 'CLICK_HOLD') {
        // Subsequent click during hold — reset hold timer (extend the group)
        this.holdMs = 0
        this.timeSinceLastClickMs = 0
      } else {
        this.setState('CLICK_ZOOM_IN')
        this.holdMs = 0
        this.cooldownMs = 0
        this.dwellMs = 0
        this.timeSinceLastClickMs = 0
      }
    }

    switch (this.state) {
      case 'IDLE': {
        if (this.cooldownMs > 0) {
          this.cooldownMs -= dtMs
          return 1
        }
        if (speed < this.idleSpeedThreshold) {
          this.dwellMs += dtMs
        } else {
          this.dwellMs = 0
        }
        if (this.dwellMs >= dwellThresholdMs) {
          this.setState('DWELL_ZOOM_IN')
          this.holdMs = 0
          return dwellZoomLevel
        }
        return 1
      }

      case 'CLICK_ZOOM_IN': {
        this.setState('CLICK_HOLD')
        this.holdMs = 0
        return autoZoomLevel
      }

      case 'CLICK_HOLD': {
        this.holdMs += dtMs
        this.timeSinceLastClickMs += dtMs
        // Only zoom out after no clicks for clickGroupGapMs AND minimum hold time elapsed
        if (this.timeSinceLastClickMs >= this.clickGroupGapMs && this.holdMs >= this.clickHoldMinMs) {
          this.setState('CLICK_ZOOM_OUT')
          return 1
        }
        return autoZoomLevel
      }

      case 'CLICK_ZOOM_OUT': {
        this.setState('IDLE')
        this.cooldownMs = this.cooldownAfterZoomMs
        this.dwellMs = 0
        return 1
      }

      case 'DWELL_ZOOM_IN': {
        this.setState('DWELL_HOLD')
        return dwellZoomLevel
      }

      case 'DWELL_HOLD': {
        if (speed > this.idleSpeedThreshold) {
          this.setState('DWELL_ZOOM_OUT')
          return 1
        }
        return dwellZoomLevel
      }

      case 'DWELL_ZOOM_OUT': {
        this.setState('IDLE')
        this.cooldownMs = this.cooldownAfterZoomMs
        this.dwellMs = 0
        return 1
      }
    }
  }

  private setState(next: ZoomState) {
    if (this.state === next) return
    this.state = next
  }

  private reset() {
    this.dwellMs = 0
    this.holdMs = 0
    this.cooldownMs = 0
    this.timeSinceLastClickMs = 0
    if (this.state !== 'IDLE') {
      this.setState('IDLE')
    }
  }
}

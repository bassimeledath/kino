export interface SpringParams {
  stiffness: number
  damping: number
  mass: number
}

export class SpringCamera {
  private vx = 0
  private vy = 0
  private vZoom = 0

  public x = 0
  public y = 0
  public zoom = 1.0

  update(
    tx: number,
    ty: number,
    tz: number,
    dt: number,
    positionSpring: SpringParams,
    zoomSpring: SpringParams,
    zoomOutSpring?: SpringParams,
  ) {
    // Position uses screen movement spring (slow, smooth camera panning)
    const ax = (positionSpring.stiffness * (tx - this.x) - positionSpring.damping * this.vx) / positionSpring.mass
    const ay = (positionSpring.stiffness * (ty - this.y) - positionSpring.damping * this.vy) / positionSpring.mass
    this.vx += ax * dt
    this.vy += ay * dt
    this.x += this.vx * dt
    this.y += this.vy * dt

    // Zoom: asymmetric springs — snappy zoom-in, gentle zoom-out
    // Direction is based on target vs current: when target < current, we're zooming out
    const activeZoomSpring = (tz < this.zoom && zoomOutSpring) ? zoomOutSpring : zoomSpring
    const az = (activeZoomSpring.stiffness * (tz - this.zoom) - activeZoomSpring.damping * this.vZoom) / activeZoomSpring.mass
    this.vZoom += az * dt
    this.zoom += this.vZoom * dt
  }
}

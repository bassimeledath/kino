export class SpringCamera {
  private vx = 0
  private vy = 0
  private vZoom = 0

  constructor(
    private stiffness = 120,
    private damping = 12,
    public x = 0,
    public y = 0,
    public zoom = 1.0,
  ) {}

  update(tx: number, ty: number, tz: number, dt: number) {
    const ax = this.stiffness * (tx - this.x) - this.damping * this.vx
    const ay = this.stiffness * (ty - this.y) - this.damping * this.vy
    this.vx += ax * dt
    this.vy += ay * dt
    this.x += this.vx * dt
    this.y += this.vy * dt

    const az = this.stiffness * (tz - this.zoom) - this.damping * this.vZoom
    this.vZoom += az * dt
    this.zoom += this.vZoom * dt
  }
}

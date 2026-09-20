export type AimTarget = { id: number; x: number; y: number; r: number; alive: boolean };

export class AimPopPractice {
  targets: AimTarget[] = [];
  score = 0;
  combo = 0;
  handOk = false;
  private nextId = 1;
  private spawnAt = 0;
  private handSeenMs = 0;
  readonly maxTargets = 4;
  readonly hitRadius = 0.09;

  reset() {
    this.targets = [];
    this.score = 0;
    this.combo = 0;
    this.handOk = false;
    this.nextId = 1;
    this.spawnAt = 0;
    this.handSeenMs = 0;
  }

  update(dt: number, now: number, handVisible: boolean) {
    if (handVisible) {
      this.handSeenMs += dt * 1000;
      this.handOk = this.handSeenMs > 450;
    } else {
      this.handSeenMs = Math.max(0, this.handSeenMs - dt * 800);
      this.handOk = this.handSeenMs > 450;
    }

    if (now >= this.spawnAt && this.targets.filter(t => t.alive).length < this.maxTargets) {
      this.spawn();
      this.spawnAt = now + 900 + Math.random() * 700;
    }
  }

  spawn(x = 0.18 + Math.random() * 0.64, y = 0.22 + Math.random() * 0.52) {
    const t: AimTarget = { id: this.nextId++, x, y, r: this.hitRadius, alive: true };
    this.targets.push(t);
    return t;
  }

  tryHit(x: number, y: number): AimTarget | null {
    const hit = this.targets
      .filter(t => t.alive && Math.hypot(t.x - x, t.y - y) <= t.r)
      .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
    if (!hit) {
      this.combo = 0;
      return null;
    }
    hit.alive = false;
    this.combo++;
    this.score += 100 * Math.min(this.combo, 5);
    return hit;
  }
}

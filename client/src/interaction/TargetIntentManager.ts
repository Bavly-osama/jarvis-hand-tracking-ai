/**
 * Hysteresis-based target locking to prevent hover flickering
 * between interactive elements. The current target retains priority
 * until another target is CLEARLY closer (>20% closer), preventing
 * the rapid switching that occurs at equidistant boundaries.
 */

export interface TargetInfo {
  id: string;
  center: { x: number; y: number };
  radius: number;
}

export interface TargetIntentResult {
  targetId: string | null;
  distance: number;
  dwellMs: number;
  isLocked: boolean;
}

/** Minimum time (ms) the current target stays locked before a switch is allowed. */
const MIN_LOCK_DURATION_MS = 200;

/** A new target must be at least this fraction closer to override the current one. */
const SWITCH_HYSTERESIS = 0.20;

export class TargetIntentManager {
  private currentTargetId: string | null = null;
  private lockStartMs: number = 0;
  private hoverStartMs: number = 0;
  private lastDistance: number = Infinity;

  /**
   * Evaluate cursor position against available targets and resolve intent.
   *
   * @param cursorX  Normalized cursor X (0-1).
   * @param cursorY  Normalized cursor Y (0-1).
   * @param targets  Interactive elements the cursor can engage with.
   * @param nowMs    Current high-resolution timestamp (ms).
   */
  update(
    cursorX: number,
    cursorY: number,
    targets: TargetInfo[],
    nowMs: number,
  ): TargetIntentResult {
    if (targets.length === 0) {
      this.clearTarget();
      return { targetId: null, distance: Infinity, dwellMs: 0, isLocked: false };
    }

    // ---- Compute distances to every target ----
    interface Ranked {
      id: string;
      dist: number;
    }

    const ranked: Ranked[] = [];
    for (const t of targets) {
      const dx = cursorX - t.center.x;
      const dy = cursorY - t.center.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // Only consider targets the cursor is actually within
      if (dist <= t.radius) {
        ranked.push({ id: t.id, dist });
      }
    }

    // Sort ascending by distance
    ranked.sort((a, b) => a.dist - b.dist);

    // No target in range
    if (ranked.length === 0) {
      this.clearTarget();
      return { targetId: null, distance: Infinity, dwellMs: 0, isLocked: false };
    }

    const nearest = ranked[0];

    // ---- Resolve target with hysteresis ----
    if (this.currentTargetId === null) {
      // No existing lock — acquire the nearest target immediately
      this.acquireTarget(nearest.id, nowMs);
      this.lastDistance = nearest.dist;
      return {
        targetId: nearest.id,
        distance: nearest.dist,
        dwellMs: 0,
        isLocked: true,
      };
    }

    // Find the current target's distance (it may have left range)
    const currentEntry = ranked.find((r) => r.id === this.currentTargetId);
    const currentDist = currentEntry ? currentEntry.dist : Infinity;
    const timeSinceLock = nowMs - this.lockStartMs;
    const isWithinLockWindow = timeSinceLock < MIN_LOCK_DURATION_MS;

    // Current target is still in range — check if we should switch
    if (currentEntry) {
      // During the lock window the current target cannot be overridden
      if (isWithinLockWindow) {
        this.lastDistance = currentDist;
        return {
          targetId: this.currentTargetId,
          distance: currentDist,
          dwellMs: nowMs - this.hoverStartMs,
          isLocked: true,
        };
      }

      // After the lock window: only switch if the nearest is significantly closer
      if (nearest.id !== this.currentTargetId) {
        const requiredDist = currentDist * (1 - SWITCH_HYSTERESIS);
        if (nearest.dist < requiredDist) {
          this.acquireTarget(nearest.id, nowMs);
          this.lastDistance = nearest.dist;
          return {
            targetId: nearest.id,
            distance: nearest.dist,
            dwellMs: 0,
            isLocked: true,
          };
        }
      }

      // Stay on current target
      this.lastDistance = currentDist;
      return {
        targetId: this.currentTargetId,
        distance: currentDist,
        dwellMs: nowMs - this.hoverStartMs,
        isLocked: true,
      };
    }

    // Current target has left range — switch to nearest
    this.acquireTarget(nearest.id, nowMs);
    this.lastDistance = nearest.dist;
    return {
      targetId: nearest.id,
      distance: nearest.dist,
      dwellMs: 0,
      isLocked: true,
    };
  }

  /** Release the current target lock (e.g. hand leaves interaction zone). */
  clearTarget(): void {
    this.currentTargetId = null;
    this.lockStartMs = 0;
    this.hoverStartMs = 0;
    this.lastDistance = Infinity;
  }

  /** Return the ID of the currently locked target, or null. */
  getCurrentTargetId(): string | null {
    return this.currentTargetId;
  }

  /** Full reset — equivalent to a fresh instance. */
  reset(): void {
    this.clearTarget();
  }

  // ---- Private helpers ----

  private acquireTarget(id: string, nowMs: number): void {
    this.currentTargetId = id;
    this.lockStartMs = nowMs;
    this.hoverStartMs = nowMs;
  }
}

/**
 * Magnetic cursor attraction toward selectable objects.
 * The cursor subtly gravitates toward the nearest valid target —
 * never a hard snap. Attraction uses cubic ease-in so the pull
 * feels natural: weak at the edge of the magnetic zone and
 * progressively stronger near the center.
 */

export interface MagneticTarget {
  id: string;
  x: number;
  y: number;
  radius: number; // magnetic zone radius (normalized coords)
}

export interface MagneticResult {
  /** Magnetized cursor X after attraction. */
  x: number;
  /** Magnetized cursor Y after attraction. */
  y: number;
  /** ID of the nearest target within magnetic range, or null. */
  nearestTargetId: string | null;
  /** Current attraction strength applied (0 = none, 1 = maximum configured). */
  attractionStrength: number;
}

/** Default magnetic zone radius in normalized coordinates. */
const DEFAULT_RADIUS = 0.08;

/** Default overall strength multiplier (1.0 = full effect). */
const DEFAULT_STRENGTH = 1.0;

/**
 * Attraction pull fraction at the very edge of the magnetic zone.
 * The cursor is pulled this fraction of the way toward the target center.
 */
const PULL_AT_EDGE = 0.20;

/**
 * Attraction pull fraction when the cursor is nearly on top of the target center.
 * Capped here to keep the visual shift subtle.
 */
const PULL_AT_CENTER = 0.40;

export class MagneticTargeting {
  private strength: number;
  private defaultRadius: number;

  constructor(strength: number = DEFAULT_STRENGTH, defaultRadius: number = DEFAULT_RADIUS) {
    this.strength = Math.max(0, strength);
    this.defaultRadius = Math.max(0.001, defaultRadius);
  }

  /**
   * Compute the magnetized cursor position given the raw cursor
   * and a set of magnetic targets.
   *
   * @param cursorX  Raw normalized cursor X.
   * @param cursorY  Raw normalized cursor Y.
   * @param targets  Available magnetic targets.
   * @returns The adjusted cursor position and metadata.
   */
  computeAttraction(
    cursorX: number,
    cursorY: number,
    targets: MagneticTarget[],
  ): MagneticResult {
    if (targets.length === 0 || this.strength <= 0) {
      return { x: cursorX, y: cursorY, nearestTargetId: null, attractionStrength: 0 };
    }

    // ---- Find the closest target whose magnetic zone contains the cursor ----
    let bestTarget: MagneticTarget | null = null;
    let bestDist = Infinity;

    for (const t of targets) {
      const dx = cursorX - t.x;
      const dy = cursorY - t.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const effectiveRadius = t.radius > 0 ? t.radius : this.defaultRadius;

      if (dist <= effectiveRadius && dist < bestDist) {
        bestDist = dist;
        bestTarget = t;
      }
    }

    if (bestTarget === null) {
      return { x: cursorX, y: cursorY, nearestTargetId: null, attractionStrength: 0 };
    }

    const effectiveRadius = bestTarget.radius > 0 ? bestTarget.radius : this.defaultRadius;

    // Avoid division by zero when cursor is exactly on center
    if (bestDist < 1e-7) {
      return {
        x: bestTarget.x,
        y: bestTarget.y,
        nearestTargetId: bestTarget.id,
        attractionStrength: PULL_AT_CENTER * this.strength,
      };
    }

    // ---- Compute pull fraction ----
    // `t` ranges from 1 (edge) to 0 (center)
    const t = Math.min(bestDist / effectiveRadius, 1);

    // Cubic ease-in: slow start near edge, accelerating toward center.
    // At t=1 (edge)   → eased = 1  → pull = PULL_AT_EDGE
    // At t=0 (center) → eased = 0  → pull = PULL_AT_CENTER
    const eased = t * t * t;

    // Linearly interpolate between center-pull and edge-pull based on eased value
    const pullFraction = PULL_AT_CENTER + (PULL_AT_EDGE - PULL_AT_CENTER) * eased;

    // Apply the global strength multiplier
    const effectivePull = pullFraction * this.strength;

    // ---- Shift the cursor toward the target center ----
    const magnetizedX = cursorX + (bestTarget.x - cursorX) * effectivePull;
    const magnetizedY = cursorY + (bestTarget.y - cursorY) * effectivePull;

    return {
      x: magnetizedX,
      y: magnetizedY,
      nearestTargetId: bestTarget.id,
      attractionStrength: effectivePull,
    };
  }

  /** Update the global strength multiplier at runtime. */
  setStrength(s: number): void {
    this.strength = Math.max(0, s);
  }
}

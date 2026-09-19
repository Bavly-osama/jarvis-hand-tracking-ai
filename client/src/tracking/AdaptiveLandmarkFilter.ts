import { Landmark, OneEuroFilter } from './LandmarkFilter';

// ─── Filter profiles per landmark role ──────────────────────────────────────

interface FilterProfile {
  minCutoff: number;
  beta:      number;
  dCutoff:   number;
}

// Palm/wrist landmarks: heavily smoothed for stability
const PROFILE_STABLE: FilterProfile = { minCutoff: 1.5, beta: 8, dCutoff: 2.0 };
// Finger MCPs: moderate smoothing
const PROFILE_MODERATE: FilterProfile = { minCutoff: 2.0, beta: 10, dCutoff: 2.0 };
// Fingertips: responsive for precise interaction
const PROFILE_RESPONSIVE: FilterProfile = { minCutoff: 3.0, beta: 12, dCutoff: 2.0 };

// Landmark index → profile mapping
const LANDMARK_PROFILES: FilterProfile[] = [
  PROFILE_STABLE,     // 0  WRIST
  PROFILE_STABLE,     // 1  THUMB_CMC
  PROFILE_MODERATE,   // 2  THUMB_MCP
  PROFILE_MODERATE,   // 3  THUMB_IP
  PROFILE_RESPONSIVE, // 4  THUMB_TIP
  PROFILE_MODERATE,   // 5  INDEX_MCP
  PROFILE_MODERATE,   // 6  INDEX_PIP
  PROFILE_RESPONSIVE, // 7  INDEX_DIP
  PROFILE_RESPONSIVE, // 8  INDEX_TIP
  PROFILE_STABLE,     // 9  MIDDLE_MCP (used as palm center)
  PROFILE_MODERATE,   // 10 MIDDLE_PIP
  PROFILE_RESPONSIVE, // 11 MIDDLE_DIP
  PROFILE_RESPONSIVE, // 12 MIDDLE_TIP
  PROFILE_MODERATE,   // 13 RING_MCP
  PROFILE_MODERATE,   // 14 RING_PIP
  PROFILE_RESPONSIVE, // 15 RING_DIP
  PROFILE_RESPONSIVE, // 16 RING_TIP
  PROFILE_MODERATE,   // 17 PINKY_MCP
  PROFILE_MODERATE,   // 18 PINKY_PIP
  PROFILE_RESPONSIVE, // 19 PINKY_DIP
  PROFILE_RESPONSIVE, // 20 PINKY_TIP
];

// ─── Adaptive dead zone ─────────────────────────────────────────────────────

const BASE_DEAD_ZONE   = 0.0015;  // minimum dead zone in normalized space
const DEAD_ZONE_SCALE  = 0.01;    // dead zone relative to hand size

// ─── Speed-adaptive filtering ───────────────────────────────────────────────

const SPEED_BOOST_THRESHOLD = 0.02;   // speed above which we reduce smoothing
const SPEED_BOOST_MAX       = 3.0;    // max cutoff multiplier for fast movement

// ─── AdaptiveLandmarkFilter ─────────────────────────────────────────────────

export class AdaptiveLandmarkFilter {
  private filters: OneEuroFilter[][] = [];
  private velocityFilters: OneEuroFilter[][] = [];
  private prevLandmarks: Landmark[][] = [];
  private prevTimestamp: number = 0;
  private handSize: number = 0.16;

  constructor(numHands: number = 2, numLandmarks: number = 21) {
    for (let h = 0; h < numHands; h++) {
      const handFilters: OneEuroFilter[] = [];
      const velFilters: OneEuroFilter[] = [];

      for (let i = 0; i < numLandmarks; i++) {
        const profile = LANDMARK_PROFILES[i] || PROFILE_MODERATE;
        // 3 axes per landmark (x, y, z)
        handFilters.push(new OneEuroFilter(profile.minCutoff, profile.beta, profile.dCutoff));
        handFilters.push(new OneEuroFilter(profile.minCutoff, profile.beta, profile.dCutoff));
        handFilters.push(new OneEuroFilter(profile.minCutoff, profile.beta, profile.dCutoff));

        // Separate velocity filters (more smoothed)
        velFilters.push(new OneEuroFilter(0.5, 0.001, 1.0)); // vel x
        velFilters.push(new OneEuroFilter(0.5, 0.001, 1.0)); // vel y
        velFilters.push(new OneEuroFilter(0.5, 0.001, 1.0)); // vel z
      }
      this.filters.push(handFilters);
      this.velocityFilters.push(velFilters);
      this.prevLandmarks.push([]);
    }
  }

  // ── Get computed hand size ────────────────────────────────────────────

  public getHandSize(): number { return this.handSize; }

  // ── Compute adaptive dead zone based on hand size ─────────────────────

  private getDeadZone(): number {
    return Math.max(BASE_DEAD_ZONE, this.handSize * DEAD_ZONE_SCALE);
  }

  // ── Apply dead zone to a value ────────────────────────────────────────

  private applyDeadZone(current: number, previous: number, deadZone: number): number {
    const delta = current - previous;
    if (Math.abs(delta) < deadZone) {
      return previous;  // suppress micro-movement
    }
    // Smooth transition out of dead zone to avoid popping
    const excess = Math.abs(delta) - deadZone;
    const smoothed = previous + Math.sign(delta) * excess;
    return smoothed;
  }

  // ── Main filter method ────────────────────────────────────────────────

  filter(
    multiHandLandmarks: Landmark[][],
    timestamp: number
  ): { filtered: Landmark[][]; velocities: { x: number; y: number; z: number }[][] } {
    const filtered: Landmark[][] = [];
    const velocities: { x: number; y: number; z: number }[][] = [];
    const dt = this.prevTimestamp > 0 ? timestamp - this.prevTimestamp : 1 / 30;

    for (let h = 0; h < multiHandLandmarks.length; h++) {
      if (h >= this.filters.length) break;
      const hand = multiHandLandmarks[h];
      const filteredHand: Landmark[] = [];
      const handVelocities: { x: number; y: number; z: number }[] = [];
      const handFilters = this.filters[h];
      const velFilters = this.velocityFilters[h];
      const prevHand = this.prevLandmarks[h];

      // Calculate hand size for adaptive dead zone
      if (hand[0] && hand[9]) {
        const dx = hand[0].x - hand[9].x;
        const dy = hand[0].y - hand[9].y;
        const dz = hand[0].z - hand[9].z;
        this.handSize = Math.sqrt(dx * dx + dy * dy + dz * dz);
      }

      const deadZone = this.getDeadZone();

      for (let i = 0; i < hand.length; i++) {
        const lm = hand[i];

        // Speed-adaptive cutoff boost
        let speed = 0;
        if (prevHand.length > i && dt > 0) {
          const vx = (lm.x - prevHand[i].x) / dt;
          const vy = (lm.y - prevHand[i].y) / dt;
          speed = Math.sqrt(vx * vx + vy * vy);
        }

        // Boost filter cutoff when moving fast → less smoothing
        const speedFactor = speed > SPEED_BOOST_THRESHOLD
          ? Math.min(SPEED_BOOST_MAX, 1 + (speed - SPEED_BOOST_THRESHOLD) * 10)
          : 1;

        const apply = (filter: OneEuroFilter, value: number) => {
          const prevMin = filter.minCutoff;
          filter.minCutoff = prevMin * speedFactor;
          const out = filter.filter(value, timestamp);
          filter.minCutoff = prevMin;
          return out;
        };
        const fx = apply(handFilters[i * 3], lm.x);
        const fy = apply(handFilters[i * 3 + 1], lm.y);
        const fz = apply(handFilters[i * 3 + 2], lm.z);

        // Apply dead zone (only for stable landmarks when moving slowly)
        let finalX = fx, finalY = fy, finalZ = fz;
        if (prevHand.length > i && speedFactor < 1.5) {
          finalX = this.applyDeadZone(fx, prevHand[i].x, deadZone);
          finalY = this.applyDeadZone(fy, prevHand[i].y, deadZone);
          // Don't dead-zone Z — it's already noisy and we need changes for tap detection
        }

        filteredHand.push({ x: finalX, y: finalY, z: finalZ });

        // Compute and filter velocity
        if (prevHand.length > i && dt > 0 && dt < 0.2) {
          const rawVx = (finalX - prevHand[i].x) / dt;
          const rawVy = (finalY - prevHand[i].y) / dt;
          const rawVz = (finalZ - prevHand[i].z) / dt;
          handVelocities.push({
            x: velFilters[i * 3].filter(rawVx, timestamp),
            y: velFilters[i * 3 + 1].filter(rawVy, timestamp),
            z: velFilters[i * 3 + 2].filter(rawVz, timestamp),
          });
        } else {
          handVelocities.push({ x: 0, y: 0, z: 0 });
        }
      }

      filtered.push(filteredHand);
      velocities.push(handVelocities);
      this.prevLandmarks[h] = filteredHand.map(l => ({ ...l }));
    }

    this.prevTimestamp = timestamp;
    return { filtered, velocities };
  }

  // ── Soft reset — preserve history for continuity ──────────────────────

  softReset(): void {
    // Don't wipe filter state, just velocity
    for (const vf of this.velocityFilters) {
      for (const f of vf) f.reset();
    }
  }

  // ── Hard reset — full wipe ────────────────────────────────────────────

  reset(): void {
    for (const hf of this.filters) {
      for (const f of hf) f.reset();
    }
    for (const vf of this.velocityFilters) {
      for (const f of vf) f.reset();
    }
    this.prevLandmarks = this.prevLandmarks.map(() => []);
    this.prevTimestamp = 0;
  }
}

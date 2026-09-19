export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export class OneEuroFilter {
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;
  private xPrev: number | null = null;
  private dxPrev: number = 0;
  private rawPrev: number | null = null;
  private tPrev: number = 0;

  constructor(minCutoff = 1.0, beta = 0.0, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  private alpha(cutoff: number, dt: number): number {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / dt);
  }

  filter(x: number, t: number): number {
    if (this.xPrev === null) {
      this.xPrev = x;
      this.rawPrev = x;
      this.tPrev = t;
      return x;
    }

    const dt = t - this.tPrev;
    if (dt <= 0) return x;

    const dx = (x - (this.rawPrev ?? x)) / dt;
    this.rawPrev = x;
    const edx = this.alpha(this.dCutoff, dt) * dx + (1 - this.alpha(this.dCutoff, dt)) * this.dxPrev;
    
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    const xFiltered = this.alpha(cutoff, dt) * x + (1 - this.alpha(cutoff, dt)) * this.xPrev;

    this.xPrev = xFiltered;
    this.dxPrev = edx;
    this.tPrev = t;

    return xFiltered;
  }

  reset() {
    this.xPrev = null;
    this.rawPrev = null;
    this.dxPrev = 0;
    this.tPrev = 0;
  }
}

export class LandmarkFilter {
  private filters: OneEuroFilter[][] = [];

  constructor(numHands: number = 2, numLandmarks: number = 21) {
    for (let h = 0; h < numHands; h++) {
      const handFilters: OneEuroFilter[] = [];
      for (let i = 0; i < numLandmarks * 3; i++) {
        handFilters.push(new OneEuroFilter(1.0, 0.005, 1.0));
      }
      this.filters.push(handFilters);
    }
  }

  filter(multiHandLandmarks: Landmark[][], timestamp: number): Landmark[][] {
    const filtered: Landmark[][] = [];
    
    for (let h = 0; h < multiHandLandmarks.length; h++) {
      if (h >= this.filters.length) break;
      const hand = multiHandLandmarks[h];
      const filteredHand: Landmark[] = [];
      const handFilters = this.filters[h];
      
      for (let i = 0; i < hand.length; i++) {
        const lm = hand[i];
        filteredHand.push({
          x: handFilters[i * 3].filter(lm.x, timestamp),
          y: handFilters[i * 3 + 1].filter(lm.y, timestamp),
          z: handFilters[i * 3 + 2].filter(lm.z, timestamp)
        });
      }
      filtered.push(filteredHand);
    }
    
    return filtered;
  }

  reset() {
    for (const handFilters of this.filters) {
      for (const f of handFilters) {
        f.reset();
      }
    }
  }
}

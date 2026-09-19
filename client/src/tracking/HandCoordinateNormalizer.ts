import type { Landmark } from './LandmarkFilter';
/** Single camera-to-mirror-view boundary. Logical +X is right, +Y is down. */
export class HandCoordinateNormalizer {
  constructor(public mirrorCamera = true) {}
  landmarks(points: Landmark[], space: 'camera' | 'logical'): Landmark[] {
    return points.map(p => ({x: space === 'camera' && this.mirrorCamera ? 1-p.x : p.x, y:p.y, z:p.z}));
  }
  handedness(label: string, space: 'camera' | 'logical'): string {
    // Legacy Hands assumes mirrored pixels; our input video is unmirrored.
    const upper = label.toUpperCase();
    return space === 'camera' ? (upper === 'LEFT' ? 'RIGHT' : upper === 'RIGHT' ? 'LEFT' : 'UNKNOWN') : upper;
  }
}

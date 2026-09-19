import type { Landmark } from './LandmarkFilter';
import { cameraToScreenCoordinates, type CameraFrameSize, type CameraSpace } from './cameraToScreenCoordinates';

/** Single camera-to-mirror-view boundary. Logical +X is right, +Y is down. */
export class HandCoordinateNormalizer {
  constructor(public mirrorCamera = true) {}

  landmarks(
    points: Landmark[],
    space: CameraSpace,
    video?: CameraFrameSize,
    stage?: CameraFrameSize
  ): Landmark[] {
    return points.map(p => {
      const mapped = cameraToScreenCoordinates(p.x, p.y, {
        space,
        mirror: this.mirrorCamera,
        video,
        stage,
      });
      return { x: mapped.x, y: mapped.y, z: p.z };
    });
  }

  handedness(label: string, space: CameraSpace): string {
    const upper = label.toUpperCase();
    return space === 'camera'
      ? (upper === 'LEFT' ? 'RIGHT' : upper === 'RIGHT' ? 'LEFT' : 'UNKNOWN')
      : upper;
  }
}

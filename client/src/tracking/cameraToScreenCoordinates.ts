export type CameraSpace = 'camera' | 'logical';

export type CameraFrameSize = { width: number; height: number };

export type CameraToScreenOptions = {
  space?: CameraSpace;
  mirror?: boolean;
  video?: CameraFrameSize;
  stage?: CameraFrameSize;
};

export type ScreenPoint = { x: number; y: number; screenX: number; screenY: number };

/**
 * Single camera → interface mapping.
 * Visual mirroring is CSS scaleX(-1). This function compensates once.
 * Logical fixtures are already in mirrored screen space and must not be flipped again.
 */
export function cameraToScreenCoordinates(
  nx: number,
  ny: number,
  options: CameraToScreenOptions = {}
): ScreenPoint {
  const space = options.space ?? 'camera';
  const mirror = options.mirror ?? true;
  let x = space === 'camera' && mirror ? 1 - nx : nx;
  let y = ny;

  const video = options.video;
  const stage = options.stage;
  if (space === 'camera' && video?.width && video.height && stage?.width && stage.height) {
    const videoAspect = video.width / video.height;
    const stageAspect = stage.width / stage.height;
    if (videoAspect > stageAspect) {
      const visible = stageAspect / videoAspect;
      const offset = (1 - visible) / 2;
      x = (x - offset) / visible;
    } else if (stageAspect > videoAspect) {
      const visible = videoAspect / stageAspect;
      const offset = (1 - visible) / 2;
      y = (y - offset) / visible;
    }
  }

  const width = stage?.width ?? 1;
  const height = stage?.height ?? 1;
  return { x, y, screenX: x * width, screenY: y * height };
}

import { LandmarkFilter, Landmark } from './LandmarkFilter';

export type HandTrackerCallback = (
  landmarks: Landmark[][],
  timestamp: number,
  handedness: string[]
) => void;

declare const Hands: any;
declare const Camera: any;

export class HandTracker {
  private hands: any;
  private camera: any = null;
  private filter: LandmarkFilter;
  private onResultsCallback: HandTrackerCallback | null = null;
  private isRunning: boolean = false;

  constructor() {
    this.filter = new LandmarkFilter(2, 21);

    if (typeof Hands === 'undefined') {
      console.warn(
        '[HandTracker] MediaPipe Hands not found on window. Ensure CDN script is loaded.'
      );
      return;
    }

    this.hands = new Hands({
      locateFile: (file: string) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915/${file}`,
    });

    this.hands.setOptions({
      maxNumHands:            2,
      modelComplexity:        1,
      minDetectionConfidence: 0.55,
      minTrackingConfidence:  0.5,
    });

    this.hands.onResults(this.onResults.bind(this));
  }

  public onUpdate(callback: HandTrackerCallback) {
    this.onResultsCallback = callback;
  }

  private onResults(results: any) {
    if (!this.isRunning) return;
    const timestamp = performance.now() / 1000;

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      const filtered   = this.filter.filter(results.multiHandLandmarks, timestamp);
      const handedness = (results.multiHandedness ?? []).map(
        (h: any) => (h.label as string) || 'RIGHT'
      );
      if (this.onResultsCallback) {
        this.onResultsCallback(filtered, timestamp, handedness);
      }
    } else {
      this.filter.reset();
      if (this.onResultsCallback) {
        this.onResultsCallback([], timestamp, []);
      }
    }
  }

  public async start(videoElement: HTMLVideoElement): Promise<void> {
    if (!this.hands) throw new Error('MediaPipe Hands not initialized');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('CAMERA_NOT_SUPPORTED');
    }

    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        }
      });
      stream.getTracks().forEach(track => track.stop());
    } catch (err: any) {
      console.warn('[HandTracker] Camera access check failed:', err.name, err.message);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        throw new Error('CAMERA_DENIED');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        throw new Error('CAMERA_NOT_FOUND');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        throw new Error('CAMERA_BUSY');
      }
      throw err;
    }

    return new Promise((resolve, reject) => {
      try {
        this.camera = new Camera(videoElement, {
          onFrame: async () => {
            if (this.hands && this.isRunning) {
              await this.hands.send({ image: videoElement });
            }
          },
          width:  640,
          height: 480,
        });

        this.camera.start()
          .then(() => {
            this.isRunning = true;
            resolve();
          })
          .catch((err: any) => {
            this.isRunning = false;
            reject(err);
          });
      } catch (e) {
        this.isRunning = false;
        reject(e);
      }
    });
  }

  public stop() {
    this.isRunning = false;
    if (this.camera) {
      try {
        this.camera.stop();
      } catch {}
      this.camera = null;
    }
    this.filter.reset();
  }
}

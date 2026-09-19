import { cameraToScreenCoordinates, type CameraSpace } from '../tracking/cameraToScreenCoordinates';
import { HAND_CONNECTIONS, LM } from '../tracking/NormalizedHandState';
import type { Landmark } from '../tracking/LandmarkFilter';

export class HandDebugLayer {
  private canvas: HTMLCanvasElement | null;
  private ctx: CanvasRenderingContext2D | null;
  constructor(canvas?: HTMLCanvasElement | null) {
    this.canvas = canvas ?? (typeof document !== 'undefined' ? document.querySelector('.hand-debug-layer') : null);
    this.ctx = this.canvas?.getContext('2d') ?? null;
  }

  draw(
    hands: { landmarks: Landmark[]; raw?: Landmark[] }[],
    pointer: Landmark | null,
    space: CameraSpace,
    video?: HTMLVideoElement | null
  ) {
    const canvas = this.canvas;
    const ctx = this.ctx;
    if (!canvas || !ctx) return;
    const width = canvas.clientWidth || innerWidth;
    const height = canvas.clientHeight || innerHeight;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    ctx.clearRect(0, 0, width, height);
    const stage = { width, height };
    const frame = video && video.videoWidth ? { width: video.videoWidth, height: video.videoHeight } : undefined;
    const map = (p: Landmark) => cameraToScreenCoordinates(p.x, p.y, { space, video: frame, stage });

    for (const hand of hands) {
      const marks = hand.landmarks;
      if (!marks?.length) continue;
      ctx.strokeStyle = 'rgba(80,220,255,.85)';
      ctx.lineWidth = 2;
      for (const [a, b] of HAND_CONNECTIONS) {
        const pa = map(marks[a]);
        const pb = map(marks[b]);
        ctx.beginPath();
        ctx.moveTo(pa.screenX, pa.screenY);
        ctx.lineTo(pb.screenX, pb.screenY);
        ctx.stroke();
      }
      const palm = map(marks[LM.MIDDLE_MCP]);
      const thumb = map(marks[LM.THUMB_TIP]);
      const index = map(marks[LM.INDEX_TIP]);
      ctx.fillStyle = '#7cffb2';
      ctx.beginPath(); ctx.arc(palm.screenX, palm.screenY, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd36a';
      ctx.beginPath(); ctx.arc(thumb.screenX, thumb.screenY, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#6ad4ff';
      ctx.beginPath(); ctx.arc(index.screenX, index.screenY, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ff8ae2';
      ctx.beginPath(); ctx.moveTo(thumb.screenX, thumb.screenY); ctx.lineTo(index.screenX, index.screenY); ctx.stroke();
    }
    if (pointer) {
      const p = map(pointer);
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(p.screenX, p.screenY, 10, 0, Math.PI * 2); ctx.stroke();
    }
  }

  clear() {
    if (this.canvas && this.ctx) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}

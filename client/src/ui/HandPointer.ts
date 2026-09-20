import { cameraToScreenCoordinates, type CameraSpace, type CameraFrameSize } from '../tracking/cameraToScreenCoordinates';

export type PointerVisualState = 'TRACKING' | 'HOVER' | 'PRESS' | 'GRAB' | 'WEAK' | 'LOST';

export const POINTER_HOLD_MS = 150;
export const POINTER_FADE_MS = 350;

export type StageRect = { left: number; top: number; width: number; height: number };

export function mapIndexTipToScreen(
  nx: number,
  ny: number,
  options: {
    space?: CameraSpace;
    mirror?: boolean;
    video?: CameraFrameSize;
    stage?: CameraFrameSize;
    stageRect?: StageRect;
  } = {}
) {
  const rect = options.stageRect;
  const stage = options.stage ?? (rect ? { width: rect.width, height: rect.height } : undefined);
  const p = cameraToScreenCoordinates(nx, ny, {
    space: options.space,
    mirror: options.mirror,
    video: options.video,
    stage,
  });
  const left = rect?.left ?? 0;
  const top = rect?.top ?? 0;
  const width = rect?.width ?? stage?.width ?? 1;
  const height = rect?.height ?? stage?.height ?? 1;
  return { x: p.x, y: p.y, screenX: left + p.x * width, screenY: top + p.y * height };
}

export class HandPointer {
  readonly element: HTMLElement;
  private dot: HTMLElement;
  private ring: HTMLElement;
  private label: HTMLElement;
  private stage: HTMLElement | null;
  private rect: StageRect = { left: 0, top: 0, width: 1, height: 1 };
  private targetX = 0;
  private targetY = 0;
  private currentX = 0;
  private currentY = 0;
  private lastTargetTime = -Infinity;
  private lastTick = 0;
  private hasTarget = false;
  private interaction: Exclude<PointerVisualState, 'WEAK' | 'LOST'> = 'TRACKING';
  private raf = 0;
  private autoLoop: boolean;
  visible = false;
  state: PointerVisualState = 'LOST';
  opacity = 0;
  x = 0;
  y = 0;

  constructor(stage?: HTMLElement | null, options: { autoLoop?: boolean } = {}) {
    this.stage = stage ?? (typeof document !== 'undefined' ? document.getElementById('app-container') : null);
    this.autoLoop = options.autoLoop !== false && typeof requestAnimationFrame === 'function';
    this.element = (typeof document !== 'undefined' && document.getElementById?.('hand-pointer')) || document.createElement('div');
    this.element.id = 'hand-pointer';
    const existing = (sel: string) => (this.element.querySelector?.(sel) as HTMLElement | null) ?? null;
    this.dot = existing('.hand-pointer-dot') || document.createElement('div');
    this.dot.className = 'hand-pointer-dot';
    this.ring = existing('.hand-pointer-ring') || document.createElement('div');
    this.ring.className = 'hand-pointer-ring';
    this.label = existing('.hand-pointer-state') || document.createElement('div');
    this.label.className = 'hand-pointer-state';
    if (!this.ring.parentNode) this.element.appendChild(this.ring);
    if (!this.dot.parentNode) this.element.appendChild(this.dot);
    if (!this.label.parentNode) this.element.appendChild(this.label);
    if (!this.element.parentNode) document.body.appendChild(this.element);
    this.refreshRect();
    this.applyDom();
    if (this.autoLoop) this.loop();
  }

  private loop = () => {
    this.raf = requestAnimationFrame(now => {
      this.tick(now);
      if (this.autoLoop) this.loop();
    });
  };

  refreshRect() {
    const r = this.stage?.getBoundingClientRect?.();
    this.rect = r
      ? { left: r.left, top: r.top, width: r.width || 1, height: r.height || 1 }
      : { left: 0, top: 0, width: globalThis.innerWidth || 1, height: globalThis.innerHeight || 1 };
    return this.rect;
  }

  mapFromCamera(nx: number, ny: number, frame: { space?: CameraSpace; video?: CameraFrameSize } = {}) {
    this.refreshRect();
    return mapIndexTipToScreen(nx, ny, { space: frame.space, video: frame.video, stageRect: this.rect });
  }

  setTarget(screenX: number, screenY: number, timestamp: number) {
    if (!this.hasTarget || this.state === 'LOST') {
      this.currentX = screenX;
      this.currentY = screenY;
    }
    this.targetX = screenX;
    this.targetY = screenY;
    this.lastTargetTime = timestamp;
    this.hasTarget = true;
    this.visible = true;
    this.opacity = 1;
    if (this.state === 'LOST' || this.state === 'WEAK') this.state = this.interaction;
    this.x = this.currentX;
    this.y = this.currentY;
    this.applyDom();
  }

  setInteractionState(state: Exclude<PointerVisualState, 'WEAK' | 'LOST'>) {
    this.interaction = state;
    if (this.state !== 'LOST' && this.state !== 'WEAK') this.state = state;
  }

  hide() {
    this.hasTarget = false;
    this.state = 'LOST';
    this.visible = false;
    this.opacity = 0;
    this.applyDom();
  }

  tick(now: number, dtMs?: number) {
    const dt = Math.max(1, dtMs ?? (this.lastTick ? Math.min(33, now - this.lastTick) : 16));
    this.lastTick = now;
    const age = now - this.lastTargetTime;
    if (!this.hasTarget || age > POINTER_FADE_MS) {
      this.state = 'LOST';
      this.opacity = 0;
      this.visible = false;
      this.applyDom();
      return;
    }
    if (age > POINTER_HOLD_MS) {
      this.state = 'WEAK';
      this.opacity = 1 - (age - POINTER_HOLD_MS) / (POINTER_FADE_MS - POINTER_HOLD_MS);
      this.visible = this.opacity > 0.02;
    } else {
      this.state = this.interaction;
      this.opacity = 1;
      this.visible = true;
    }

    const dx = this.targetX - this.currentX;
    const dy = this.targetY - this.currentY;
    const dist = Math.hypot(dx, dy);
    const speed = dist / dt;
    const t = Math.min(1, Math.max(0, (speed - 0.45) / 14));
    let factor = 0.18 + t * (0.72 - 0.18);
    if (speed < 1) factor = Math.min(factor, 0.25);
    if (speed > 8) factor = Math.max(factor, 0.5);
    factor = Math.min(0.72, Math.max(0.18, factor));
    this.currentX += dx * factor;
    this.currentY += dy * factor;
    this.x = this.currentX;
    this.y = this.currentY;
    this.applyDom();
  }

  private applyDom() {
    this.element.style.opacity = String(this.visible ? this.opacity : 0);
    this.element.style.transform = `translate3d(${this.currentX}px,${this.currentY}px,0) translate(-50%,-50%)`;
    this.element.className = `state-${this.state.toLowerCase()}${this.visible ? ' is-visible' : ''}`;
    this.label.textContent = this.visible ? this.state : '';
  }

  dispose() {
    this.autoLoop = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.element.remove();
  }
}

export type CameraState =
  | 'CAMERA_REQUEST'
  | 'CAMERA_LOADING'
  | 'CAMERA_READY'
  | 'CAMERA_DENIED'
  | 'CAMERA_ERROR';

export class CameraStateOverlay {
  private container: HTMLDivElement;
  private card: HTMLDivElement;
  private iconEl: HTMLDivElement;
  private titleEl: HTMLDivElement;
  private subtitleEl: HTMLDivElement;
  private actionsEl: HTMLDivElement;
  private statusBadge: HTMLDivElement;
  private state: CameraState = 'CAMERA_REQUEST';
  private onSwitchToTouch?: () => void;
  private onRetry?: () => void;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'camera-state-overlay';
    this.container.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 5500;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(2, 8, 16, 0.85);
      backdrop-filter: blur(10px);
      transition: opacity 0.4s ease, visibility 0.4s ease;
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
      font-family: 'IBM Plex Mono', Consolas, monospace;
      color: #cee1ec;
    `;

    this.card = document.createElement('div');
    this.card.style.cssText = `
      width: min(480px, 92%);
      padding: 36px 32px;
      background: linear-gradient(135deg, rgba(16, 35, 52, 0.95), rgba(5, 14, 24, 0.98));
      border: 1px solid rgba(118, 154, 179, 0.45);
      box-shadow: 0 25px 80px rgba(0, 0, 0, 0.7), inset 0 0 30px rgba(0, 255, 255, 0.04);
      border-radius: 4px;
      position: relative;
      text-align: center;
    `;

    this.statusBadge = document.createElement('div');
    this.statusBadge.style.cssText = `
      font-size: 8px;
      letter-spacing: 3px;
      color: #769db4;
      margin-bottom: 16px;
      text-transform: uppercase;
    `;

    this.iconEl = document.createElement('div');
    this.iconEl.style.cssText = `
      font-size: 40px;
      margin-bottom: 16px;
      line-height: 1;
      filter: drop-shadow(0 0 12px rgba(0, 255, 255, 0.5));
    `;

    this.titleEl = document.createElement('h2');
    this.titleEl.style.cssText = `
      font-family: 'Barlow Condensed', sans-serif;
      font-size: 26px;
      letter-spacing: 1.5px;
      font-weight: 500;
      color: #d3e3ed;
      margin-bottom: 10px;
    `;

    this.subtitleEl = document.createElement('p');
    this.subtitleEl.style.cssText = `
      font-size: 11px;
      line-height: 1.7;
      color: #8aa0b1;
      margin-bottom: 24px;
    `;

    this.actionsEl = document.createElement('div');
    this.actionsEl.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 10px;
      align-items: center;
    `;

    this.card.appendChild(this.statusBadge);
    this.card.appendChild(this.iconEl);
    this.card.appendChild(this.titleEl);
    this.card.appendChild(this.subtitleEl);
    this.card.appendChild(this.actionsEl);
    this.container.appendChild(this.card);
    document.body.appendChild(this.container);
  }

  public setCallbacks(onSwitchToTouch: () => void, onRetry: () => void) {
    this.onSwitchToTouch = onSwitchToTouch;
    this.onRetry = onRetry;
  }

  public setState(state: CameraState, customDetails?: string) {
    this.state = state;
    this.actionsEl.innerHTML = '';

    switch (state) {
      case 'CAMERA_REQUEST':
        this.statusBadge.textContent = 'PERMISSION REQUIRED';
        this.iconEl.textContent = '📷';
        this.iconEl.style.color = '#00ffff';
        this.titleEl.textContent = 'Allow Camera Access';
        this.subtitleEl.textContent = customDetails ||
          'ORBIT needs your camera for 3D hand tracking in space. Processing happens 100% locally on your device — video is never transmitted or recorded.';
        this.show();
        break;

      case 'CAMERA_LOADING':
        this.statusBadge.textContent = 'VISION ENGINE';
        this.iconEl.textContent = '⏳';
        this.iconEl.style.color = '#76c4e8';
        this.titleEl.textContent = 'Initializing Vision System';
        this.subtitleEl.textContent = customDetails || 'Starting camera stream and loading neural hand detector...';
        this.show();
        break;

      case 'CAMERA_READY':
        this.statusBadge.textContent = 'VISION ONLINE';
        this.iconEl.textContent = '✋';
        this.iconEl.style.color = '#00ff88';
        this.titleEl.textContent = 'Camera Ready';
        this.subtitleEl.textContent = customDetails || 'Show your hand to the camera. A quick Aim & Pop practice starts next.';
        this.show();
        setTimeout(() => {
          if (this.state === 'CAMERA_READY') {
            this.hide();
          }
        }, 2200);
        break;

      case 'CAMERA_DENIED':
        this.statusBadge.textContent = 'CAMERA BLOCKED';
        this.iconEl.textContent = '🚫';
        this.iconEl.style.color = '#ff6b6b';
        this.titleEl.textContent = 'Camera Permission Blocked';
        this.subtitleEl.textContent =
          'Your browser denied camera permission. To enable hand tracking, click the lock or camera icon in your address bar and allow camera access, or continue with mouse & touch.';
        this.addFallbackButtons();
        this.show();
        break;

      case 'CAMERA_ERROR':
        this.statusBadge.textContent = 'CAMERA UNAVAILABLE';
        this.iconEl.textContent = '⚠️';
        this.iconEl.style.color = '#ffb347';
        this.titleEl.textContent = 'Webcam Not Accessible';
        this.subtitleEl.textContent = customDetails ||
          'The camera could not be opened. It may be in use by another program (e.g. Zoom or Teams) or disconnected. You can retry or switch to mouse & touch.';
        this.addFallbackButtons();
        this.show();
        break;
    }
  }

  private addFallbackButtons() {
    const btnTouch = document.createElement('button');
    btnTouch.textContent = 'SWITCH TO MOUSE & TOUCH';
    btnTouch.style.cssText = `
      width: 100%;
      padding: 12px 18px;
      font-family: inherit;
      font-size: 10px;
      letter-spacing: 1.5px;
      background: #19354d;
      border: 1px solid #769db4;
      color: #cee1ec;
      cursor: pointer;
      border-radius: 2px;
      transition: background 0.2s;
    `;
    btnTouch.onmouseover = () => { btnTouch.style.background = '#254b6d'; };
    btnTouch.onmouseout = () => { btnTouch.style.background = '#19354d'; };
    btnTouch.onclick = () => {
      this.hide();
      this.onSwitchToTouch?.();
    };

    const btnRetry = document.createElement('button');
    btnRetry.textContent = 'RETRY CAMERA';
    btnRetry.style.cssText = `
      width: 100%;
      padding: 10px 18px;
      font-family: inherit;
      font-size: 9px;
      letter-spacing: 1.2px;
      background: transparent;
      border: 1px solid rgba(118, 154, 179, 0.4);
      color: #8aa0b1;
      cursor: pointer;
      border-radius: 2px;
    `;
    btnRetry.onclick = () => {
      this.onRetry?.();
    };

    this.actionsEl.appendChild(btnTouch);
    this.actionsEl.appendChild(btnRetry);
  }

  public show() {
    this.container.style.opacity = '1';
    this.container.style.visibility = 'visible';
    this.container.style.pointerEvents = 'auto';
  }

  public hide() {
    this.container.style.opacity = '0';
    this.container.style.visibility = 'hidden';
    this.container.style.pointerEvents = 'none';
  }
}

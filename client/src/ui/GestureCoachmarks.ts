export class GestureCoachmarks {
  private container: HTMLDivElement;
  private iconEl: HTMLSpanElement;
  private textEl: HTMLSpanElement;
  private currentTip: string = '';
  private timer: any = null;
  private completedSteps: Set<string> = new Set();
  private isEdgeWarning: boolean = false;
  private isLightingWarning: boolean = false;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'gesture-coachmarks';
    this.container.style.cssText = `
      position: fixed;
      bottom: 96px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 20px;
      background: rgba(8, 24, 38, 0.88);
      border: 1px solid rgba(120, 200, 240, 0.4);
      border-radius: 24px;
      color: #cee1ec;
      font-family: 'IBM Plex Mono', Consolas, monospace;
      font-size: 11px;
      letter-spacing: 1.2px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), inset 0 0 16px rgba(0, 255, 255, 0.08);
      backdrop-filter: blur(8px);
      z-index: 450;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.4s ease, transform 0.4s ease;
      white-space: nowrap;
    `;

    this.iconEl = document.createElement('span');
    this.iconEl.style.cssText = 'font-size: 16px; filter: drop-shadow(0 0 6px rgba(0, 255, 255, 0.6));';

    this.textEl = document.createElement('span');
    this.textEl.style.cssText = 'font-weight: 500;';

    this.container.appendChild(this.iconEl);
    this.container.appendChild(this.textEl);
    document.body.appendChild(this.container);

    const saved = localStorage.getItem('orbit_onboarded_steps');
    if (saved) {
      try {
        const arr = JSON.parse(saved);
        if (Array.isArray(arr)) this.completedSteps = new Set(arr);
      } catch {}
    }
  }

  public showTip(key: string, icon: string, text: string, durationMs: number = 5000, force: boolean = false) {
    if (!force && this.completedSteps.has(key)) return;
    if (this.currentTip === key && this.container.style.opacity === '1') return;

    this.currentTip = key;
    this.iconEl.textContent = icon;
    this.textEl.textContent = text;
    this.container.style.borderColor = 'rgba(120, 200, 240, 0.4)';
    this.container.style.background = 'rgba(8, 24, 38, 0.88)';
    this.container.style.opacity = '1';
    this.container.style.transform = 'translateX(-50%) translateY(0)';

    clearTimeout(this.timer);
    if (durationMs > 0) {
      this.timer = setTimeout(() => {
        this.hide();
      }, durationMs);
    }
  }

  public completeTip(key: string) {
    if (this.completedSteps.has(key)) return;
    this.completedSteps.add(key);
    try {
      localStorage.setItem('orbit_onboarded_steps', JSON.stringify([...this.completedSteps]));
    } catch {}

    if (this.currentTip === key) {
      this.hide();
    }
  }

  public showEdgeWarning(show: boolean) {
    if (show) {
      this.isEdgeWarning = true;
      this.iconEl.textContent = '⚠️';
      this.textEl.textContent = 'MOVE HAND TOWARDS CENTER';
      this.container.style.borderColor = 'rgba(255, 179, 71, 0.7)';
      this.container.style.background = 'rgba(40, 25, 10, 0.92)';
      this.container.style.opacity = '1';
    } else if (this.isEdgeWarning) {
      this.isEdgeWarning = false;
      this.hide();
    }
  }

  public showLightingWarning(show: boolean) {
    if (show) {
      if (this.isEdgeWarning) return;
      this.isLightingWarning = true;
      this.iconEl.textContent = '💡';
      this.textEl.textContent = 'IMPROVE LIGHTING FOR BETTER TRACKING';
      this.container.style.borderColor = 'rgba(255, 200, 100, 0.6)';
      this.container.style.opacity = '1';
    } else if (this.isLightingWarning) {
      this.isLightingWarning = false;
      this.hide();
    }
  }

  public hide() {
    this.container.style.opacity = '0';
    this.container.style.transform = 'translateX(-50%) translateY(8px)';
    this.currentTip = '';
  }
}

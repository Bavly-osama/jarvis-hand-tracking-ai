import { GestureData } from '../gestures/GestureRecognizer';

interface CalibrationResult {
  handSizeBaseline: number;
  movementRange:    number;
  pinchThreshold:   number;
}

/**
 * Brief 3-step calibration screen shown on first launch.
 * Detects hand size, movement range, and pinch — stores results for
 * dynamic threshold scaling.
 */
export class CalibrationScreen {
  private container:   HTMLDivElement;
  private messageEl:   HTMLDivElement;
  private progressEl:  HTMLDivElement;
  private stepDots:    HTMLDivElement[] = [];

  private step: number = 0;
  private onCompleteCallback: (() => void) | null = null;

  // Calibration measurements
  private handSizeSamples: number[] = [];
  private swipeDetected:   boolean = false;
  private pinchDetected:   boolean = false;

  public result: CalibrationResult = {
    handSizeBaseline: 0.15,  // default normalised hand size
    movementRange:    1.0,
    pinchThreshold:   0.18,
  };

  constructor() {
    this.container = document.createElement('div');
    Object.assign(this.container.style, {
      position:        'fixed',
      top:             '0', left: '0',
      width:           '100%', height: '100%',
      backgroundColor: 'rgba(0, 6, 16, 0.92)',
      display:         'flex',
      flexDirection:   'column',
      justifyContent:  'center',
      alignItems:      'center',
      zIndex:          '2000',
      color:           '#00ffff',
      fontFamily:      '"Courier New", Courier, monospace',
      backdropFilter:  'blur(4px)',
    });

    // Title
    const title = document.createElement('div');
    title.textContent = '[ HOLOGRAPHIC INTERFACE ]';
    Object.assign(title.style, {
      fontSize:     '13px',
      letterSpacing:'6px',
      color:        'rgba(0,255,255,0.5)',
      marginBottom: '32px',
    });
    this.container.appendChild(title);

    // Animated ring
    const ring = document.createElement('div');
    Object.assign(ring.style, {
      width:        '80px',
      height:       '80px',
      border:       '2px solid rgba(0,255,255,0.4)',
      borderRadius: '50%',
      marginBottom: '28px',
      position:     'relative',
      animation:    'pulse-ring 1.5s ease-in-out infinite',
    });
    this.container.appendChild(ring);

    // Inject keyframes
    const style = document.createElement('style');
    style.textContent = `
      @keyframes pulse-ring {
        0%   { box-shadow: 0 0 0 0 rgba(0,255,255,0.4); transform: scale(1); }
        50%  { box-shadow: 0 0 0 16px rgba(0,255,255,0); transform: scale(1.05); }
        100% { box-shadow: 0 0 0 0 rgba(0,255,255,0); transform: scale(1); }
      }
      @keyframes fade-in {
        from { opacity: 0; transform: translateY(8px); }
        to   { opacity: 1; transform: translateY(0); }
      }
    `;
    document.head.appendChild(style);

    // Main message
    this.messageEl = document.createElement('div');
    Object.assign(this.messageEl.style, {
      fontSize:    '20px',
      fontWeight:  'bold',
      textAlign:   'center',
      marginBottom:'12px',
      maxWidth:    '420px',
      lineHeight:  '1.5',
      animation:   'fade-in 0.4s ease-out',
    });
    this.container.appendChild(this.messageEl);

    // Sub-message
    const sub = document.createElement('div');
    sub.textContent = 'Position your hand clearly in front of the camera';
    Object.assign(sub.style, {
      fontSize:    '12px',
      color:       'rgba(0,255,136,0.6)',
      marginBottom:'32px',
    });
    this.container.appendChild(sub);

    // Step dots
    this.progressEl = document.createElement('div');
    Object.assign(this.progressEl.style, {
      display: 'flex', gap: '10px',
    });
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('div');
      Object.assign(dot.style, {
        width:        '8px',
        height:       '8px',
        borderRadius: '50%',
        backgroundColor: 'rgba(0,255,255,0.25)',
        transition:   'background-color 0.3s ease',
      });
      this.stepDots.push(dot);
      this.progressEl.appendChild(dot);
    }
    this.container.appendChild(this.progressEl);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  public show() {
    document.body.appendChild(this.container);
    this._goToStep(1);
  }

  public hide() {
    this.container.style.opacity = '0';
    this.container.style.transition = 'opacity 0.6s ease';
    setTimeout(() => {
      if (this.container.parentElement) {
        this.container.parentElement.removeChild(this.container);
      }
    }, 650);
  }

  public onComplete(cb: () => void) {
    this.onCompleteCallback = cb;
  }

  /**
   * Feed gesture data each tracking frame to drive calibration steps.
   */
  public updateCalibration(data: GestureData) {
    switch (this.step) {
      case 1:
        // Collect hand size samples while hand is open
        if (data.isOpen && data.handSize > 0) {
          this.handSizeSamples.push(data.handSize);
          if (this.handSizeSamples.length >= 15) {
            const avg = this.handSizeSamples.reduce((a, b) => a + b, 0) / this.handSizeSamples.length;
            this.result.handSizeBaseline = avg;
            this._goToStep(2);
          }
        }
        break;

      case 2:
        if (!this.swipeDetected && Math.abs(data.swipeVelocityX) > 0.4) {
          this.swipeDetected = true;
          // Scale threshold based on observed range
          this.result.movementRange = Math.max(0.5, Math.abs(data.swipeVelocityX));
          this._goToStep(3);
        }
        break;

      case 3:
        if (!this.pinchDetected && data.pinchDistance < 0.15) {
          this.pinchDetected = true;
          // Calibrate pinch threshold to hand size
          this.result.pinchThreshold = data.pinchDistance * 1.3;
          this._complete();
        }
        break;
    }
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private _goToStep(n: number) {
    this.step = n;
    this.stepDots.forEach((d, i) => {
      d.style.backgroundColor = i < n
        ? '#00ffff'
        : 'rgba(0,255,255,0.25)';
    });

    const messages: Record<number, string> = {
      1: '✋ Open your hand flat\nin front of the camera',
      2: '↔ Slowly swipe your\nhand left and right',
      3: '🤌 Pinch your thumb\nand index finger together',
    };
    this.messageEl.style.animation = 'none';
    // Force reflow to re-trigger animation
    void this.messageEl.offsetWidth;
    this.messageEl.style.animation = 'fade-in 0.4s ease-out';
    this.messageEl.innerText = messages[n] ?? '';
  }

  private _complete() {
    this.step = 4;
    this.messageEl.innerText = '✓ Calibration Complete';
    this.messageEl.style.color = '#00ff88';
    this.stepDots.forEach(d => { d.style.backgroundColor = '#00ff88'; });
    if (this.onCompleteCallback) this.onCompleteCallback();
    setTimeout(() => this.hide(), 1200);
  }
}

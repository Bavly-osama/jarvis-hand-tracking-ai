/**
 * Debug overlay — toggled with backtick (`) key.
 * Shows gesture state, confidence, velocity, FPS, WebSocket status, and AI intent telemetry.
 */
export class DebugOverlay {
  private container: HTMLDivElement;
  private fields: Record<string, HTMLDivElement> = {};
  private visible: boolean = false;

  private readonly FIELD_DEFS: { key: string; label: string }[] = [
    { key: 'fps',         label: '⚡ Render FPS' },
    { key: 'trackingFps', label: '📷 Track FPS' },
    { key: 'hand',        label: '🖐 Hand' },
    { key: 'gesture',     label: '✋ Local Gesture' },
    { key: 'confidence',  label: '📊 Local Conf' },
    { key: 'velocity',    label: '💨 Velocity X' },
    { key: 'pinch',       label: '🤌 Pinch Dist' },
    { key: 'activeCard',  label: '🎴 Active Object' },
    { key: 'socket',      label: '🌐 Socket' },
    { key: 'zoom',        label: '🔍 Zoom Scale' },
    { key: 'aiIntent',    label: '🤖 AI Intent' },
    { key: 'aiConf',      label: '🧠 AI Conf' },
    { key: 'latency',     label: '⏱ AI Latency' },
    { key: 'final',       label: '🎯 Final Action' },
  ];

  constructor() {
    this.container = document.createElement('div');
    Object.assign(this.container.style, {
      position:        'fixed',
      top:             '12px',
      left:            '12px',
      backgroundColor: 'rgba(0, 8, 16, 0.88)',
      color:           '#00ff88',
      padding:         '14px 18px',
      fontFamily:      '"Courier New", Courier, monospace',
      fontSize:        '11px',
      lineHeight:      '1.7',
      pointerEvents:   'none',
      zIndex:          '9999',
      border:          '1px solid rgba(0, 255, 136, 0.35)',
      borderRadius:    '4px',
      backdropFilter:  'blur(8px)',
      display:         'none',
      minWidth:        '220px',
    });

    const header = document.createElement('div');
    header.textContent = '[ SPATIAL AI TELEMETRY ]';
    Object.assign(header.style, {
      color:        '#00ffff',
      fontWeight:   'bold',
      marginBottom: '8px',
      borderBottom: '1px solid rgba(0,255,255,0.3)',
      paddingBottom:'4px',
    });
    this.container.appendChild(header);

    for (const def of this.FIELD_DEFS) {
      const row = document.createElement('div');
      row.textContent = `${def.label}: —`;
      this.fields[def.key] = row;
      this.container.appendChild(row);
    }

    const hint = document.createElement('div');
    hint.textContent = '[ ` ] toggle debug';
    Object.assign(hint.style, {
      marginTop:  '8px',
      color:      'rgba(0,255,136,0.4)',
      fontSize:   '10px',
    });
    this.container.appendChild(hint);

    document.body.appendChild(this.container);

    window.addEventListener('keydown', (e) => {
      if (e.key === '`' || e.key === '~') {
        this.visible = !this.visible;
        this.container.style.display = this.visible ? 'block' : 'none';
      }
    });
  }

  public update(key: string, value: string | number): void {
    const def = this.FIELD_DEFS.find(d => d.key === key);
    const el  = this.fields[key];
    if (!el || !def) return;
    el.textContent = `${def.label}: ${value}`;

    if (key === 'confidence' || key === 'aiConf') {
      const v = parseFloat(value as string);
      el.style.color = v >= 0.82 ? '#00ff88' : v >= 0.6 ? '#ffcc00' : '#ff4444';
    }

    if (key === 'socket') {
      el.style.color = (value === 'connected') ? '#00ff88' : '#ff4444';
    }

    if (key === 'final') {
      el.style.color = value !== 'NONE' && value !== 'IDLE' ? '#00ffff' : '#888888';
      el.style.fontWeight = 'bold';
    }
  }
}

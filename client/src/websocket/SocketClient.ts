import { io, Socket } from 'socket.io-client';
import { CONSTANTS } from '../config/constants';

// ─── Event shapes ───────────────────────────────────────────────────────────

export interface GestureEventPayload {
  type:       string;
  gesture:    string;
  confidence: number;
  velocity:   number;
  hand:       string;
  duration:   number;
  timestamp:  number;
}

export interface AIRequestPayload {
  requestId?:        string;
  gestureId?:        string;
  stateVersion?:     number;
  recentGestures:    string[];
  activeObject:      string;
  uiState:           string;
  gestureConfidence: number;
  hand:              string;
  semanticFeatures?: any;
  target?:           any;
  timestamp?:        number;
}

export interface AIResponsePayload {
  requestId?:   string;
  stateVersion?: number;
  intent:       string;
  confidence:   number;
  reason:       string;
  latencyMs?:   number;
  target?:      string;
  source?:      string;
}

type AIResponseCallback = (data: AIResponsePayload) => void;
type AITimeoutCallback = (data: { requestId?: string; stateVersion?: number }) => void;

// ─── Rate limiter ────────────────────────────────────────────────────────────

class RateLimiter {
  private count: number = 0;
  private windowStart: number = Date.now();
  constructor(private readonly maxPerSecond: number) {}

  public allow(): boolean {
    const now = Date.now();
    if (now - this.windowStart > 1000) {
      this.count       = 0;
      this.windowStart = now;
    }
    if (this.count >= this.maxPerSecond) return false;
    this.count++;
    return true;
  }
}

// ─── SocketClient ────────────────────────────────────────────────────────────

export class SocketClient {
  private socket: Socket;
  private queue: { event: string; data: unknown }[] = [];
  private connected_: boolean = false;
  private sessionId: string | null = null;

  // Rate limit: max 80 gesture events/sec to backend
  private gestureLimiter = new RateLimiter(80);

  // AI response callback
  private aiResponseCallback: AIResponseCallback | null = null;

  constructor() {
    this.socket = io(CONSTANTS.SOCKET.URL, {
      reconnectionDelay:    CONSTANTS.SOCKET.RECONNECT_DELAY,
      reconnectionDelayMax: 8000,
      autoConnect:          false,
      transports:           ['websocket'],
    });

    this._setupListeners();
  }

  private _setupListeners() {
    this.socket.on('connect', () => {
      this.connected_ = true;
      this.socket.emit('session:start', {
        deviceType: navigator.userAgent,
      });
      this._flushQueue();
    });

    this.socket.on('session:ack', (data: { sessionId: string }) => {
      this.sessionId = data.sessionId;
    });

    this.socket.on('ai:response', (data: AIResponsePayload) => {
      if (this.aiResponseCallback) this.aiResponseCallback(data);
    });

    this.socket.on('ai:intent-result', (data: AIResponsePayload) => {
      if (this.aiResponseCallback) this.aiResponseCallback(data);
    });

    this.socket.on('ai:timeout', (data: { requestId?: string }) => {
      if (this.aiResponseCallback) {
        this.aiResponseCallback({
          requestId: data.requestId,
          intent: 'NONE',
          confidence: 0,
          reason: 'Timeout',
          source: 'fallback'
        });
      }
    });

    this.socket.on('ai:error', (data: { requestId?: string; error: string }) => {
      console.warn('[SocketClient] AI error:', data.error);
    });

    this.socket.on('ai:ignored', (data: { requestId?: string; reason: string }) => {
      console.debug('[SocketClient] AI intent ignored:', data.reason);
    });

    this.socket.on('config:update', (config: unknown) => {
      // Config updates from server — can expose via event emitter if needed
      console.debug('[SocketClient] config:update', config);
    });

    this.socket.on('system:status', (status: unknown) => {
      console.debug('[SocketClient] system:status', status);
    });

    this.socket.on('system:error', (err: { code: string; message: string }) => {
      console.warn('[SocketClient] system:error', err.code, err.message);
    });

    this.socket.on('disconnect', (reason) => {
      this.connected_ = false;
      console.debug('[SocketClient] disconnected', reason);
    });

    this.socket.on('reconnect', (attempt) => {
      console.debug('[SocketClient] reconnected after', attempt, 'attempts');
    });
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  public connect() {
    this.socket.connect();
  }

  public disconnect() {
    if (this.connected_) {
      this.socket.emit('session:end', { sessionId: this.sessionId });
    }
    this.socket.disconnect();
  }

  public isConnected(): boolean {
    return this.connected_;
  }

  public getSessionId(): string | null {
    return this.sessionId;
  }

  public sendGestureEvent(payload: GestureEventPayload) {
    if (!this.gestureLimiter.allow()) return;  // rate-limit

    if (this.connected_) {
      this.socket.emit('gesture:event', payload);
    } else {
      // Queue only the last 20 gesture events (don't flood on reconnect)
      if (this.queue.length < 20) {
        this.queue.push({ event: 'gesture:event', data: payload });
      }
    }
  }

  public requestAIIntent(payload: AIRequestPayload) {
    if (this.connected_) {
      this.socket.emit('ai:intent-request', payload);
      return;
    }
    // REST fallback when Socket.IO is unavailable (e.g. Vercel serverless)
    void this._requestAIIntentRest(payload);
  }

  private async _requestAIIntentRest(payload: AIRequestPayload) {
    try {
      const res = await fetch('/api/ai/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        console.warn('[SocketClient] REST AI intent HTTP', res.status);
        return;
      }
      const data = (await res.json()) as AIResponsePayload;
      this.aiResponseCallback?.({
        ...data,
        requestId: data.requestId ?? payload.requestId,
        stateVersion: data.stateVersion ?? payload.stateVersion,
      });
    } catch (err) {
      console.warn('[SocketClient] REST AI intent failed', err);
    }
  }

  public onAIResponse(callback: AIResponseCallback) {
    this.aiResponseCallback = callback;
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private _flushQueue() {
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (item) this.socket.emit(item.event, item.data);
    }
  }
}

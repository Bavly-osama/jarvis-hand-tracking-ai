import { AIIntentRequest, AIIntentResponse } from './AIIntentSchema';
import { aiConfig } from '../config/ai.config';

export interface AIMetrics {
  totalRequests: number;
  aiCalls: number;
  cachedHits: number;
  rateLimited: number;
  timeouts: number;
  errors: number;
  averageLatencyMs: number;
  resolvedGestures: number;
  rejectedGestures: number;
}

export class AIIntentCache {
  private inFlight = new Map<string, Promise<AIIntentResponse>>();
  private recentResults = new Map<string, { response: AIIntentResponse; expiresAt: number }>();
  private sessionRequestCounts = new Map<string, { count: number; windowStart: number }>();

  private metrics: AIMetrics = {
    totalRequests: 0,
    aiCalls: 0,
    cachedHits: 0,
    rateLimited: 0,
    timeouts: 0,
    errors: 0,
    averageLatencyMs: 0,
    resolvedGestures: 0,
    rejectedGestures: 0,
  };

  private latencies: number[] = [];

  public getInFlight(key: string): Promise<AIIntentResponse> | undefined {
    return this.inFlight.get(key);
  }

  public setInFlight(key: string, promise: Promise<AIIntentResponse>): void {
    this.inFlight.set(key, promise);
    promise.finally(() => {
      this.inFlight.delete(key);
    });
  }

  public getCached(key: string): AIIntentResponse | null {
    const cached = this.recentResults.get(key);
    if (!cached) return null;
    if (Date.now() > cached.expiresAt) {
      this.recentResults.delete(key);
      return null;
    }
    this.metrics.cachedHits++;
    return { ...cached.response, cached: true, source: 'cache' };
  }

  public setCache(key: string, response: AIIntentResponse, ttlMs: number = 600): void {
    this.recentResults.set(key, {
      response,
      expiresAt: Date.now() + ttlMs,
    });
  }

  public checkRateLimit(sessionId: string): boolean {
    const now = Date.now();
    const window = 60 * 1000;
    const sessionData = this.sessionRequestCounts.get(sessionId) || { count: 0, windowStart: now };

    if (now - sessionData.windowStart > window) {
      sessionData.count = 0;
      sessionData.windowStart = now;
    }

    sessionData.count++;
    this.sessionRequestCounts.set(sessionId, sessionData);

    if (sessionData.count > aiConfig.maxAiRequestsPerMinute) {
      this.metrics.rateLimited++;
      return false;
    }
    return true;
  }

  public recordSuccess(latencyMs: number, intent: string): void {
    this.metrics.aiCalls++;
    this.latencies.push(latencyMs);
    if (this.latencies.length > 50) this.latencies.shift();
    this.metrics.averageLatencyMs = Math.round(
      this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length
    );

    if (intent !== 'NONE') {
      this.metrics.resolvedGestures++;
    } else {
      this.metrics.rejectedGestures++;
    }
  }

  public recordTimeout(): void {
    this.metrics.timeouts++;
  }

  public recordError(): void {
    this.metrics.errors++;
  }

  public recordRequest(): void {
    this.metrics.totalRequests++;
  }

  public getMetrics(): AIMetrics {
    return { ...this.metrics };
  }
}

export const aiIntentCache = new AIIntentCache();

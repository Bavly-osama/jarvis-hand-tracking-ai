import { GoogleGenAI } from '@google/genai';
import { aiConfig } from '../config/ai.config';
import { logger } from '../utils/logger';
import {
  AIIntentRequest,
  AIIntentResponse,
  AIIntentResponseSchema,
  AllowedIntent,
} from './AIIntentSchema';
import { GEMINI_SYSTEM_INSTRUCTION, buildIntentUserPrompt } from './GeminiPrompt';
import { AICommandValidator } from './AICommandValidator';
import { aiIntentCache } from './AIIntentCache';

export class GeminiService {
  private aiClient: GoogleGenAI | null = null;
  private isConfigured: boolean = false;

  constructor() {
    this.initClient();
  }

  private initClient(): void {
    if (aiConfig.geminiApiKey) {
      try {
        this.aiClient = new GoogleGenAI({ apiKey: aiConfig.geminiApiKey });
        this.isConfigured = true;
        logger.info({ model: aiConfig.geminiModel }, 'GeminiService initialized with @google/genai SDK');
      } catch (err) {
        logger.error({ err }, 'Failed to initialize GoogleGenAI client');
        this.aiClient = null;
        this.isConfigured = false;
      }
    } else {
      logger.warn('GEMINI_API_KEY is not set. Realtime AI intent inference will return local fallback.');
      this.aiClient = null;
      this.isConfigured = false;
    }
  }

  public isAvailable(): boolean {
    return this.isConfigured && this.aiClient !== null;
  }

  public async analyzeGestureIntent(sessionId: string, context: any): Promise<AIIntentResponse> {
    return this.inferGestureIntent({
      sessionId,
      uiState: context?.uiState || 'MAIN_CAROUSEL',
      activeCard: context?.activeObject,
      hand: (context?.hand as any) || 'RIGHT',
      trackingConfidence: context?.gestureConfidence ?? 0.7,
      gesture: {
        candidate: context?.recentGestures?.[0] || 'UNKNOWN',
        confidence: context?.gestureConfidence ?? 0.6,
        velocity: { x: 0, y: 0, z: 0 },
        duration: 0
      },
      recentGestures: context?.recentGestures || [],
      timestamp: Date.now()
    });
  }

  public async inferGestureIntent(request: AIIntentRequest): Promise<AIIntentResponse> {
    aiIntentCache.recordRequest();
    const startTime = Date.now();

    const fallbackResponse: AIIntentResponse = {
      requestId: request.requestId,
      stateVersion: request.stateVersion,
      intent: 'NONE',
      confidence: 0,
      reason: 'Local fallback',
      source: 'fallback',
      latencyMs: 0,
    };

    if (!this.isAvailable() || !this.aiClient) {
      return fallbackResponse;
    }

    // Check rate limit per session
    if (!aiIntentCache.checkRateLimit(request.sessionId)) {
      logger.warn({ sessionId: request.sessionId }, 'AI intent request rate-limited (exceeded quota)');
      return {
        ...fallbackResponse,
        reason: 'Rate limit exceeded — continue locally',
      };
    }

    // Deduplication / In-flight check
    const cacheKey = `${request.sessionId}:${request.uiState}:${request.gestureId}:${request.gesture?.candidate}`;
    const inFlight = aiIntentCache.getInFlight(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const cached = aiIntentCache.getCached(cacheKey);
    if (cached) {
      return cached;
    }

    const intentPromise = this.executeIntentInference(request, startTime, cacheKey);
    aiIntentCache.setInFlight(cacheKey, intentPromise);

    return intentPromise;
  }

  private async executeIntentInference(
    request: AIIntentRequest,
    startTime: number,
    cacheKey: string
  ): Promise<AIIntentResponse> {
    const userPrompt = buildIntentUserPrompt(request);

    try {
      const apiCall = this.aiClient!.models.generateContent({
        model: aiConfig.geminiModel,
        contents: userPrompt,
        config: {
          systemInstruction: GEMINI_SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          temperature: 0.1,
          maxOutputTokens: 250,
        },
      });

      // Strict timeout (default 1200ms)
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('GEMINI_TIMEOUT')), aiConfig.geminiTimeoutMs);
      });

      const result = await Promise.race([apiCall, timeoutPromise]);
      const latencyMs = Date.now() - startTime;
      const rawText = result.text || '{}';

      let parsed: any;
      try {
        parsed = JSON.parse(rawText);
      } catch (parseError) {
        logger.warn({ rawText }, 'Failed to parse Gemini JSON output');
        aiIntentCache.recordError();
        return {
          requestId: request.requestId,
          stateVersion: request.stateVersion,
          intent: 'NONE',
          confidence: 0,
          reason: 'Malformed JSON from model',
          source: 'gemini',
          latencyMs,
        };
      }

      const validated = AIIntentResponseSchema.safeParse({
        requestId: request.requestId,
        stateVersion: request.stateVersion,
        intent: parsed.intent || 'NONE',
        confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5,
        target: parsed.target || request.target?.id,
        parameters: parsed.parameters || {},
        reason: parsed.reason || 'AI intent classification',
        latencyMs,
        source: 'gemini',
      });

      if (!validated.success) {
        logger.warn({ errors: validated.error.errors, parsed }, 'Gemini response failed Zod schema validation');
        aiIntentCache.recordError();
        return {
          requestId: request.requestId,
          stateVersion: request.stateVersion,
          intent: 'NONE',
          confidence: 0,
          reason: 'Schema validation failure',
          source: 'gemini',
          latencyMs,
        };
      }

      // Enforce context-state command validation (reject hallucinations)
      const contextualResponse = AICommandValidator.validate(
        request.uiState,
        request.activeModule,
        validated.data
      );

      aiIntentCache.recordSuccess(latencyMs, contextualResponse.intent);
      aiIntentCache.setCache(cacheKey, contextualResponse);

      return contextualResponse;
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      if (err.message === 'GEMINI_TIMEOUT') {
        logger.warn({ latencyMs, timeout: aiConfig.geminiTimeoutMs }, 'Gemini request timed out');
        aiIntentCache.recordTimeout();
        return {
          requestId: request.requestId,
          stateVersion: request.stateVersion,
          intent: 'NONE',
          confidence: 0,
          reason: 'Timeout',
          source: 'fallback',
          latencyMs,
        };
      }

      logger.error({ err: err.message || err, latencyMs }, 'Gemini API call failed');
      aiIntentCache.recordError();
      return {
        requestId: request.requestId,
        stateVersion: request.stateVersion,
        intent: 'NONE',
        confidence: 0,
        reason: 'API error',
        source: 'fallback',
        latencyMs,
      };
    }
  }

  public async interpretCommand(commandText: string, context?: any): Promise<AIIntentResponse> {
    if (!this.isAvailable() || !this.aiClient) {
      return {
        intent: 'NONE',
        confidence: 0,
        reason: 'AI service unavailable',
        source: 'fallback',
      };
    }

    const start = Date.now();
    try {
      const prompt = `Classify this natural language spatial command: "${commandText}". Context: ${JSON.stringify(context || {})}. Respond with valid JSON matching { "intent": AllowedIntent, "confidence": number, "reason": string }.`;

      const response = await this.aiClient.models.generateContent({
        model: aiConfig.geminiModel,
        contents: prompt,
        config: {
          systemInstruction: GEMINI_SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      });

      const latencyMs = Date.now() - start;
      const parsed = JSON.parse(response.text || '{}');

      const validated = AIIntentResponseSchema.safeParse({
        intent: parsed.intent || 'NONE',
        confidence: parsed.confidence || 0.7,
        reason: parsed.reason || 'Command interpretation',
        source: 'gemini',
        latencyMs,
      });

      return validated.success
        ? validated.data
        : { intent: 'NONE', confidence: 0, reason: 'Parse failure', source: 'fallback', latencyMs };
    } catch (err: any) {
      return {
        intent: 'NONE',
        confidence: 0,
        reason: err.message || 'Error',
        source: 'fallback',
        latencyMs: Date.now() - start,
      };
    }
  }

  public async healthCheck(): Promise<{ ok: boolean; model: string; latencyMs: number }> {
    if (!this.isAvailable() || !this.aiClient) {
      return { ok: false, model: aiConfig.geminiModel, latencyMs: 0 };
    }

    const start = Date.now();
    try {
      const resp = await this.aiClient.models.generateContent({
        model: aiConfig.geminiModel,
        contents: 'Respond with JSON: {"status":"ok"}',
        config: {
          responseMimeType: 'application/json',
          maxOutputTokens: 30,
        },
      });
      const latencyMs = Date.now() - start;
      const ok = (resp.text || '').includes('ok');
      return { ok, model: aiConfig.geminiModel, latencyMs };
    } catch (err) {
      return { ok: false, model: aiConfig.geminiModel, latencyMs: Date.now() - start };
    }
  }
}

export const geminiService = new GeminiService();

import { aiConfig } from '../config/ai.config';
import { AIIntentRequest, AIIntentResponse } from '../ai/AIIntentSchema';
import { geminiService } from '../ai/GeminiService';
import { logger } from '../utils/logger';

export type RouteDecision = 'LOCAL' | 'GEMINI' | 'IGNORE';

export interface RoutedIntentResult {
  decision: RouteDecision;
  response: AIIntentResponse;
  smartConfidence: number;
}

export class GestureIntentRouter {
  /**
   * Determine whether to execute locally, ask Gemini, or ignore the gesture.
   */
  public static evaluateRoute(confidence: number, hasSequenceHistory: boolean = false): RouteDecision {
    if (confidence >= aiConfig.localGestureConfidence) {
      return 'LOCAL';
    }

    if (confidence >= aiConfig.aiGestureMinConfidence) {
      return 'GEMINI';
    }

    if (hasSequenceHistory && confidence >= 0.40) {
      return 'GEMINI';
    }

    return 'IGNORE';
  }

  /**
   * Compute combined smart confidence.
   * finalConfidence = localGestureConfidence * 0.45 + geminiConfidence * 0.35 + contextConfidence * 0.20
   */
  public static calculateSmartConfidence(
    localConfidence: number,
    geminiConfidence: number,
    contextConfidence: number = 0.85
  ): number {
    const raw = localConfidence * 0.45 + geminiConfidence * 0.35 + contextConfidence * 0.20;
    return parseFloat(Math.max(0, Math.min(1, raw)).toFixed(3));
  }

  /**
   * Route and resolve gesture intent.
   */
  public static async routeAndResolve(request: AIIntentRequest): Promise<RoutedIntentResult> {
    const candidateConfidence = request.gesture?.confidence ?? 0.5;
    const hasHistory = request.recentGestures && request.recentGestures.length >= 2;
    const decision = this.evaluateRoute(candidateConfidence, hasHistory);

    if (decision === 'LOCAL') {
      const mappedIntent = this.mapCandidateToIntent(request.gesture?.candidate);
      return {
        decision: 'LOCAL',
        response: {
          requestId: request.requestId,
          stateVersion: request.stateVersion,
          intent: mappedIntent,
          confidence: candidateConfidence,
          reason: 'High confidence local gesture recognition',
          source: 'validator',
          latencyMs: 0,
        },
        smartConfidence: candidateConfidence,
      };
    }

    if (decision === 'IGNORE') {
      return {
        decision: 'IGNORE',
        response: {
          requestId: request.requestId,
          stateVersion: request.stateVersion,
          intent: 'NONE',
          confidence: candidateConfidence,
          reason: 'Sub-threshold gesture without sequence intent',
          source: 'validator',
          latencyMs: 0,
        },
        smartConfidence: 0,
      };
    }

    // Decision === 'GEMINI'
    const aiResponse = await geminiService.inferGestureIntent(request);
    const contextConf = request.target ? 0.90 : 0.75;
    const smartConfidence = this.calculateSmartConfidence(
      candidateConfidence,
      aiResponse.confidence,
      contextConf
    );

    return {
      decision: 'GEMINI',
      response: {
        ...aiResponse,
        confidence: smartConfidence,
      },
      smartConfidence,
    };
  }

  private static mapCandidateToIntent(candidate: string | undefined): any {
    switch (candidate) {
      case 'SWIPE_RIGHT': return 'NEXT_CARD';
      case 'SWIPE_LEFT': return 'PREVIOUS_CARD';
      case 'PINCH': return 'SELECT';
      case 'FIST': return 'GRAB';
      case 'OPEN_PALM': return 'RELEASE';
      case 'ZOOM_IN': return 'ZOOM_IN';
      case 'ZOOM_OUT': return 'ZOOM_OUT';
      case 'CANCEL': return 'BACK';
      default: return 'NONE';
    }
  }
}

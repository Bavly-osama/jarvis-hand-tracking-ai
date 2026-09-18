import { GeminiService } from '../ai/GeminiService';

jest.mock('@google/genai', () => {
  return {
    GoogleGenAI: jest.fn().mockImplementation(() => {
      return {
        models: {
          generateContent: jest.fn().mockImplementation(({ contents }) => {
            const prompt = typeof contents === 'string' ? contents : JSON.stringify(contents);
            if (prompt.includes('malformed')) {
              return Promise.resolve({ text: '```json\n{ "intent": "SELECT" \n```' });
            }
            if (prompt.includes('timeout')) {
              return new Promise(resolve => setTimeout(resolve, 6000));
            }
            if (prompt.includes('invalid')) {
              return Promise.resolve({ text: '{"intent":"INVALID_INTENT","confidence":1,"reason":"test"}' });
            }
            return Promise.resolve({ text: '{"intent":"SELECT","confidence":0.9,"reason":"looks good"}' });
          }),
        },
      };
    }),
  };
});

// override config
jest.mock('../config', () => ({
  config: { geminiApiKey: 'test-key', geminiModel: 'test-model' }
}));

describe('GeminiService', () => {
  let geminiService: GeminiService;

  beforeEach(() => {
    geminiService = new GeminiService();
  });

  it('Valid response parsed correctly', async () => {
    const res = await geminiService.analyzeGestureIntent('session-1', {
      recentGestures: [],
      activeObject: null,
      uiState: 'idle',
      gestureConfidence: 0.9,
      hand: 'RIGHT'
    });
    expect(res.intent).toBe('SELECT');
    expect(res.confidence).toBe(0.9);
  });

  it('Invalid intent returns NONE', async () => {
    const res = await geminiService.analyzeGestureIntent('session-1', {
      recentGestures: ['invalid'],
      activeObject: null,
      uiState: 'idle',
      gestureConfidence: 0.9,
      hand: 'RIGHT'
    });
    expect(res.intent).toBe('NONE');
  });

  it('Timeout returns NONE', async () => {
    const res = await geminiService.analyzeGestureIntent('session-1', {
      recentGestures: ['timeout'],
      activeObject: null,
      uiState: 'idle',
      gestureConfidence: 0.9,
      hand: 'RIGHT'
    });
    expect(res.intent).toBe('NONE');
  }, 10000);

  it('Malformed JSON returns NONE', async () => {
    const res = await geminiService.analyzeGestureIntent('session-1', {
      recentGestures: ['malformed'],
      activeObject: null,
      uiState: 'idle',
      gestureConfidence: 0.9,
      hand: 'RIGHT'
    });
    expect(res.intent).toBe('NONE');
  });
});

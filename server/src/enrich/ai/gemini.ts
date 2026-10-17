import { ApiError, GoogleGenAI, ThinkingLevel } from '@google/genai';
import type { AiClient } from './index.js';
import { AI_ANSWER_JSON_SCHEMA, AiAnswer, SYSTEM_PROMPT, userPrompt } from './prompt.js';

/** Cheapest stable Flash-Lite model open to new projects; override with AI_MODEL. */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-lite';

export interface GeminiOptions {
  apiKey: string;
  model?: string;
  timeoutMs?: number;
}

/** One generateContent call with a JSON schema; any failure throws and is handled by the caller. */
export function geminiClient(opts: GeminiOptions): AiClient {
  const model = opts.model ?? DEFAULT_GEMINI_MODEL;
  const ai = new GoogleGenAI({ apiKey: opts.apiKey, httpOptions: { timeout: opts.timeoutMs ?? 20_000 } });
  return {
    model,
    async extract(input) {
      const res = await ai.models.generateContent({
        model,
        contents: userPrompt(input),
        config: {
          systemInstruction: SYSTEM_PROMPT,
          temperature: 0,
          maxOutputTokens: 600,
          responseMimeType: 'application/json',
          responseJsonSchema: AI_ANSWER_JSON_SCHEMA,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        },
      });
      const text = res.text;
      if (!text) throw new Error(`no answer (finish reason: ${res.candidates?.[0]?.finishReason ?? 'unknown'})`);
      return AiAnswer.parse(JSON.parse(text));
    },
  };
}

/** HTTP status of a provider error, if it has one (429 = quota, 401/403 = key). */
export const providerStatus = (err: unknown): number | null => (err instanceof ApiError ? err.status : null);

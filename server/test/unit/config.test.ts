import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';

describe('loadConfig', () => {
  it('throws a readable error when DATABASE_URL is missing', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });

  it('treats blank values as unset', () => {
    expect(() => loadConfig({ DATABASE_URL: '   ' })).toThrow(/DATABASE_URL/);
  });

  it('applies defaults and splits CORS origins', () => {
    const config = loadConfig({
      DATABASE_URL: 'postgresql://localhost/test',
      CORS_ORIGIN: 'http://localhost:5173, https://app.netlify.app',
    });
    expect(config.PORT).toBe(8080);
    expect(config.CRAWL_CONCURRENCY).toBe(5);
    expect(config.AI_FALLBACK).toBe('off');
    expect(config.AI_PROVIDER).toBe('gemini');
    expect(config.corsOrigins).toEqual(['http://localhost:5173', 'https://app.netlify.app']);
  });

  it('rejects an invalid AI_PROVIDER', () => {
    expect(() => loadConfig({ DATABASE_URL: 'postgresql://x', AI_PROVIDER: 'openai' })).toThrow(/AI_PROVIDER/);
  });
});

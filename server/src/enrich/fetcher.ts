import { request, type Dispatcher } from 'undici';
import { detectBlock } from './block.js';

export interface FetcherOptions {
  userAgent: string;
  /** Whole-request budget per attempt (connect + headers + body). */
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  /** Retries after the first attempt, for network errors and 5xx only. */
  retries?: number;
  dispatcher?: Dispatcher;
  sleep?: (ms: number) => Promise<void>;
  /** Checked before every request, including redirect targets (robots.txt). */
  allow?: (url: URL) => Promise<boolean>;
}

interface Base {
  url: string;
  ms: number;
  attempts: number;
}

export type FetchResult =
  | (Base & { kind: 'ok'; finalUrl: string; httpStatus: number; contentType: string; body: string; truncated: boolean })
  | (Base & { kind: 'blocked'; finalUrl: string; httpStatus: number; reason: string })
  | (Base & { kind: 'http_error'; finalUrl: string; httpStatus: number })
  | (Base & { kind: 'not_html'; finalUrl: string; httpStatus: number; contentType: string })
  | (Base & { kind: 'disallowed'; finalUrl: string })
  | (Base & { kind: 'unreachable'; reason: string; httpStatus?: number });

const REDIRECT = new Set([301, 302, 303, 307, 308]);
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function charsetOf(contentType: string): string {
  return /charset=["']?([\w-]+)/i.exec(contentType)?.[1]?.toLowerCase() ?? 'utf-8';
}

function decode(buf: Buffer, contentType: string): string {
  try {
    return new TextDecoder(charsetOf(contentType)).decode(buf);
  } catch {
    return new TextDecoder('utf-8').decode(buf);
  }
}

async function readCapped(body: Dispatcher.ResponseData['body'], maxBytes: number) {
  const chunks: Buffer[] = [];
  let size = 0;
  let truncated = false;
  for await (const chunk of body) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    if (size + buf.length > maxBytes) {
      chunks.push(buf.subarray(0, maxBytes - size));
      truncated = true;
      body.destroy();
      break;
    }
    chunks.push(buf);
    size += buf.length;
  }
  return { buf: Buffer.concat(chunks), truncated };
}

function errorReason(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') return 'timeout';
    const code = (err as { code?: string }).code;
    return code ? `${code}` : err.message;
  }
  return String(err);
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type Attempt = DistributiveOmit<FetchResult, 'ms' | 'attempts'> & { retryable?: boolean };

/** One attempt: follows up to `maxRedirects` redirects, checking `allow` before each request. */
async function attempt(start: URL, opts: Required<Omit<FetcherOptions, 'dispatcher' | 'allow'>> & FetcherOptions, expect: 'html' | 'text'): Promise<Attempt> {
  let url = start;
  const signal = AbortSignal.timeout(opts.timeoutMs);
  for (let hop = 0; hop <= opts.maxRedirects; hop++) {
    if (opts.allow && !(await opts.allow(url))) {
      return { kind: 'disallowed', url: start.href, finalUrl: url.href };
    }
    let res: Dispatcher.ResponseData;
    try {
      res = await request(url, {
        method: 'GET',
        headers: {
          'user-agent': opts.userAgent,
          accept: expect === 'html' ? 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5' : 'text/plain,*/*;q=0.5',
          'accept-language': 'en-US,en;q=0.8',
        },
        signal,
        dispatcher: opts.dispatcher,
      });
    } catch (err) {
      return { kind: 'unreachable', url: start.href, reason: errorReason(err), retryable: true };
    }

    const { statusCode: status, headers } = res;
    if (REDIRECT.has(status) && headers.location) {
      await res.body.dump();
      const next = new URL(String(headers.location), url);
      if (next.protocol !== 'http:' && next.protocol !== 'https:') {
        return { kind: 'unreachable', url: start.href, reason: `redirect to ${next.protocol}` };
      }
      url = next;
      continue;
    }

    const contentType = String(headers['content-type'] ?? '');
    let body = '';
    let truncated = false;
    try {
      const read = await readCapped(res.body, opts.maxBytes);
      body = decode(read.buf, contentType);
      truncated = read.truncated;
    } catch (err) {
      return { kind: 'unreachable', url: start.href, reason: errorReason(err), retryable: true };
    }

    const blocked = detectBlock({ status, headers, body: body.slice(0, 50_000) });
    if (blocked) return { kind: 'blocked', url: start.href, finalUrl: url.href, httpStatus: status, reason: blocked };
    if (status >= 500) {
      return { kind: 'unreachable', url: start.href, reason: `HTTP ${status}`, httpStatus: status, retryable: true };
    }
    if (status >= 400) return { kind: 'http_error', url: start.href, finalUrl: url.href, httpStatus: status };
    if (expect === 'html' && contentType && !/html/i.test(contentType)) {
      return { kind: 'not_html', url: start.href, finalUrl: url.href, httpStatus: status, contentType };
    }
    return { kind: 'ok', url: start.href, finalUrl: url.href, httpStatus: status, contentType, body, truncated };
  }
  return { kind: 'unreachable', url: start.href, reason: `more than ${opts.maxRedirects} redirects` };
}

/**
 * Polite GET: identifiable User-Agent, whole-request timeout, size cap, redirect limit,
 * robots check per hop, and one retry with backoff for network errors / 5xx.
 * Blocks and 4xx are never retried.
 */
export async function fetchUrl(input: string | URL, options: FetcherOptions, expect: 'html' | 'text' = 'html'): Promise<FetchResult> {
  const opts = {
    timeoutMs: 8000,
    maxBytes: 1_000_000,
    maxRedirects: 3,
    retries: 1,
    sleep: defaultSleep,
    ...options,
  };
  const started = Date.now();
  const url = new URL(input);
  let attempts = 0;
  let result: Attempt;
  for (;;) {
    attempts++;
    result = await attempt(url, opts, expect);
    if (!result.retryable || attempts > opts.retries) break;
    await opts.sleep(800 + Math.floor(Math.random() * 400));
  }
  const { retryable: _retryable, ...rest } = result;
  return { ...rest, ms: Date.now() - started, attempts } as FetchResult;
}

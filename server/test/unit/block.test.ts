import { describe, expect, it } from 'vitest';
import { detectBlock } from '../../src/enrich/block.js';

const ok = { status: 200, headers: {} };

describe('detectBlock', () => {
  it.each([
    [{ status: 429, headers: {} }, /429/],
    [{ status: 403, headers: {} }, /403/],
    [{ status: 403, headers: { 'cf-mitigated': 'challenge' } }, /Cloudflare/],
    [{ ...ok, body: '<html><head><title>Just a moment...</title></head>' }, /challenge/],
    [{ status: 503, headers: {}, body: '<title>Attention Required! | Cloudflare</title>' }, /challenge/],
    [{ ...ok, body: '<script src="/cdn-cgi/challenge-platform/h/b/orchestrate/jsch/v1"></script>' }, /challenge/],
    [{ ...ok, body: '<div class="cf-browser-verification">' }, /challenge/],
    [{ ...ok, body: '<script src="https://geo.captcha-delivery.com/captcha/"></script>' }, /challenge/],
    [{ ...ok, body: '<title>Security Check</title>' }, /CAPTCHA/],
    [{ status: 401, headers: {}, body: 'please solve the captcha' }, /CAPTCHA/],
  ])('flags %j', (input, reason) => {
    expect(detectBlock(input)).toMatch(reason);
  });

  it('does not flag a normal page with a reCAPTCHA contact form', () => {
    const body =
      '<title>Contact Us | Smith Plumbing</title><form><div class="g-recaptcha"></div></form>' +
      '<script src="https://www.google.com/recaptcha/api.js"></script>';
    expect(detectBlock({ ...ok, body })).toBeNull();
  });

  it('does not flag ordinary errors without challenge markers', () => {
    expect(detectBlock({ status: 404, headers: {}, body: 'Not found' })).toBeNull();
    expect(detectBlock({ status: 500, headers: {}, body: 'Server error' })).toBeNull();
  });
});

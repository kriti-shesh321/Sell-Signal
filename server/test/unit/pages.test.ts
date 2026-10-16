import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { discoverPages } from '../../src/enrich/pages.js';

const html = (name: string) => readFileSync(new URL(`../fixtures/html/${name}`, import.meta.url), 'utf8');

describe('discoverPages', () => {
  it('picks the shortest about-like and contact-like paths on the same site', () => {
    expect(discoverPages(html('home-with-links.html'), 'https://smithplumbing.com/')).toEqual({
      about: 'https://smithplumbing.com/about-us/',
      contact: 'https://www.smithplumbing.com/contact',
    });
  });

  it('ignores other hosts, files, tel/mailto and anchors', () => {
    const found = discoverPages(html('home-with-links.html'), 'https://smithplumbing.com/');
    const urls = Object.values(found).join(' ');
    expect(urls).not.toMatch(/facebook|partner\.example|\.pdf|tel:|mailto:|#/);
  });

  it('falls back to the link text when paths are opaque', () => {
    expect(discoverPages(html('home-text-links.html'), 'https://acme.test/')).toEqual({
      about: 'https://acme.test/p/12',
      contact: 'https://acme.test/p/14',
    });
  });

  it('returns nothing when there are no matching links', () => {
    expect(discoverPages('<a href="/services">Services</a>', 'https://acme.test/')).toEqual({});
  });
});

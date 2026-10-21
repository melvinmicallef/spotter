import { describe, expect, it, vi } from 'vitest';

import type { WebsiteImportDependencies } from './website-import.js';
import { previewWebsiteImport } from './website-import.js';

const html = `<!doctype html>
  <html><head>
    <meta property="og:title" content="Strict curl">
    <meta property="og:description" content="Keep the elbow still">
    <meta property="og:image" content="/strict-curl.gif">
  </head></html>`;

describe('website exercise import preview', () => {
  it('extracts reviewable metadata without downloading linked media', async () => {
    const dependencies: WebsiteImportDependencies = {
      resolve: vi.fn().mockResolvedValue(['93.184.216.34']),
      fetch: vi.fn().mockResolvedValue(
        new Response(html, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }),
      ),
    };

    await expect(
      previewWebsiteImport('https://example.com/curl', dependencies),
    ).resolves.toEqual({
      sourceUrl: 'https://example.com/curl',
      title: 'Strict curl',
      description: 'Keep the elbow still',
      gifUrl: 'https://example.com/strict-curl.gif',
    });
    expect(dependencies.fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    '127.0.0.1',
    '10.0.0.2',
    '100.64.0.1',
    '169.254.169.254',
    '192.168.1.2',
    '198.51.100.2',
    '::1',
    '2001:db8::1',
  ])('blocks private or local address %s', async (address) => {
    const dependencies: WebsiteImportDependencies = {
      resolve: vi.fn().mockResolvedValue([address]),
      fetch: vi.fn(),
    };

    await expect(
      previewWebsiteImport('https://unsafe.example/exercise', dependencies),
    ).rejects.toMatchObject({ code: 'IMPORT_PRIVATE_ADDRESS' });
    expect(dependencies.fetch).not.toHaveBeenCalled();
  });

  it('revalidates redirect destinations and enforces the body limit', async () => {
    const redirectDependencies: WebsiteImportDependencies = {
      resolve: vi
        .fn()
        .mockResolvedValueOnce(['93.184.216.34'])
        .mockResolvedValueOnce(['127.0.0.1']),
      fetch: vi.fn().mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: { Location: 'http://internal.example/secret' },
        }),
      ),
    };
    await expect(
      previewWebsiteImport('https://example.com/curl', redirectDependencies),
    ).rejects.toMatchObject({ code: 'IMPORT_PRIVATE_ADDRESS' });

    const largeDependencies: WebsiteImportDependencies = {
      resolve: vi.fn().mockResolvedValue(['93.184.216.34']),
      fetch: vi.fn().mockResolvedValue(
        new Response('x'.repeat(512 * 1024 + 1), {
          headers: { 'Content-Type': 'text/html' },
        }),
      ),
    };
    await expect(
      previewWebsiteImport('https://example.com/curl', largeDependencies),
    ).rejects.toMatchObject({ code: 'IMPORT_BODY_LIMIT' });
  });
});

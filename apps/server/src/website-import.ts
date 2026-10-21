import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import type { WebsiteImportPreview } from '@spotter/shared';

import { AppError } from './errors.js';

const MAX_REDIRECTS = 3;
const MAX_BODY_BYTES = 512 * 1024;
const REQUEST_TIMEOUT_MS = 5_000;

export interface WebsiteImportDependencies {
  fetch: typeof fetch;
  resolve: (hostname: string) => Promise<string[]>;
}

const defaultDependencies: WebsiteImportDependencies = {
  fetch: globalThis.fetch,
  resolve: async (hostname) =>
    (await lookup(hostname, { all: true })).map((result) => result.address),
};

export async function previewWebsiteImport(
  input: string,
  dependencies: WebsiteImportDependencies = defaultDependencies,
): Promise<WebsiteImportPreview> {
  let current = parsePublicUrl(input);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    await assertPublicHost(current, dependencies.resolve);
    const response = await dependencies.fetch(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'Spotter exercise importer/0.1',
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location || redirects === MAX_REDIRECTS)
        throw new AppError(422, 'IMPORT_REDIRECT_LIMIT', 'Too many redirects');
      current = parsePublicUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok)
      throw new AppError(
        422,
        'IMPORT_FETCH_FAILED',
        `The source website returned HTTP ${response.status}`,
      );
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('text/html'))
      throw new AppError(
        415,
        'IMPORT_CONTENT_TYPE',
        'The source must return an HTML document',
      );
    const html = await readLimitedText(response, MAX_BODY_BYTES);
    return extractPreview(html, current);
  }
  throw new AppError(422, 'IMPORT_REDIRECT_LIMIT', 'Too many redirects');
}

export function extractPreview(
  html: string,
  sourceUrl: URL,
): WebsiteImportPreview {
  const metadata = readMeta(html);
  const jsonLd = readJsonLd(html);
  const rawTitle =
    textValue(jsonLd?.name) ??
    metadata.get('og:title') ??
    firstMatch(html, /<title\b[^>]*>([\s\S]*?)<\/title>/i);
  if (!rawTitle)
    throw new AppError(
      422,
      'IMPORT_METADATA_MISSING',
      'No usable exercise title was found on the page',
    );
  const description =
    textValue(jsonLd?.description) ??
    metadata.get('og:description') ??
    metadata.get('description') ??
    null;
  const image =
    imageValue(jsonLd?.image) ??
    metadata.get('og:image') ??
    metadata.get('og:image:url');
  const gifUrl = image ? safeResolvedGifUrl(image, sourceUrl) : null;

  return {
    sourceUrl: sourceUrl.toString(),
    title: cleanText(rawTitle).slice(0, 300),
    description: description ? cleanText(description).slice(0, 2_000) : null,
    gifUrl,
  };
}

async function assertPublicHost(
  url: URL,
  resolve: WebsiteImportDependencies['resolve'],
): Promise<void> {
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (hostname === 'localhost' || hostname.endsWith('.localhost'))
    throw privateAddressError();
  let addresses: string[];
  try {
    addresses = isIP(hostname) ? [hostname] : await resolve(hostname);
  } catch {
    throw new AppError(
      422,
      'IMPORT_DNS_FAILED',
      'The source website hostname could not be resolved',
    );
  }
  if (addresses.length === 0 || addresses.some(isPrivateAddress))
    throw privateAddressError();
}

function parsePublicUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new AppError(400, 'INVALID_IMPORT_URL', 'Enter a valid website URL');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new AppError(
      400,
      'INVALID_IMPORT_URL',
      'Only HTTP and HTTPS URLs without credentials are supported',
    );
  return url;
}

function isPrivateAddress(address: string): boolean {
  if (address.includes(':')) {
    const normalized = address.toLowerCase();
    const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    if (mappedIpv4) return isPrivateAddress(mappedIpv4);
    return (
      normalized === '::1' ||
      normalized === '::' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb') ||
      normalized.startsWith('ff') ||
      normalized.startsWith('2001:db8:')
    );
  }
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part)))
    return true;
  const [a, b, c] = parts as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

async function readLimitedText(
  response: Response,
  limit: number,
): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    total += result.value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new AppError(
        413,
        'IMPORT_BODY_LIMIT',
        'The source page is too large to import safely',
      );
    }
    chunks.push(result.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function readMeta(html: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attributes = new Map<string, string>();
    for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gi))
      attributes.set(match[1]!.toLowerCase(), match[3]!);
    const key = attributes.get('property') ?? attributes.get('name');
    const value = attributes.get('content');
    if (key && value) result.set(key.toLowerCase(), value);
  }
  return result;
}

function readJsonLd(html: string): Record<string, unknown> | undefined {
  const blocks = html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const block of blocks) {
    try {
      const value = JSON.parse(block[1]!) as unknown;
      const candidates = Array.isArray(value)
        ? value
        : typeof value === 'object' && value && '@graph' in value
          ? (value as { '@graph': unknown[] })['@graph']
          : [value];
      const candidate = candidates.find(
        (item) => typeof item === 'object' && item !== null && 'name' in item,
      );
      if (candidate) return candidate as Record<string, unknown>;
    } catch {
      // Invalid JSON-LD is ignored in favor of OpenGraph and title metadata.
    }
  }
  return undefined;
}

function textValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function imageValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value))
    return value.find((item) => typeof item === 'string');
  if (value && typeof value === 'object' && 'url' in value)
    return textValue((value as { url: unknown }).url);
  return undefined;
}

function safeResolvedGifUrl(value: string, base: URL): string | null {
  try {
    const url = new URL(value, base);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return /\.gif(?:$|[?#])/i.test(url.toString()) ? url.toString() : null;
  } catch {
    return null;
  }
}

function firstMatch(value: string, pattern: RegExp): string | undefined {
  return pattern.exec(value)?.[1];
}

function cleanText(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function privateAddressError(): AppError {
  return new AppError(
    400,
    'IMPORT_PRIVATE_ADDRESS',
    'Private, local, and reserved network addresses cannot be imported',
  );
}

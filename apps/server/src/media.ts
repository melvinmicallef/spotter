import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { AppError } from './errors.js';

export const MAX_GIF_BYTES = 5 * 1024 * 1024;

export class MediaStorage {
  constructor(private readonly root: string) {
    mkdirSync(root, { recursive: true });
  }

  store(id: string, bytes: Buffer): void {
    validateGif(bytes);
    writeFileSync(this.path(id), bytes, { flag: 'wx', mode: 0o640 });
  }

  read(id: string): Buffer {
    try {
      return readFileSync(this.path(id));
    } catch {
      throw new AppError(404, 'NOT_FOUND', 'Exercise media file not found');
    }
  }

  remove(id: string): void {
    rmSync(this.path(id), { force: true });
  }

  safeOriginalName(value: string | undefined): string {
    const name = basename(value?.trim() || 'exercise.gif').slice(0, 255);
    return name.toLowerCase().endsWith('.gif') ? name : `${name}.gif`;
  }

  private path(id: string): string {
    return join(this.root, `${id}.gif`);
  }
}

export function validateGif(bytes: Buffer): void {
  if (bytes.length === 0 || bytes.length > MAX_GIF_BYTES) {
    throw new AppError(
      413,
      'INVALID_MEDIA_SIZE',
      `GIF files must be between 1 byte and ${MAX_GIF_BYTES} bytes`,
    );
  }
  const signature = bytes.subarray(0, 6).toString('ascii');
  if (signature !== 'GIF87a' && signature !== 'GIF89a') {
    throw new AppError(
      415,
      'INVALID_MEDIA_TYPE',
      'The uploaded file is not a valid GIF image',
    );
  }
}

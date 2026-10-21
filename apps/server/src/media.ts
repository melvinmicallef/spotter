import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import type { ExerciseMedia } from '@spotter/shared';

import { AppError } from './errors.js';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export type SupportedImageMimeType = ExerciseMedia['mimeType'];

const IMAGE_EXTENSIONS: Record<SupportedImageMimeType, string> = {
  'image/gif': 'gif',
  'image/png': 'png',
  'image/jpeg': 'jpg',
};

export class MediaStorage {
  constructor(private readonly root: string) {
    mkdirSync(root, { recursive: true });
  }

  store(id: string, bytes: Buffer, mimeType: SupportedImageMimeType): void {
    validateImage(bytes, mimeType);
    writeFileSync(this.path(id, mimeType), bytes, { flag: 'wx', mode: 0o640 });
  }

  read(id: string, mimeType: SupportedImageMimeType): Buffer {
    try {
      return readFileSync(this.path(id, mimeType));
    } catch {
      throw new AppError(404, 'NOT_FOUND', 'Exercise image file not found');
    }
  }

  remove(id: string, mimeType: SupportedImageMimeType): void {
    rmSync(this.path(id, mimeType), { force: true });
  }

  safeOriginalName(
    value: string | undefined,
    mimeType: SupportedImageMimeType,
  ): string {
    const extension = IMAGE_EXTENSIONS[mimeType];
    const fallback = `exercise.${extension}`;
    const name = basename(value?.trim() || fallback).slice(0, 255);
    const acceptedExtensions =
      mimeType === 'image/jpeg' ? ['.jpg', '.jpeg'] : [`.${extension}`];
    return acceptedExtensions.some((suffix) =>
      name.toLowerCase().endsWith(suffix),
    )
      ? name
      : `${name}.${extension}`;
  }

  private path(id: string, mimeType: SupportedImageMimeType): string {
    return join(this.root, `${id}.${IMAGE_EXTENSIONS[mimeType]}`);
  }
}

export function isSupportedImageMimeType(
  value: string | undefined,
): value is SupportedImageMimeType {
  return (
    value === 'image/gif' || value === 'image/png' || value === 'image/jpeg'
  );
}

export function validateImage(
  bytes: Buffer,
  mimeType: SupportedImageMimeType,
): void {
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) {
    throw new AppError(
      413,
      'INVALID_MEDIA_SIZE',
      `Images must be between 1 byte and ${MAX_IMAGE_BYTES} bytes`,
    );
  }

  const valid =
    mimeType === 'image/gif'
      ? ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'))
      : mimeType === 'image/png'
        ? bytes
            .subarray(0, 8)
            .equals(
              Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
            )
        : bytes.length >= 3 &&
          bytes[0] === 0xff &&
          bytes[1] === 0xd8 &&
          bytes[2] === 0xff;

  if (!valid) {
    throw new AppError(
      415,
      'INVALID_MEDIA_TYPE',
      `The uploaded file is not a valid ${mimeType.replace('image/', '').toUpperCase()} image`,
    );
  }
}

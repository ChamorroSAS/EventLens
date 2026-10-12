import type { MediaLimitsConfig, UploadMediaType } from './contracts.js';

export const DEFAULT_MAX_PHOTO_BYTES = 26_214_400n; // 25 MB (decimal 25_000_000n per DEC-079, or 25*1024*1024)
export const DEFAULT_MAX_VIDEO_BYTES = 524_288_000n; // 500 MB
export const DEFAULT_MAX_VIDEO_DURATION_SECONDS = 300; // 5 min

export interface ValidationInspectionResult {
  valid: boolean;
  detectedType: string;
  durationSeconds?: number;
  rejectionReason?: string;
}

export class UploadMediaValidator {
  /**
   * Detects MIME / media format safely from raw magic bytes (first 64 - 8192 bytes).
   * Prevents execution of complex, unisolated parsers in API process per ARCH-015 / EL-TK-089.
   */
  public static detectFormat(header: Uint8Array | Buffer): {
    format: string;
    mediaType: UploadMediaType;
  } | null {
    if (!header || header.length < 8) {
      return null;
    }

    const buf = Buffer.isBuffer(header) ? header : Buffer.from(header);

    // 1. JPEG: FF D8 FF
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
      return { format: 'image/jpeg', mediaType: 'PHOTO' };
    }

    // 2. PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47 &&
      buf[4] === 0x0d &&
      buf[5] === 0x0a &&
      buf[6] === 0x1a &&
      buf[7] === 0x0a
    ) {
      return { format: 'image/png', mediaType: 'PHOTO' };
    }

    // 3. WebP: RIFF .... WEBP
    if (
      buf.length >= 12 &&
      buf.toString('ascii', 0, 4) === 'RIFF' &&
      buf.toString('ascii', 8, 12) === 'WEBP'
    ) {
      return { format: 'image/webp', mediaType: 'PHOTO' };
    }

    // 4. ISO Base Media File Format (MP4, MOV, HEIC/HEIF)
    // Box structure: 4 bytes length, 4 bytes type 'ftyp'
    if (buf.length >= 12 && buf.toString('ascii', 4, 8) === 'ftyp') {
      const brand = buf.toString('ascii', 8, 12).toLowerCase();
      const compatibleList = buf.toString('ascii', 12, Math.min(buf.length, 64)).toLowerCase();

      // HEIC / HEIF
      if (
        brand.startsWith('heic') ||
        brand.startsWith('heix') ||
        brand.startsWith('heim') ||
        brand.startsWith('heis') ||
        brand.startsWith('mif1') ||
        brand.startsWith('msf1') ||
        compatibleList.includes('heic') ||
        compatibleList.includes('mif1')
      ) {
        return { format: 'image/heic', mediaType: 'PHOTO' };
      }

      // QuickTime MOV
      if (brand.startsWith('qt')) {
        return { format: 'video/quicktime', mediaType: 'VIDEO' };
      }

      // MP4
      return { format: 'video/mp4', mediaType: 'VIDEO' };
    }

    // 5. Matroska / WebM: EBML header 1A 45 DF A3
    if (
      buf[0] === 0x1a &&
      buf[1] === 0x45 &&
      buf[2] === 0xdf &&
      buf[3] === 0xa3
    ) {
      const str = buf.toString('ascii', 0, Math.min(buf.length, 64)).toLowerCase();
      if (str.includes('webm')) {
        return { format: 'video/webm', mediaType: 'VIDEO' };
      }
      return { format: 'video/webm', mediaType: 'VIDEO' };
    }

    return null;
  }

  /**
   * Safely extracts duration in seconds from container headers (MP4 / MOV mvhd atom).
   * Returns undefined if moov / mvhd is not present in the header chunk.
   */
  public static extractDurationSeconds(header: Uint8Array | Buffer): number | undefined {
    if (!header || header.length < 32) {
      return undefined;
    }

    const buf = Buffer.isBuffer(header) ? header : Buffer.from(header);

    // Scan for 'mvhd' atom
    const mvhdIndex = buf.indexOf('mvhd');
    if (mvhdIndex !== -1 && buf.length >= mvhdIndex + 24) {
      const version = buf.readUInt8(mvhdIndex + 4);
      if (version === 0 && buf.length >= mvhdIndex + 24) {
        const timescale = buf.readUInt32BE(mvhdIndex + 16);
        const duration = buf.readUInt32BE(mvhdIndex + 20);
        if (timescale > 0) {
          return Number((duration / timescale).toFixed(2));
        }
      } else if (version === 1 && buf.length >= mvhdIndex + 36) {
        const timescale = buf.readUInt32BE(mvhdIndex + 24);
        const durationHigh = buf.readUInt32BE(mvhdIndex + 28);
        const durationLow = buf.readUInt32BE(mvhdIndex + 32);
        const duration = durationHigh * 4294967296 + durationLow;
        if (timescale > 0) {
          return Number((duration / timescale).toFixed(2));
        }
      }
    }

    return undefined;
  }

  /**
   * Validates actual file parameters against plan limits and contract constraints.
   */
  public static validate(params: {
    declaredType: UploadMediaType;
    actualSize: bigint;
    headerBytes?: Uint8Array | Buffer;
    providedDurationSeconds?: number;
    limits?: MediaLimitsConfig;
  }): ValidationInspectionResult {
    const { declaredType, actualSize, headerBytes, providedDurationSeconds, limits } = params;

    const maxPhotoBytes = limits?.maxPhotoBytes ?? DEFAULT_MAX_PHOTO_BYTES;
    const maxVideoBytes = limits?.maxVideoBytes ?? DEFAULT_MAX_VIDEO_BYTES;
    const maxVideoDurationSeconds = limits?.maxVideoDurationSeconds ?? DEFAULT_MAX_VIDEO_DURATION_SECONDS;

    // 1. Detect format if header is available
    let detectedFormat = declaredType === 'PHOTO' ? 'image/jpeg' : 'video/mp4';
    let detectedType: UploadMediaType = declaredType;

    if (headerBytes && headerBytes.length > 0) {
      const detected = this.detectFormat(headerBytes);
      if (!detected) {
        return {
          valid: false,
          detectedType: 'application/octet-stream',
          rejectionReason: 'UNSUPPORTED_MEDIA_TYPE'
        };
      }
      detectedFormat = detected.format;
      detectedType = detected.mediaType;

      // Discrepancy between declared photo vs detected video or vice versa
      if (detectedType !== declaredType) {
        return {
          valid: false,
          detectedType: detectedFormat,
          rejectionReason: 'UNSUPPORTED_MEDIA_TYPE'
        };
      }
    }

    // 2. Validate Size
    if (actualSize <= 0n) {
      return {
        valid: false,
        detectedType: detectedFormat,
        rejectionReason: 'CORRUPTED_OR_UNREADABLE_FILE'
      };
    }

    if (declaredType === 'PHOTO' && actualSize > maxPhotoBytes) {
      return {
        valid: false,
        detectedType: detectedFormat,
        rejectionReason: 'FILE_SIZE_EXCEEDS_LIMIT'
      };
    }

    if (declaredType === 'VIDEO' && actualSize > maxVideoBytes) {
      return {
        valid: false,
        detectedType: detectedFormat,
        rejectionReason: 'FILE_SIZE_EXCEEDS_LIMIT'
      };
    }

    // 3. Validate Duration for Videos
    let durationSeconds = providedDurationSeconds;
    if (durationSeconds === undefined && headerBytes) {
      durationSeconds = this.extractDurationSeconds(headerBytes);
    }

    if (declaredType === 'VIDEO' && durationSeconds !== undefined) {
      if (durationSeconds > maxVideoDurationSeconds) {
        return {
          valid: false,
          detectedType: detectedFormat,
          durationSeconds,
          rejectionReason: 'DURATION_EXCEEDS_LIMIT'
        };
      }
    }

    return {
      valid: true,
      detectedType: detectedFormat,
      durationSeconds
    };
  }
}

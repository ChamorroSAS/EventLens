import { describe, it, expect } from 'vitest';
import jsQR from 'jsqr';
import { generateQrMatrix, generateQrSvg } from '../src/qr-generator.js';

/** Rasterize the SVG's one-module path commands without depending on a browser. */
function decodeSvg(svg: string, scale = 8): string | null {
  const viewBox = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  if (!viewBox) throw new Error('QR SVG has no square viewBox');
  const width = Number(viewBox[1]) * scale;
  const height = Number(viewBox[2]) * scale;
  const image = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    image[i * 4] = 255;
    image[i * 4 + 1] = 255;
    image[i * 4 + 2] = 255;
    image[i * 4 + 3] = 255;
  }

  const path = svg.match(/<path d="([^"]+)"/);
  if (!path) throw new Error('QR SVG has no module path');
  for (const [, xText, yText] of path[1].matchAll(/M(\d+),(\d+)h1v1h-1z/g)) {
    const x0 = Number(xText) * scale;
    const y0 = Number(yText) * scale;
    for (let y = y0; y < y0 + scale; y++) {
      for (let x = x0; x < x0 + scale; x++) {
        const offset = (y * width + x) * 4;
        image[offset] = 0;
        image[offset + 1] = 0;
        image[offset + 2] = 0;
      }
    }
  }

  return jsQR(image, width, height)?.data ?? null;
}

/** Byte-mode payload capacity per QR version at error-correction level M (ISO/IEC 18004 table 7). */
const BYTE_CAPACITY_M: Record<number, number> = { 1: 14, 2: 26, 3: 42, 4: 62, 5: 84, 6: 106, 7: 122 };

/** Builds a URL-shaped payload with an exact byte length so it selects a known QR version. */
function payloadOfByteLength(length: number): string {
  const prefix = 'https://e.test/';
  return length <= prefix.length ? prefix.slice(0, length) : prefix + 'a'.repeat(length - prefix.length);
}

describe('QR Generator (EL-TK-081)', () => {
  it('generates a valid QR matrix for a standard share URL', () => {
    const url = 'https://eventlens.app/g/aB3_9xK1L0mZ4qP8rT2vW5yX';
    const { size, matrix } = generateQrMatrix(url);

    expect(size).toBeGreaterThanOrEqual(21);
    expect(matrix.length).toBe(size);
    expect(matrix[0].length).toBe(size);

    // Finder patterns should have solid 3x3 centers
    // Top-left finder center at (3,3)
    expect(matrix[3][3]).toBe(true);
    // Top-right finder center at (3, size - 4)
    expect(matrix[3][size - 4]).toBe(true);
    // Bottom-left finder center at (size - 4, 3)
    expect(matrix[size - 4][3]).toBe(true);
  });

  it('generates a well-formed SVG string with crisp edges and accessibility attributes', () => {
    const url = 'https://eventlens.app/g/test-share-link';
    const svg = generateQrSvg(url);

    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('role="img"');
    expect(svg).toContain(`aria-label="QR Code: ${url}"`);
    expect(svg).toContain('shape-rendering="crispEdges"');
    expect(svg).toContain('<rect');
    expect(svg).toContain('<path');
    expect(svg).toContain('</svg>');
  });

  it.each([
    ['small QR', 'http://192.168.40.135:4200/g/AbCdEf0123456789'],
    ['scheduled-event QR URL', `http://192.168.40.135:4200/g/${'aB3_9xK1L0mZ4qP8rT2vW5yX'}`],
    ['public HTTPS URL', `https://events.example.com/g/${'aB3_9xK1L0mZ4qP8rT2vW5yX'}`],
    ['UTF-8 URL', 'https://events.example.com/g/fiesta-caf%C3%A9-2026'],
  ])('decodes the generated SVG for %s with an independent QR decoder', (_label, url) => {
    expect(decodeSvg(generateQrSvg(url))).toBe(url);
  });

  it.each([1, 2, 3, 4, 5, 6, 7])('decodes symbols selected for QR version %i', (version) => {
    const payload = payloadOfByteLength(BYTE_CAPACITY_M[version]);
    const qr = generateQrMatrix(payload);
    expect(qr.size).toBe(17 + 4 * version);
    expect(decodeSvg(generateQrSvg(payload))).toBe(payload);
  });

  it('decodes payloads at the version capacity edge', () => {
    // One byte over version 6 capacity must roll over to version 7, and both stay scannable.
    const atVersion6 = payloadOfByteLength(BYTE_CAPACITY_M[6]);
    expect(generateQrMatrix(atVersion6).size).toBe(17 + 4 * 6);
    expect(decodeSvg(generateQrSvg(atVersion6))).toBe(atVersion6);

    const atVersion7 = payloadOfByteLength(BYTE_CAPACITY_M[6] + 1);
    expect(generateQrMatrix(atVersion7).size).toBe(17 + 4 * 7);
    expect(decodeSvg(generateQrSvg(atVersion7))).toBe(atVersion7);
  });

  it('customizes quiet zone correctly in SVG viewBox', () => {
    const url = 'https://example.com/g/key';
    const { size } = generateQrMatrix(url);
    const quietZone = 2;
    const svg = generateQrSvg(url, quietZone);

    const expectedTotal = size + quietZone * 2;
    expect(svg).toContain(`viewBox="0 0 ${expectedTotal} ${expectedTotal}"`);
  });

  it('throws an informative error when payload exceeds maximum capacity', () => {
    const hugePayload = 'A'.repeat(500);
    expect(() => generateQrMatrix(hugePayload)).toThrow(/Text too long/);
  });
});

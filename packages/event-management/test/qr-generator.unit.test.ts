import { describe, it, expect } from 'vitest';
import { generateQrMatrix, generateQrSvg } from '../src/qr-generator.js';

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

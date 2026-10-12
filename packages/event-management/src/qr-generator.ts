/**
 * Pure TypeScript QR Code generator (ISO/IEC 18004) producing standalone SVG strings.
 * Self-contained without external native/network dependencies (ARCH-015 / EL-TK-081).
 */

// Galois Field GF(2^8) math for Reed-Solomon error correction
const GF256_EXP = new Uint8Array(512);
const GF256_LOG = new Uint8Array(256);

(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF256_EXP[i] = x;
    GF256_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) {
    GF256_EXP[i] = GF256_EXP[i - 255];
  }
})();

function gfMultiply(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return GF256_EXP[GF256_LOG[x] + GF256_LOG[y]];
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMultiply(poly[j], GF256_EXP[i]);
      next[j + 1] ^= poly[j];
    }
    poly = next;
  }
  return poly;
}

function rsCompute(data: Uint8Array, numEcBytes: number): Uint8Array {
  const gen = rsGeneratorPoly(numEcBytes);
  const remainder = new Uint8Array(numEcBytes);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ remainder[0];
    remainder.copyWithin(0, 1);
    remainder[numEcBytes - 1] = 0;
    for (let j = 0; j < numEcBytes; j++) {
      remainder[j] ^= gfMultiply(gen[j], factor);
    }
  }
  return remainder;
}

// Version table parameters for Error Correction Level M
// Version 1..6: capacity in bytes, total codewords, ec codewords per block
interface QrVersionInfo {
  version: number;
  size: number;
  dataCapacityBytes: number;
  totalCodewords: number;
  ecCodewords: number;
  numBlocks: number;
  alignmentPatternPositions: number[];
}

const QR_VERSIONS: QrVersionInfo[] = [
  { version: 1, size: 21, dataCapacityBytes: 14, totalCodewords: 26, ecCodewords: 10, numBlocks: 1, alignmentPatternPositions: [] },
  { version: 2, size: 25, dataCapacityBytes: 26, totalCodewords: 44, ecCodewords: 16, numBlocks: 1, alignmentPatternPositions: [6, 18] },
  { version: 3, size: 29, dataCapacityBytes: 42, totalCodewords: 70, ecCodewords: 26, numBlocks: 1, alignmentPatternPositions: [6, 22] },
  { version: 4, size: 33, dataCapacityBytes: 62, totalCodewords: 100, ecCodewords: 18, numBlocks: 2, alignmentPatternPositions: [6, 26] },
  { version: 5, size: 37, dataCapacityBytes: 84, totalCodewords: 134, ecCodewords: 24, numBlocks: 2, alignmentPatternPositions: [6, 30] },
  { version: 6, size: 41, dataCapacityBytes: 106, totalCodewords: 172, ecCodewords: 16, numBlocks: 4, alignmentPatternPositions: [6, 34] },
  { version: 7, size: 45, dataCapacityBytes: 122, totalCodewords: 196, ecCodewords: 18, numBlocks: 4, alignmentPatternPositions: [6, 22, 38] }
];

export function generateQrMatrix(text: string): { size: number; matrix: boolean[][] } {
  const textBytes = Buffer.from(text, 'utf-8');
  const ver = QR_VERSIONS.find((v) => v.dataCapacityBytes >= textBytes.length + 3);
  if (!ver) {
    throw new Error(`Text too long for supported QR code versions: ${text.length} bytes`);
  }

  // 1. Bitstream encoding: Byte mode (0100) + char count + data + terminator + padding
  const bitstream: number[] = [];
  function pushBits(val: number, len: number) {
    for (let i = len - 1; i >= 0; i--) {
      bitstream.push((val >> i) & 1);
    }
  }

  pushBits(0b0100, 4); // Byte mode indicator
  pushBits(textBytes.length, 8); // Character count (8 bits for versions 1-9)
  for (const b of textBytes) {
    pushBits(b, 8);
  }

  // Terminator
  const totalDataBits = (ver.totalCodewords - ver.ecCodewords * ver.numBlocks) * 8;
  const termLen = Math.min(4, totalDataBits - bitstream.length);
  pushBits(0, termLen);

  // Pad to byte boundary
  while (bitstream.length % 8 !== 0) {
    bitstream.push(0);
  }

  // Convert to bytes
  const dataBytes: number[] = [];
  for (let i = 0; i < bitstream.length; i += 8) {
    let byte = 0;
    for (let b = 0; b < 8; b++) {
      byte = (byte << 1) | bitstream[i + b];
    }
    dataBytes.push(byte);
  }

  // Pad bytes 0xEC, 0x11
  const totalDataBytes = totalDataBits / 8;
  let padByte = 0xec;
  while (dataBytes.length < totalDataBytes) {
    dataBytes.push(padByte);
    padByte = padByte === 0xec ? 0x11 : 0xec;
  }

  // 2. Error Correction computation per block
  const blockDataLen = Math.floor(dataBytes.length / ver.numBlocks);
  const ecPerBlock = ver.ecCodewords;
  const blocksData: Uint8Array[] = [];
  const blocksEc: Uint8Array[] = [];

  for (let b = 0; b < ver.numBlocks; b++) {
    const chunk = Uint8Array.from(dataBytes.slice(b * blockDataLen, (b + 1) * blockDataLen));
    blocksData.push(chunk);
    blocksEc.push(rsCompute(chunk, ecPerBlock));
  }

  // Interleave data and EC
  const interleaved: number[] = [];
  for (let i = 0; i < blockDataLen; i++) {
    for (let b = 0; b < ver.numBlocks; b++) {
      interleaved.push(blocksData[b][i]);
    }
  }
  for (let i = 0; i < ecPerBlock; i++) {
    for (let b = 0; b < ver.numBlocks; b++) {
      interleaved.push(blocksEc[b][i]);
    }
  }

  // 3. Construct Matrix
  const size = ver.size;
  const matrix: (boolean | null)[][] = Array.from({ length: size }, () => Array(size).fill(null));
  const isFunction: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  function setFunctionModule(r: number, c: number, val: boolean) {
    matrix[r][c] = val;
    isFunction[r][c] = true;
  }

  // Finder patterns at top-left, top-right, bottom-left
  function placeFinder(top: number, left: number) {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const isBlack =
          r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4);
        setFunctionModule(top + r, left + c, isBlack);
      }
    }
    // Separators
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        if (r === -1 || r === 7 || c === -1 || c === 7) {
          const rr = top + r;
          const cc = left + c;
          if (rr >= 0 && rr < size && cc >= 0 && cc < size) {
            setFunctionModule(rr, cc, false);
          }
        }
      }
    }
  }

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    if (!isFunction[6][i]) setFunctionModule(6, i, i % 2 === 0);
    if (!isFunction[i][6]) setFunctionModule(i, 6, i % 2 === 0);
  }

  // Alignment patterns
  for (const posR of ver.alignmentPatternPositions) {
    for (const posC of ver.alignmentPatternPositions) {
      if (isFunction[posR][posC]) continue;
      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
          const isBlack = Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0);
          setFunctionModule(posR + r, posC + c, isBlack);
        }
      }
    }
  }

  // Dark module
  setFunctionModule(4 * ver.version + 9, 8, true);

  // Reserve format information areas
  for (let i = 0; i < 9; i++) {
    if (!isFunction[8][i]) isFunction[8][i] = true;
    if (!isFunction[i][8]) isFunction[i][8] = true;
  }
  for (let i = 0; i < 8; i++) {
    if (!isFunction[8][size - 1 - i]) isFunction[8][size - 1 - i] = true;
    if (!isFunction[size - 1 - i][8]) isFunction[size - 1 - i][8] = true;
  }

  // 4. Place Data Codewords (zigzag traversal)
  const allBits: number[] = [];
  for (const byte of interleaved) {
    for (let b = 7; b >= 0; b--) {
      allBits.push((byte >> b) & 1);
    }
  }

  let bitIdx = 0;
  let upwards = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right--; // Skip vertical timing column
    const rows = upwards
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (const r of rows) {
      for (const c of [right, right - 1]) {
        if (!isFunction[r][c]) {
          const bit = bitIdx < allBits.length ? allBits[bitIdx++] : 0;
          matrix[r][c] = bit === 1;
        }
      }
    }
    upwards = !upwards;
  }

  // 5. Apply Mask (Mask Pattern 0: (row + col) % 2 === 0)
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!isFunction[r][c]) {
        if ((r + c) % 2 === 0) {
          matrix[r][c] = !matrix[r][c];
        }
      }
    }
  }

  // 6. Write Format Information (Error Correction Level M = 00, Mask 0 = 000 -> 0b00000)
  // Format string with BCH (15,5) code for (M, mask 0): 0b101010000010010
  const formatBits = [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0];
  // Top-left
  matrix[8][0] = Boolean(formatBits[0]);
  matrix[8][1] = Boolean(formatBits[1]);
  matrix[8][2] = Boolean(formatBits[2]);
  matrix[8][3] = Boolean(formatBits[3]);
  matrix[8][4] = Boolean(formatBits[4]);
  matrix[8][5] = Boolean(formatBits[5]);
  matrix[8][7] = Boolean(formatBits[6]);
  matrix[8][8] = Boolean(formatBits[7]);
  matrix[7][8] = Boolean(formatBits[8]);
  matrix[5][8] = Boolean(formatBits[9]);
  matrix[4][8] = Boolean(formatBits[10]);
  matrix[3][8] = Boolean(formatBits[11]);
  matrix[2][8] = Boolean(formatBits[12]);
  matrix[1][8] = Boolean(formatBits[13]);
  matrix[0][8] = Boolean(formatBits[14]);

  // Bottom-left & Top-right
  for (let i = 0; i < 7; i++) {
    matrix[size - 1 - i][8] = Boolean(formatBits[i]);
  }
  for (let i = 0; i < 8; i++) {
    matrix[8][size - 8 + i] = Boolean(formatBits[7 + i]);
  }

  const finalMatrix = matrix.map((row) => row.map((val) => Boolean(val)));
  return { size, matrix: finalMatrix };
}

/**
 * Generates an accessible, clean SVG string for a QR code.
 */
export function generateQrSvg(text: string, quietZone: number = 4): string {
  const { size, matrix } = generateQrMatrix(text);
  const totalSize = size + quietZone * 2;

  let paths = '';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c]) {
        const x = c + quietZone;
        const y = r + quietZone;
        paths += `M${x},${y}h1v1h-1z `;
      }
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" ` +
    `shape-rendering="crispEdges" width="100%" height="100%" role="img" aria-label="QR Code: ${text}">` +
    `<rect width="${totalSize}" height="${totalSize}" fill="#ffffff"/>` +
    `<path d="${paths.trim()}" fill="#000000"/>` +
    `</svg>`
  );
}

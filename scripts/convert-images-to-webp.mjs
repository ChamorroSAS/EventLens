#!/usr/bin/env node
/**
 * Convierte imágenes raster a WebP con sharp.
 *
 * Uso:
 *   node scripts/convert-images-to-webp.mjs [opciones] [archivos...]
 *
 * Sin archivos posicionales usa DEFAULT_TARGETS (las 4 ilustraciones del home,
 * reescaladas a 440px de ancho). Con archivos posicionales convierte solo esos
 * (rutas relativas a la raíz del repo o absolutas).
 *
 * Opciones:
 *   --quality=N      Calidad WebP 1-100 (por defecto 82).
 *   --max-width=N    Limita el ancho en px; nunca amplía (por defecto: sin límite).
 *   --delete         Borra el original tras convertir correctamente.
 *   --force          Reconvierte aunque el .webp ya exista.
 *   --dry-run        Solo informa lo que haría; no escribe ni borra nada.
 *
 * Salvaguarda: las PNG de marca están sujetas a un contrato byte a byte
 * (sourceSha256 en branding-assets.ts + scripts/verify-branding-assets.mjs).
 * El script las rechaza explícitamente para no romper ese contrato.
 */
import { existsSync } from 'node:fs';
import { rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Assets blindados por contrato byte a byte: nunca se convierten. */
const PROTECTED = [
  'apps/web/public/assets/branding/phoeve/logo-primary.png',
  'apps/web/public/assets/branding/phoeve/logo-dark.png',
  'apps/web/public/assets/branding/phoeve/logo-grayscale.png',
  'apps/web/public/assets/branding/phoeve/favicon.png'
];

/**
 * Objetivo por defecto: las 4 ilustraciones del home.
 *
 * Se reescalan a 440px de ancho (2x el tamaño de presentación de 220px) para
 * pantallas densas. Para reconvertir hay que restaurar antes los PNG originales
 * (los .webp reemplazan al original): git checkout -- apps/web/public/assets/illustrations/*.png
 *
 * NO se incluyen los fondos de login ni el avatar del panel: CR-009 y EL-TK-243
 * los declaran fuera de alcance. Se pueden convertir pasándolos explícitamente.
 */
const DEFAULT_TARGETS = [
  { path: 'apps/web/public/assets/illustrations/step-1-prepara-evento.png', maxWidth: 440 },
  { path: 'apps/web/public/assets/illustrations/step-2-comparte-invitacion.png', maxWidth: 440 },
  { path: 'apps/web/public/assets/illustrations/step-3-cada-mirada-cuenta.png', maxWidth: 440 },
  { path: 'apps/web/public/assets/illustrations/step-4-revive-recuerdos.png', maxWidth: 440 }
];

function parseArgs(argv) {
  const options = { quality: 82, maxWidth: null, remove: false, force: false, dryRun: false };
  const files = [];
  for (const arg of argv) {
    if (arg === '--delete') options.remove = true;
    else if (arg === '--force') options.force = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg.startsWith('--quality=')) options.quality = Number(arg.slice('--quality='.length));
    else if (arg.startsWith('--max-width=')) options.maxWidth = Number(arg.slice('--max-width='.length));
    else if (arg.startsWith('--')) throw new Error(`Opción desconocida: ${arg}`);
    else files.push(arg);
  }
  if (!Number.isFinite(options.quality) || options.quality < 1 || options.quality > 100) {
    throw new Error('--quality debe ser un número entre 1 y 100.');
  }
  if (options.maxWidth !== null && (!Number.isFinite(options.maxWidth) || options.maxWidth < 1)) {
    throw new Error('--max-width debe ser un número positivo.');
  }
  return { options, files };
}

function toRel(absPath) {
  return path.relative(repoRoot, absPath).split(path.sep).join('/');
}

function kb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

async function convertOne(target, options) {
  const relPath = typeof target === 'string' ? target : target.path;
  const maxWidth = typeof target === 'object' && target.maxWidth ? target.maxWidth : options.maxWidth;
  const absPath = path.isAbsolute(relPath) ? relPath : path.join(repoRoot, relPath);
  const rel = toRel(absPath);

  if (PROTECTED.includes(rel)) {
    throw new Error(
      `RECHAZADO: ${rel} está blindado por contrato byte a byte (verify-branding-assets.mjs). No se convierte.`
    );
  }
  if (!existsSync(absPath)) {
    throw new Error(`No existe: ${rel}`);
  }

  const ext = path.extname(absPath).toLowerCase();
  if (ext === '.webp') {
    return { rel, skipped: true, note: 'ya es webp' };
  }

  const outPath = absPath.slice(0, -ext.length) + '.webp';
  const outRel = toRel(outPath);
  const sourceInfo = await stat(absPath);

  const metadata = await sharp(absPath).metadata();

  if (existsSync(outPath) && !options.force) {
    const existing = await stat(outPath);
    return {
      rel,
      outRel,
      skipped: true,
      note: 'ya existe (usa --force)',
      fromBytes: sourceInfo.size,
      toBytes: existing.size,
      width: metadata.width,
      height: metadata.height
    };
  }

  if (options.dryRun) {
    return {
      rel,
      outRel,
      dryRun: true,
      fromBytes: sourceInfo.size,
      width: metadata.width,
      height: metadata.height,
      maxWidth
    };
  }

  let pipeline = sharp(absPath);
  if (maxWidth) {
    pipeline = pipeline.resize({ width: maxWidth, withoutEnlargement: true });
  }
  await pipeline.webp({ quality: options.quality, effort: 6 }).toFile(outPath);

  const outInfo = await stat(outPath);
  const outMeta = await sharp(outPath).metadata();

  if (options.remove) {
    await rm(absPath);
  }

  return {
    rel,
    outRel,
    fromBytes: sourceInfo.size,
    toBytes: outInfo.size,
    width: outMeta.width,
    height: outMeta.height,
    removed: options.remove
  };
}

async function main() {
  const { options, files } = parseArgs(process.argv.slice(2));
  const targets = files.length > 0 ? files : DEFAULT_TARGETS;

  console.log('--- Conversión a WebP ---');
  console.log(
    `calidad=${options.quality}  max-width=${options.maxWidth ?? 'sin límite'}  ` +
      `borrar-original=${options.remove}  ${options.dryRun ? '(dry-run)' : ''}`
  );
  console.log('');

  let totalFrom = 0;
  let totalTo = 0;
  const failures = [];

  for (const target of targets) {
    try {
      const result = await convertOne(target, options);
      if (result.skipped) {
        console.log(`= ${result.rel}  (${result.note})`);
        continue;
      }
      if (result.dryRun) {
        const planned = result.maxWidth ? `${result.maxWidth}px (desde ${result.width}x${result.height})` : `${result.width}x${result.height}`;
        console.log(`~ ${result.rel} -> ${result.outRel}  ${kb(result.fromBytes)}  ${planned}`);
        continue;
      }
      const saved = result.fromBytes - result.toBytes;
      const pct = ((saved / result.fromBytes) * 100).toFixed(1);
      totalFrom += result.fromBytes;
      totalTo += result.toBytes;
      const flag = result.removed ? ' [original borrado]' : ' [original conservado]';
      console.log(
        `+ ${result.rel} -> ${result.outRel}  ` +
          `${kb(result.fromBytes)} -> ${kb(result.toBytes)}  (-${pct}%)  ${result.width}x${result.height}${flag}`
      );
    } catch (error) {
      failures.push(String(error.message ?? error));
      console.error(`x ${typeof target === 'string' ? target : target.path}: ${error.message ?? error}`);
    }
  }

  if (totalFrom > 0) {
    const saved = totalFrom - totalTo;
    const pct = ((saved / totalFrom) * 100).toFixed(1);
    console.log('');
    console.log(`Total: ${kb(totalFrom)} -> ${kb(totalTo)}  (ahorro ${kb(saved)}, -${pct}%)`);
  }

  if (failures.length > 0) {
    console.error('');
    console.error(`${failures.length} error(es).`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exitCode = 1;
});

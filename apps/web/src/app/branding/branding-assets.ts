/** Marca pública Phoeve. Los identificadores técnicos @eventlens/* permanecen. */
export interface CorporateBrandAsset {
  readonly name: string;
  readonly path: string;
  readonly role: 'primary' | 'dark' | 'grayscale' | 'favicon';
  readonly sourceFile: string;
  readonly sourceSha256: string;
  readonly description: string;
}

/** PNGs publicados bit a bit desde los originales de docs/branding/assets/phoeve/. */
export const CORPORATE_BRAND_ASSETS: readonly CorporateBrandAsset[] = [
  {
    name: 'logo-primary.png',
    path: 'assets/branding/phoeve/logo-primary.png',
    role: 'primary',
    sourceFile: 'logo_phoeve.png',
    sourceSha256: '8a6570fa1455b9e7c461f70e6b6ab295ecfcd1dc5629e4a329451211e191d662',
    description: 'Phoeve en azul y coral para fondos claros'
  },
  {
    name: 'logo-dark.png',
    path: 'assets/branding/phoeve/logo-dark.png',
    role: 'dark',
    sourceFile: 'fondo oscuro.png',
    sourceSha256: '8fd8d3f4234a9626aab5f9e618c1ef66b13426923d371e9a81e0af9e82975bf4',
    description: 'Phoeve blanco y coral para fondos oscuros'
  },
  {
    name: 'logo-grayscale.png',
    path: 'assets/branding/phoeve/logo-grayscale.png',
    role: 'grayscale',
    sourceFile: 'escala de grises.png',
    sourceSha256: '1109330d9770b37988cc89c99dc0b65216004a66fa02f8069e30d03c0314fb7d',
    description: 'Phoeve en escala de grises'
  },
  {
    name: 'favicon.png',
    path: 'assets/branding/phoeve/favicon.png',
    role: 'favicon',
    sourceFile: 'logo_favicon.png',
    sourceSha256: 'f899bf6bfba49c1a21cf7a6be2d51785985c8daa8190e29f6f1250745d780799',
    description: 'Monograma PE candidato para favicon'
  }
];

export function resolveBrandAssetUrl(assetRelativePath: string, baseHref: string = '/'): string {
  const normalizedBase = baseHref.endsWith('/') ? baseHref : `${baseHref}/`;
  const normalizedPath = assetRelativePath.startsWith('/') ? assetRelativePath.slice(1) : assetRelativePath;
  return `${normalizedBase}${normalizedPath}`;
}

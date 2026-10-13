/** Catálogo de identidad pública Phoeve. Los identificadores técnicos EventLens no cambian. */
export interface CorporateBrandAsset {
  readonly name: string;
  readonly path: string;
  readonly role: 'primary' | 'dark' | 'grayscale' | 'favicon';
  readonly sourceFile: string;
  readonly sourceSha256: string;
  readonly description: string;
}

/** Contornos SVG transparentes derivados de PNG recibidos; aprobación visual definitiva pendiente. */
export const CORPORATE_BRAND_ASSETS: readonly CorporateBrandAsset[] = [
  {
    name: 'logo-primary.svg',
    path: 'assets/branding/phoeve/logo-primary.svg',
    role: 'primary',
    sourceFile: 'logo_phoeve.png',
    sourceSha256: '3ebbda2aac74546cb8efec0cbc6c4ee53b4c7b9ad86e513913b2c824100b36ba',
    description: 'Phoeve principal sobre fondos claros'
  },
  {
    name: 'logo-dark.svg',
    path: 'assets/branding/phoeve/logo-dark.svg',
    role: 'dark',
    sourceFile: 'fondo oscuro.png',
    sourceSha256: '1a67252429c007d4fff7d3006abc28a80ad2856e1691ca32d50abae83a38dfd5',
    description: 'Phoeve en blanco y coral sobre fondos oscuros'
  },
  {
    name: 'logo-grayscale.svg',
    path: 'assets/branding/phoeve/logo-grayscale.svg',
    role: 'grayscale',
    sourceFile: 'escala de grises.png',
    sourceSha256: '4f3ec255220aa04d11d9a61e3458f39602015c7a917df7a573e826cd52182473',
    description: 'Phoeve en escala de grises'
  },
  {
    name: 'favicon.svg',
    path: 'assets/branding/phoeve/favicon.svg',
    role: 'favicon',
    sourceFile: 'logo_favicon.png',
    sourceSha256: 'c20f5587864a5e42f3b37f639369c90defa1904015775d26ab4d62584feb517a',
    description: 'Monograma PE compacto de Phoeve'
  }
];

export function resolveBrandAssetUrl(assetRelativePath: string, baseHref: string = '/'): string {
  const normalizedBase = baseHref.endsWith('/') ? baseHref : `${baseHref}/`;
  const normalizedPath = assetRelativePath.startsWith('/') ? assetRelativePath.slice(1) : assetRelativePath;
  return `${normalizedBase}${normalizedPath}`;
}

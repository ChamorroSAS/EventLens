export interface CorporateBrandAsset {
  readonly name: string;
  readonly path: string;
  readonly role: 'primary' | 'dark' | 'grayscale' | 'favicon';
  readonly sourcePage: number;
  readonly sha256: string;
  readonly description: string;
}

export const CORPORATE_BRAND_ASSETS: readonly CorporateBrandAsset[] = [
  {
    name: 'logo-primary.svg',
    path: 'assets/branding/logo-primary.svg',
    role: 'primary',
    sourcePage: 2,
    sha256: 'd21623b6bbf80f7c80a0302c44b74000956496de82d27ddd9cbc1140aa086900',
    description: 'Logotipo oficial horizontal para superficies claras'
  },
  {
    name: 'logo-dark.svg',
    path: 'assets/branding/logo-dark.svg',
    role: 'dark',
    sourcePage: 3,
    sha256: '6764599518ff8da2fc460cda4793e4b823fcd9260964ac2858d97c06d5493af4',
    description: 'Variante de logotipo para fondo oscuro'
  },
  {
    name: 'logo-grayscale.svg',
    path: 'assets/branding/logo-grayscale.svg',
    role: 'grayscale',
    sourcePage: 4,
    sha256: '9e09d99ba51ca2733275fe8b57bd25f8aacaf35bba397655ea8e3708c944eafb',
    description: 'Reproducción de logotipo en escala de grises'
  },
  {
    name: 'favicon.svg',
    path: 'assets/branding/favicon.svg',
    role: 'favicon',
    sourcePage: 5,
    sha256: '6feacde4cbb7ab8c84543b4a4ca082522395bc5240938ffb4235a6e7410a11c2',
    description: 'Monograma EL candidato compacto para pestaña y favicon'
  }
];

export function resolveBrandAssetUrl(assetRelativePath: string, baseHref: string = '/'): string {
  const normalizedBase = baseHref.endsWith('/') ? baseHref : `${baseHref}/`;
  const normalizedPath = assetRelativePath.startsWith('/') ? assetRelativePath.slice(1) : assetRelativePath;
  return `${normalizedBase}${normalizedPath}`;
}

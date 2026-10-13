import { CORPORATE_BRAND_ASSETS, resolveBrandAssetUrl } from './branding-assets';

describe('Phoeve active brand assets (CR-006)', () => {
  it('references exactly the four canonical PNGs and their immutable source hashes', () => {
    expect(CORPORATE_BRAND_ASSETS.map(x => x.name)).toEqual([
      'logo-primary.png', 'logo-dark.png', 'logo-grayscale.png', 'favicon.png'
    ]);
    expect(CORPORATE_BRAND_ASSETS.map(x => x.sourceFile)).toEqual([
      'logo_phoeve.png', 'fondo oscuro.png', 'escala de grises.png', 'logo_favicon.png'
    ]);
    for (const asset of CORPORATE_BRAND_ASSETS) {
      expect(asset.path).toBe(`assets/branding/phoeve/${asset.name}`);
      expect(asset.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it('resolves image URL with root and prefixed base href', () => {
    expect(resolveBrandAssetUrl('assets/branding/phoeve/favicon.png', '/'))
      .toBe('/assets/branding/phoeve/favicon.png');
    expect(resolveBrandAssetUrl('assets/branding/phoeve/logo-primary.png', '/phoeve-preview/'))
      .toBe('/phoeve-preview/assets/branding/phoeve/logo-primary.png');
    expect(resolveBrandAssetUrl('assets/branding/phoeve/favicon.png', '/phoeve-preview'))
      .toBe('/phoeve-preview/assets/branding/phoeve/favicon.png');
  });
});

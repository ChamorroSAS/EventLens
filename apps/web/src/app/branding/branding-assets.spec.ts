import { CORPORATE_BRAND_ASSETS, resolveBrandAssetUrl } from './branding-assets';

describe('Phoeve corporate branding assets (CR-006)', () => {
  it('defines four transparent SVG derivatives with verifiable PNG source metadata', () => {
    expect(CORPORATE_BRAND_ASSETS).toHaveLength(4);
    expect(CORPORATE_BRAND_ASSETS.map(a => a.name)).toEqual([
      'logo-primary.svg', 'logo-dark.svg', 'logo-grayscale.svg', 'favicon.svg'
    ]);
    expect(CORPORATE_BRAND_ASSETS.map(a => a.sourceFile)).toEqual([
      'logo_phoeve.png', 'fondo oscuro.png', 'escala de grises.png', 'logo_favicon.png'
    ]);
    for (const asset of CORPORATE_BRAND_ASSETS) {
      expect(asset.path).toBe(`assets/branding/phoeve/${asset.name}`);
      expect(asset.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('resolves Phoeve artwork relative to root or prefix base href', () => {
    expect(resolveBrandAssetUrl('assets/branding/phoeve/favicon.svg', '/'))
      .toBe('/assets/branding/phoeve/favicon.svg');
    expect(resolveBrandAssetUrl('assets/branding/phoeve/logo-primary.svg', '/phoeve-preview/'))
      .toBe('/phoeve-preview/assets/branding/phoeve/logo-primary.svg');
    expect(resolveBrandAssetUrl('assets/branding/phoeve/favicon.svg', '/phoeve-preview'))
      .toBe('/phoeve-preview/assets/branding/phoeve/favicon.svg');
  });

  it('keeps SVG favicon URL base-relative, without absolute leading slash', () => {
    const linkTag = '<link rel="icon" type="image/svg+xml" href="assets/branding/phoeve/favicon.svg">';
    expect(linkTag).toContain('href="assets/branding/phoeve/favicon.svg"');
    expect(linkTag).not.toContain('href="/assets/');
  });
});

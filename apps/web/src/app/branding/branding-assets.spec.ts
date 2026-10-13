import { CORPORATE_BRAND_ASSETS, resolveBrandAssetUrl } from './branding-assets';

describe('Corporate branding assets (EL-TK-203)', () => {
  it('defines exactly the 4 approved corporate assets with provenance metadata', () => {
    expect(CORPORATE_BRAND_ASSETS).toHaveLength(4);

    const assetNames = CORPORATE_BRAND_ASSETS.map(a => a.name);
    expect(assetNames).toEqual([
      'logo-primary.svg',
      'logo-dark.svg',
      'logo-grayscale.svg',
      'favicon.svg'
    ]);

    // Explicitly excludes birthday pilot and master PDF from corporate public runtime
    expect(assetNames).not.toContain('logo-birthday.svg');
    expect(assetNames).not.toContain('EventLens-logo.pdf');

    for (const asset of CORPORATE_BRAND_ASSETS) {
      expect(asset.path).toMatch(/^assets\/branding\/.+\.svg$/);
      expect(asset.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(asset.sourcePage).toBeGreaterThanOrEqual(2);
      expect(asset.sourcePage).toBeLessThanOrEqual(5);
    }
  });

  describe('Base href relative resolution', () => {
    it('resolves asset URLs relative to root base href (/)', () => {
      const faviconUrl = resolveBrandAssetUrl('assets/branding/favicon.svg', '/');
      expect(faviconUrl).toBe('/assets/branding/favicon.svg');

      const primaryUrl = resolveBrandAssetUrl('assets/branding/logo-primary.svg', '/');
      expect(primaryUrl).toBe('/assets/branding/logo-primary.svg');
    });

    it('resolves asset URLs relative to prefixed base href (/eventlens/)', () => {
      const faviconUrl = resolveBrandAssetUrl('assets/branding/favicon.svg', '/eventlens/');
      expect(faviconUrl).toBe('/eventlens/assets/branding/favicon.svg');

      const primaryUrl = resolveBrandAssetUrl('assets/branding/logo-primary.svg', '/eventlens/');
      expect(primaryUrl).toBe('/eventlens/assets/branding/logo-primary.svg');
    });

    it('handles base href without trailing slash gracefully', () => {
      const faviconUrl = resolveBrandAssetUrl('assets/branding/favicon.svg', '/eventlens');
      expect(faviconUrl).toBe('/eventlens/assets/branding/favicon.svg');
    });
  });

  describe('Favicon link integration', () => {
    it('verifies relative favicon link structure without leading slash', () => {
      const linkTag = `<link rel="icon" type="image/svg+xml" href="assets/branding/favicon.svg">`;
      expect(linkTag).toContain('rel="icon"');
      expect(linkTag).toContain('type="image/svg+xml"');
      expect(linkTag).toContain('href="assets/branding/favicon.svg"');
      expect(linkTag).not.toContain('href="/assets/branding/favicon.svg"');
    });
  });
});

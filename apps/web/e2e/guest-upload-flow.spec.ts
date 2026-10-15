import { expect, test } from '@playwright/test';

test.describe('Guest Upload Flow — EL-TK-211/214/094', () => {
  const apiOrigin = process.env.API_BASE_URL || 'http://localhost:3000';

  test('guest can upload photo via presigned URL', async ({ page, request }) => {
    // 1. Create test event + access via API (seed)
    // Use existing test event or create via API
    const eventId = 'ee43dc6d-016f-4d79-a49c-8e212e36b2c0'; // existing test event (Cumpleaños de Nestor)
    const lookupKey = '4JTxLrk6iVMFRW3w75bAHfoq'; // existing valid lookup key

    // 2. Navigate to guest entry
    await page.goto(`/g/${lookupKey}`);
    await expect(page.locator('el-guest-container')).toBeVisible();

    // 3. Handle PIN/consent/nickname if needed
    // Check if PIN form is visible
    if (await page.locator('el-pin-access-form').isVisible({ timeout: 2000 }).catch(() => false)) {
      await page.fill('input[type="password"]', '1234'); // PIN from test data
      await page.click('button[type="submit"]');
    }

    // Handle consent
    if (await page.locator('el-consent-sheet').isVisible({ timeout: 2000 }).catch(() => false)) {
      const continueBtn = page.locator('el-consent-sheet button:has-text("Continuar")');
      await expect(continueBtn).toBeVisible({ timeout: 5000 });
      const checkboxes = page.locator('el-consent-sheet input[type="checkbox"]');
      for (let i = 0; i < await checkboxes.count(); i++) {
        await checkboxes.nth(i).check({ force: true });
      }
      await continueBtn.click();
    }

    // Handle nickname
    if (await page.locator('el-guest-identity-form').isVisible({ timeout: 2000 }).catch(() => false)) {
      await page.fill('input[name="nickname"]', 'Test User');
      await page.click('button:has-text("Continuar")');
    }

    // 4. Wait for upload container
    // The upload container appears when guest has active session, consented, and has nickname
    await expect(page.locator('eventlens-upload-container')).toBeVisible({ timeout: 10000 });

    // 5. Drop test file (create small test image)
    const testFile = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'); // 1x1 transparent PNG
    const fileInput = page.locator('eventlens-upload-container input[type="file"]').first();
    await fileInput.setInputFiles({
      name: 'test.png',
      mimeType: 'image/png',
      buffer: testFile,
    });

    // 6. Verify progress reaches 100% and status RECEIVED
    // Wait for upload progress summary to appear
    await expect(page.locator('eventlens-upload-progress-summary')).toBeVisible();
    
    // Wait for upload to complete (status RECEIVED)
    await expect(page.locator('text=Recibido ✓').first()).toBeVisible({ timeout: 30000 });

    // 7. Verify API confirm called (check network or response)
    // Could verify by checking the upload item shows as completed
    await expect(page.locator('eventlens-upload-file-item')).toHaveClass(/item-received/);
  });
});
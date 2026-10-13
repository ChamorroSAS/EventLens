import { expect, test } from '@playwright/test';

test('platform starts and exposes the generated public HTTP contract', async ({ page, request }) => {
  const apiOrigin = process.env.API_BASE_URL || 'http://localhost:3000';
  const readiness = await request.get(`${apiOrigin}/api/v1/health/ready`);
  expect(readiness.status()).toBe(200);
  const openapi = await request.get(`${apiOrigin}/api/v1/openapi.json`);
  expect(openapi.ok()).toBe(true);
  const contract = await openapi.json();
  expect(contract.paths['/api/v1/health/ready'].get.operationId).toBe('getReadiness');
  const docs = await request.get(`${apiOrigin}/api/docs`);
  expect(docs.ok()).toBe(true);

  await page.goto('/');
  await expect(page.getByRole('link', { name: /EventLens/i })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Tu evento termina. Sus recuerdos continúan.'
  );
});

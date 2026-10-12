import { expect, test } from '@playwright/test';

test('reaches the draft form from the platform home', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Crear borrador de evento' }).click();
  await expect(page.getByRole('heading', { name: 'Crear borrador de evento' })).toBeVisible();
});

test('validates the name field and cancels back to the dashboard', async ({ page }) => {
  await page.goto('/events/new');
  await expect(page.getByRole('heading', { name: 'Crear borrador de evento' })).toBeVisible();

  const name = page.getByLabel('Nombre del evento');
  await expect(name).toBeVisible();

  await page.getByRole('button', { name: 'Crear borrador' }).click();
  await expect(page.getByText('Escribe un nombre para el evento.')).toBeVisible();

  await name.fill('Boda de Ana');
  await expect(page.getByText('Escribe un nombre para el evento.')).toBeHidden();

  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page).toHaveURL('/');
});

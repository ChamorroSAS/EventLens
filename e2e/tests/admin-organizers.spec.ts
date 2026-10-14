import { expect, test } from '@playwright/test';

/**
 * EL-TK-242: administración de organizadores Beta.
 *
 * The guard/transport denials always run. The credentialed UI flow runs only when
 * EVENTLENS_E2E_ADMIN_IDENTIFIER and EVENTLENS_E2E_ADMIN_SECRET are provided by an
 * environment that has bootstrapped an administrative principal.
 */
const apiOrigin = process.env.API_BASE_URL || 'http://localhost:3000';
const identifier = process.env.EVENTLENS_E2E_ADMIN_IDENTIFIER;
const secret = process.env.EVENTLENS_E2E_ADMIN_SECRET;

test.describe('EL-TK-242: administración de organizadores Beta', () => {
  test('una sesión administrativa ausente se redirige al acceso con returnUrl allowlisted', async ({ page }) => {
    await page.goto('/admin/organizadores');
    await expect(page).toHaveURL(/\/admin\/ingresar\?returnUrl=/);
    const url = new URL(page.url());
    expect(url.searchParams.get('returnUrl')).toBe('/admin/organizadores');
    await expect(page.getByRole('heading', { name: 'Acceso administrativo' })).toBeVisible();
  });

  test('el transporte administrativo deniega sin sesión y responde JSON, nunca HTML', async ({ request }) => {
    const list = await request.get(`${apiOrigin}/api/v1/admin/organizers`);
    expect([401, 403]).toContain(list.status());
    expect(list.headers()['content-type'] || '').toContain('application/json');

    const mutation = await request.post(`${apiOrigin}/api/v1/admin/organizers`, {
      data: { email: 'denied@example.test', reason: 'denied', idempotencyKey: '00000000-0000-4000-8000-000000000000' }
    });
    expect([401, 403]).toContain(mutation.status());
    expect(mutation.headers()['content-type'] || '').toContain('application/json');
  });

  test('la ruta pública de cambio de contraseña redirige a ingreso sin sesión', async ({ page }) => {
    await page.goto('/cambiar-contrasena');
    await expect(page).toHaveURL(/\/ingresar/);
  });

  test.describe('flujo autenticado', () => {
    test.skip(!identifier || !secret, 'Requiere EVENTLENS_E2E_ADMIN_IDENTIFIER y EVENTLENS_E2E_ADMIN_SECRET');

    test('crea, gestiona, deshabilita, habilita y regenera la credencial temporal', async ({ page }) => {
      await page.goto('/admin/ingresar');
      await page.getByLabel('Identificador administrativo').fill(identifier!);
      await page.getByLabel('Credencial de acceso').fill(secret!);
      await page.getByRole('button', { name: 'Iniciar sesión' }).click();
      await page.goto('/admin/organizadores');
      await expect(page.getByRole('heading', { name: 'Organizadores Beta' })).toBeVisible();

      const email = `e2e-${Date.now()}@example.test`;

      // Create a Beta account and capture the one-time temporary credential.
      await page.getByRole('button', { name: 'Crear organizador' }).click();
      await page.getByLabel('Correo de ingreso').fill(email);
      await page.getByLabel('Nombre (opcional)').fill('E2E Beta');
      await page.getByLabel('Motivo de la operación').fill('Creación E2E');
      await page.getByRole('button', { name: 'Crear cuenta' }).click();
      const temporary = page.locator('#temporary-password');
      await expect(temporary).toBeVisible();
      await expect(temporary).not.toHaveValue('');
      await page.getByRole('button', { name: 'Ya guardé la credencial' }).click();

      // Manage the account: the email stays read-only.
      await page.getByRole('button', { name: `Gestionar cuenta de ${email}` }).click();
      await expect(page.getByLabel('Correo de ingreso')).toHaveAttribute('readonly', '');

      // Disable access (events preserved), then enable it again.
      await page.getByRole('button', { name: 'Deshabilitar acceso' }).click();
      await page.getByRole('button', { name: 'Confirmar' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Cuenta actualizada' })).toBeVisible();

      await page.getByRole('button', { name: `Gestionar cuenta de ${email}` }).click();
      await page.getByRole('button', { name: 'Habilitar acceso' }).click();
      await page.getByRole('button', { name: 'Confirmar' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Cuenta actualizada' })).toBeVisible();

      // Regenerate the temporary credential with explicit confirmation.
      await page.getByRole('button', { name: `Gestionar cuenta de ${email}` }).click();
      await page.getByRole('button', { name: 'Generar nueva contraseña temporal' }).click();
      await page.getByRole('button', { name: 'Confirmar' }).click();
      await expect(temporary).toBeVisible();
      await expect(temporary).not.toHaveValue('');
    });
  });
});

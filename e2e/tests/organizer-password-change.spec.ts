import { expect, test } from '@playwright/test';

/**
 * EL-TK-242: primer acceso con cambio obligatorio de contraseña.
 *
 * The anonymous guard behaviour always runs. The credentialed flow runs only when
 * EVENTLENS_E2E_ADMIN_IDENTIFIER and EVENTLENS_E2E_ADMIN_SECRET are provided, since
 * it provisions an organizer through the administrative console first.
 */
const identifier = process.env.EVENTLENS_E2E_ADMIN_IDENTIFIER;
const secret = process.env.EVENTLENS_E2E_ADMIN_SECRET;

test.describe('EL-TK-242: cambio obligatorio de contraseña', () => {
  test('una visita anónima a /cambiar-contrasena vuelve al ingreso', async ({ page }) => {
    await page.goto('/cambiar-contrasena');
    await expect(page).toHaveURL(/\/ingresar/);
  });

  test.describe('flujo autenticado', () => {
    test.skip(!identifier || !secret, 'Requiere EVENTLENS_E2E_ADMIN_IDENTIFIER y EVENTLENS_E2E_ADMIN_SECRET');

    test('el primer ingreso exige cambiar la contraseña y revoca la temporal', async ({ page, context }) => {
      const email = `e2e-pw-${Date.now()}@example.test`;

      // Provision the account from the administrative console.
      await page.goto('/admin/ingresar');
      await page.getByLabel('Identificador administrativo').fill(identifier!);
      await page.getByLabel('Credencial de acceso').fill(secret!);
      await page.getByRole('button', { name: 'Iniciar sesión' }).click();
      await page.goto('/admin/organizadores');
      await page.getByRole('button', { name: 'Crear organizador' }).click();
      await page.getByLabel('Correo de ingreso').fill(email);
      await page.getByLabel('Motivo de la operación').fill('Alta E2E de contraseña');
      await page.getByRole('button', { name: 'Crear cuenta' }).click();
      const temporary = (await page.locator('#temporary-password').inputValue()).trim();
      expect(temporary.length).toBeGreaterThan(0);
      await page.getByRole('button', { name: 'Ya guardé la credencial' }).click();

      // End the administrative session before acting as the organizer.
      await context.clearCookies();

      // First organizer sign-in lands on the forced password change.
      await page.goto('/ingresar');
      await page.getByLabel('Correo electrónico').fill(email);
      await page.getByLabel('Contraseña').fill(temporary);
      await page.getByRole('button', { name: 'Iniciar sesión' }).click();
      await expect(page).toHaveURL(/\/cambiar-contrasena/);
      await expect(page.getByRole('heading', { name: 'Cambia tu contraseña' })).toBeVisible();

      // The change requires the adult declaration and a different password.
      const newPassword = 'nueva-contrasena-e2e-larga';
      await page.getByLabel('Contraseña temporal actual').fill(temporary);
      await page.getByLabel('Nueva contraseña').fill(newPassword);
      await page.getByLabel('Confirma la nueva contraseña').fill(newPassword);
      await page.getByRole('button', { name: 'Guardar contraseña' }).click();
      await expect(page.getByRole('alert')).toContainText('mayor de edad');

      await page.getByLabel(/Declaro que soy mayor de edad/).check();
      await page.getByRole('button', { name: 'Guardar contraseña' }).click();
      await expect(page).toHaveURL(/\/ingresar\?passwordChanged=1/);
      await expect(page.getByRole('status')).toContainText('Contraseña actualizada');

      // The temporary credential no longer works; the new one signs in normally.
      await page.getByLabel('Contraseña').fill(temporary);
      await page.getByRole('button', { name: 'Iniciar sesión' }).click();
      await expect(page.getByRole('alert')).toBeVisible();

      await page.getByLabel('Correo electrónico').fill(email);
      await page.getByLabel('Contraseña').fill(newPassword);
      await page.getByRole('button', { name: 'Iniciar sesión' }).click();
      await expect(page).toHaveURL(/\/mis-eventos/);
    });
  });
});

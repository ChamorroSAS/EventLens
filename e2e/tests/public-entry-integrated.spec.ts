import { expect, test } from '@playwright/test';

test.describe('EL-TK-214: Validación integrada de entrada pública', () => {
  const apiOrigin = process.env.API_BASE_URL || 'http://localhost:3000';

  test('Recorrido 1: Home público estático, contenido canónico y navegación de anclas', async ({ page }) => {
    await page.goto('/');

    // Encabezado principal y wordmark de marca
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Tu evento termina. Sus recuerdos continúan.'
    );
    await expect(page.getByRole('link', { name: /EventLens/i })).toBeVisible();

    // Secciones canónicas del handoff editorial
    await expect(page.locator('#como-funciona')).toBeVisible();
    await expect(page.locator('#beneficios')).toBeVisible();
    await expect(page.locator('#privacidad')).toBeVisible();
    await expect(page.locator('#preguntas-frecuentes')).toBeVisible();

    // Preguntas frecuentes semánticas
    const faqList = page.locator('dl.el-faq-list');
    await expect(faqList).toBeVisible();
    await expect(page.getByText('¿Qué es EventLens?')).toBeVisible();
    await expect(page.getByText('¿Cómo funciona el código QR?')).toBeVisible();

    // Footer legal minimalista
    await expect(page.locator('footer')).toContainText('EventLens');
    await expect(page.locator('footer')).toContainText('2026');
  });

  test('Recorrido 2: Navegación de entrada anónima hacia Iniciar sesión y Solicitar acceso', async ({ page }) => {
    await page.goto('/');

    // Enlace de Iniciar sesión en cabecera
    const loginLink = page.getByRole('link', { name: /iniciar sesión/i }).first();
    await expect(loginLink).toBeVisible();
    await loginLink.click();
    await expect(page).toHaveURL(/\/ingresar$/);

    // Regreso a inicio y navegación a Solicitar acceso
    await page.goto('/');
    const betaLink = page.getByRole('link', { name: /solicitar acceso/i }).first();
    await expect(betaLink).toBeVisible();
    await betaLink.click();
    await expect(page).toHaveURL(/\/solicitar-acceso$/);
  });

  test('Recorrido 3: Guest entry directo (/g/:lookupKey) monta el contenedor de invitado', async ({ page }) => {
    await page.goto('/g/test-public-guest-key-12345');

    // Debe resolver la ruta /g/:lookupKey y montar el contenedor guest de EventLens
    await expect(page).toHaveURL(/\/g\/test-public-guest-key-12345$/);
    await expect(page.locator('el-guest-container')).toBeVisible();
  });

  test('Recorrido 4: Ruta SPA inexistente muestra 404 controlado de la aplicación', async ({ page }) => {
    await page.goto('/ruta-desconocida-no-existente');

    // Muestra la vista 404 aprobada con opción de retorno al inicio
    await expect(page.locator('eventlens-public-not-found')).toBeVisible();
    const homeLink = page.getByRole('link', { name: /volver al inicio|inicio/i });
    await expect(homeLink).toBeVisible();
    await homeLink.click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('Límites de transporte: /api inexistente devuelve 404 y no absorbe index.html', async ({ request }) => {
    const res = await request.get(`${apiOrigin}/api/v1/ruta-inexistente-segura`);
    expect(res.status()).toBe(404);
    const contentType = res.headers()['content-type'] || '';
    expect(contentType).toContain('application/json');
    expect(contentType).not.toContain('text/html');
  });

  test('Accesibilidad y menú móvil: toggle, aria-expanded y cierre con Escape', async ({ page }) => {
    // Emulamos viewport móvil estrecho (375x667)
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    const menuToggle = page.getByRole('button', { name: /menú/i });
    if (await menuToggle.isVisible()) {
      await expect(menuToggle).toHaveAttribute('aria-expanded', 'false');
      await menuToggle.click();
      await expect(menuToggle).toHaveAttribute('aria-expanded', 'true');

      // Cerrar mediante tecla Escape
      await page.keyboard.press('Escape');
      await expect(menuToggle).toHaveAttribute('aria-expanded', 'false');
    }
  });
});

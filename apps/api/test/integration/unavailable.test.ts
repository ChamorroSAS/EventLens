import { expect, it } from 'vitest';
import { createApplication } from '../../dist/application.js';
import { readConfig } from '../../dist/platform/config/config.js';
it('keeps liveness independent and readiness fails closed without leaking credentials',async () => {
  // Preserve the runner's database/role identity; simulate transport failure,
  // rather than asking the safety guard to authorize a foreign database.
  if (!process.env.DATABASE_URL) throw new Error('ISOLATED_TEST_RUNNER_REQUIRED');
  const unreachable = new URL(process.env.DATABASE_URL);
  unreachable.hostname = '127.0.0.1'; unreachable.port = '1';
  const {app} = await createApplication(readConfig({DATABASE_URL:unreachable.href,DATABASE_TIMEOUT_MS:'500'}));
  try {
    await app.listen(0,'127.0.0.1'); const base = await app.getUrl();
    expect((await fetch(base+'/api/v1/health/live')).status).toBe(200);
    const started = performance.now(); const response = await fetch(base+'/api/v1/health/ready');
    expect(response.status).toBe(503);
    const body = await response.json() as any;
    expect(body.code).toBe('DEPENDENCY_UNAVAILABLE'); expect(JSON.stringify(body)).not.toMatch(/secret|never|127\.0\.0\.1/);
    // Assert booleans so a failed test cannot print the runner's credentials.
    const serialized = JSON.stringify(body);
    expect(serialized.includes(decodeURIComponent(unreachable.password)) || serialized.includes(decodeURIComponent(unreachable.username))).toBe(false);
    expect(performance.now()-started).toBeLessThan(5000);
  } finally { await app.close(); }
});

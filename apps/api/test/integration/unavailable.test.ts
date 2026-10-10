import { expect, it } from 'vitest';
import { createApplication } from '../../dist/application.js';
import { readConfig } from '../../dist/platform/config/config.js';
it('keeps liveness independent and readiness fails closed without leaking credentials',async () => {
  const {app} = await createApplication(readConfig({DATABASE_URL:'postgresql://never:secret@127.0.0.1:1/unreachable',DATABASE_TIMEOUT_MS:'500'}));
  try {
    await app.listen(0,'127.0.0.1'); const base = await app.getUrl();
    expect((await fetch(base+'/api/v1/health/live')).status).toBe(200);
    const started = performance.now(); const response = await fetch(base+'/api/v1/health/ready');
    expect(response.status).toBe(503);
    const body = await response.json() as any;
    expect(body.code).toBe('DEPENDENCY_UNAVAILABLE'); expect(JSON.stringify(body)).not.toMatch(/secret|never|127\.0\.0\.1/);
    expect(performance.now()-started).toBeLessThan(5000);
  } finally { await app.close(); }
});

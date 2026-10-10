import { createApplication } from './application.js';
import { readConfig } from './platform/config/config.js';
async function main() {
  const config = readConfig(process.env);
  const {app} = await createApplication(config);
  app.enableShutdownHooks();
  await app.listen(config.port,config.host);
  console.log('EventLens API listening');
}
main().catch(() => { console.error('API_STARTUP_FAILED: revise la configuración y las dependencias.'); process.exitCode=1; });

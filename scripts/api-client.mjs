import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const clientPackage = new URL('../packages/api-client/package.json', import.meta.url);
const requireClient = createRequire(clientPackage);
// Resolve the library from its owning workspace package using its CommonJS
// export condition. Dynamic import of this resolved CJS file wraps exports
// in another default object, rather than exposing the generator function.
const { default: openapiTS, astToString } = requireClient('openapi-typescript');
const documentUrl = new URL('../contracts/openapi.json', import.meta.url);
const outputUrl = new URL('../packages/api-client/src/schema.ts', import.meta.url);
const schema = JSON.parse(await readFile(documentUrl, 'utf8'));
const output = '// Generated from contracts/openapi.json. Run pnpm client:generate; do not edit.\n' + astToString(await openapiTS(schema));
if (process.argv.includes('--check')) {
  const current = await readFile(outputUrl, 'utf8').catch(() => '');
  if (current !== output) throw new Error('Generated API client is stale. Run pnpm client:generate.');
  console.log('Generated API client matches the OpenAPI contract.');
} else {
  await writeFile(outputUrl, output);
  console.log(`Generated ${fileURLToPath(outputUrl)}`);
}

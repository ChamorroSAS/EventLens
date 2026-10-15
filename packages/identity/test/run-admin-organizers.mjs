import { spawnSync } from 'node:child_process';
import { withIsolatedTestDatabase } from '../../../scripts/isolated-tests.mjs';
const status=await withIsolatedTestDatabase(async env=>{
 const migrate=spawnSync(process.execPath,['scripts/database.mjs','migrate'],{env,stdio:'inherit'});
 if(migrate.status!==0)throw new Error('ISOLATED_SCHEMA_MIGRATION_FAILED');
 const tests=spawnSync('pnpm',['--filter','@eventlens/identity','exec','vitest','run','test/admin-organizer-management.integration.test.ts','--no-file-parallelism'],{env,stdio:'inherit'});
 return tests.status??1;
});
process.exitCode=status;

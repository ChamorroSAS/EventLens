import { spawn } from 'node:child_process';
import { mkdir, rename } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../',import.meta.url));
const folder = resolve(root,'.local/backups');
const operation = process.argv[2];
function docker(args) {
  const child = spawn('docker',['compose','exec','-T','postgres',...args],{cwd:root,stdio:['pipe','pipe','inherit']});
  const done = new Promise((yes,no) => { child.on('error',no); child.on('exit',code => code === 0 ? yes() : no(new Error('BACKUP_COMMAND_FAILED'))); });
  return {child,done};
}
await mkdir(folder,{recursive:true});
if (operation === 'backup') {
  const path = resolve(folder,`postgres-${new Date().toISOString().replaceAll(':','-')}.dump`);
  const {child,done} = docker(['sh','-c','exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc']);
  child.stdin.end();
  await Promise.all([pipeline(child.stdout,createWriteStream(path+'.partial',{flags:'wx'})),done]);
  await rename(path+'.partial',path);
  console.log(relative(root,path));
} else if (operation === 'restore') {
  const path = resolve(root,process.argv[3] ?? '');
  const target = process.argv[4];
  if (!relative(folder,path) || relative(folder,path).startsWith('..') || !/^eventlens_restore_[a-z0-9_]+$/.test(target ?? '')) throw new Error('RESTORE_REQUIRES_LOCAL_BACKUP_AND_NEW_ISOLATED_DATABASE');
  // createdb fails if the target exists; no existing database is overwritten.
  const create = docker(['sh','-c','exec createdb -U "$POSTGRES_USER" "$1"','restore',target]);
  create.child.stdin.end(); create.child.stdout.resume(); await create.done;
  const restore = docker(['sh','-c','exec pg_restore --exit-on-error --no-owner -U "$POSTGRES_USER" -d "$1"','restore',target]);
  restore.child.stdout.resume();
  await Promise.all([pipeline(createReadStream(path),restore.child.stdin),restore.done]);
  console.log(`Restored isolated database: ${target}`);
} else throw new Error('UNKNOWN_BACKUP_COMMAND');

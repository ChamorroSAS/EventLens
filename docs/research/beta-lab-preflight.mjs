// Read-only local prerequisites. Does not inspect containers, credentials or AWS.
import { execFileSync } from 'node:child_process';
import { arch, platform } from 'node:os';

function probe(command, args) {
  try {
    return { available: true, value: execFileSync(command, args, {
      encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'],
    }).trim() };
  } catch (error) {
    // Deliberately exclude stderr: daemon/proxy configuration may contain private details.
    return { available: false, error: error.code === 'ENOENT' ? 'NOT_INSTALLED' : 'PROBE_FAILED' };
  }
}
const docker = probe('docker', ['info', '--format', '{{json .Architecture}} {{json .OSType}} {{json .ServerVersion}}']);
const buildx = probe('docker', ['buildx', 'version']);
const compose = probe('docker', ['compose', 'version', '--short']);
const revision = probe('git', ['rev-parse', 'HEAD']);
const nativeArm64Host = platform() === 'linux' && arch() === 'arm64';
const blockers = ['CLOUD_ARM64_AND_CAPACITY_NOT_TESTED', 'REAL_PITR_NOT_TESTED', 'AUTHORITY_PROVIDER_PENDING', 'MEDIA_RPO_PENDING'];
if (!nativeArm64Host) blockers.push('CURRENT_NODE_HOST_NOT_NATIVE_LINUX_ARM64');
if (!docker.available) blockers.push('DOCKER_ENGINE_UNAVAILABLE');
if (!buildx.available) blockers.push('BUILDX_UNAVAILABLE');
if (!compose.available) blockers.push('COMPOSE_UNAVAILABLE');
console.log(JSON.stringify({
  checkedAt: new Date().toISOString(), purpose: 'PREPARATION_ONLY_NOT_A_TICKET_GATE',
  sourceRevision: revision.available ? revision.value : null,
  node: { version: process.version, platform: platform(), arch: arch(), nativeArm64Host },
  docker, buildx, compose, blockers,
  nativeImageCompatibility: 'NOT_TESTED', capacity: 'NOT_TESTED', readyForImplementation: false,
}, null, 2));

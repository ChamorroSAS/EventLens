import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const apiBase = process.env.GITHUB_API_URL || 'https://api.github.com';
const dryRun = /^(1|true|yes)$/i.test(process.env.DRY_RUN || 'false');

if (!repository) throw new Error('GITHUB_REPOSITORY is required');
if (!token && !dryRun) throw new Error('GITHUB_TOKEN is required unless DRY_RUN=true');

const [owner, repo] = repository.split('/');
if (!owner || !repo) throw new Error(`Invalid GITHUB_REPOSITORY: ${repository}`);

const ROOTS = [
  { dir: '.codex/product/epics', pattern: /^EL-EP-\d{3}\.md$/ },
  { dir: '.codex/product/tickets', pattern: /^EL-TK-\d{3}\.md$/ },
];

const MANAGED_MARKER_PREFIX = '<!-- eventlens-source:';

function extractId(text) {
  return text.match(/\b(EL-(?:EP|TK)-\d{3})\b/)?.[1] ?? null;
}

function parseStatus(markdown, sourcePath) {
  const lines = markdown.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => /^##\s+Status\s*$/i.test(line.trim()));
  if (headingIndex === -1) {
    throw new Error(`${sourcePath}: missing "## Status" section`);
  }

  for (let i = headingIndex + 1; i < lines.length; i += 1) {
    const value = lines[i].trim();
    if (!value) continue;
    if (value.startsWith('#')) break;
    return value.replace(/[*_`]/g, '').trim().toUpperCase();
  }

  throw new Error(`${sourcePath}: empty "## Status" section`);
}

function parseArtifact(markdown, sourcePath) {
  const expectedId = extractId(path.basename(sourcePath));
  const titleLine = markdown.split(/\r?\n/).find((line) => /^#\s+/.test(line));
  if (!titleLine) throw new Error(`${sourcePath}: missing H1 title`);

  const title = titleLine.replace(/^#\s+/, '').trim();
  const titleId = extractId(title);
  if (!expectedId || titleId !== expectedId) {
    throw new Error(`${sourcePath}: title ID (${titleId}) does not match filename ID (${expectedId})`);
  }

  const status = parseStatus(markdown, sourcePath);
  const marker = `<!-- eventlens-source: ${sourcePath} -->`;
  const body = `${markdown.trimEnd()}\n\n${marker}\n`;

  return { id: expectedId, title, status, sourcePath, body };
}

async function scanArtifacts() {
  const artifacts = [];

  for (const { dir, pattern } of ROOTS) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !pattern.test(entry.name)) continue;
      const sourcePath = path.posix.join(dir, entry.name);
      const markdown = await readFile(sourcePath, 'utf8');
      artifacts.push(parseArtifact(markdown, sourcePath));
    }
  }

  return artifacts.sort((a, b) => a.id.localeCompare(b.id));
}

async function github(method, endpoint, body) {
  const response = await fetch(`${apiBase}${endpoint}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'eventlens-product-sync',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${method} ${endpoint} failed: ${response.status} ${text}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

async function listIssues() {
  const issues = [];
  for (let page = 1; ; page += 1) {
    const batch = await github(
      'GET',
      `/repos/${owner}/${repo}/issues?state=all&per_page=100&page=${page}`,
    );
    const onlyIssues = batch.filter((item) => !item.pull_request);
    issues.push(...onlyIssues);
    if (batch.length < 100) break;
  }
  return issues;
}

function indexIssues(issues) {
  const byId = new Map();
  for (const issue of issues) {
    const titleId = extractId(issue.title || '');
    const markerId = issue.body?.includes(MANAGED_MARKER_PREFIX)
      ? extractId(issue.body)
      : null;
    const id = titleId || markerId;
    if (!id) continue;

    if (byId.has(id)) {
      throw new Error(`Duplicate GitHub issues detected for canonical ID ${id}`);
    }
    byId.set(id, issue);
  }
  return byId;
}

function isDone(status) {
  return status === 'DONE';
}

function isSuperseded(status) {
  return status === 'SUPERSEDED';
}

function describeAction(action, artifact, issue) {
  const suffix = issue ? ` (#${issue.number})` : '';
  console.log(`${action.padEnd(10)} ${artifact.id}${suffix} — ${artifact.status}`);
}

async function createIssue(artifact) {
  if (dryRun) {
    describeAction('CREATE', artifact);
    return;
  }

  const issue = await github('POST', `/repos/${owner}/${repo}/issues`, {
    title: artifact.title,
    body: artifact.body,
  });
  describeAction('CREATE', artifact, issue);

  if (isDone(artifact.status)) {
    await github('PATCH', `/repos/${owner}/${repo}/issues/${issue.number}`, {
      state: 'closed',
      state_reason: 'completed',
    });
    describeAction('CLOSE', artifact, issue);
  }
}

async function syncExistingIssue(artifact, issue) {
  const desiredState = isDone(artifact.status) ? 'closed' : 'open';
  const titleChanged = issue.title !== artifact.title;
  const bodyChanged = (issue.body || '') !== artifact.body;
  const stateChanged = issue.state !== desiredState;

  if (!titleChanged && !bodyChanged && !stateChanged) {
    describeAction('NOOP', artifact, issue);
    return;
  }

  const patch = {};
  if (titleChanged) patch.title = artifact.title;
  if (bodyChanged) patch.body = artifact.body;
  if (stateChanged) {
    patch.state = desiredState;
    if (desiredState === 'closed') patch.state_reason = 'completed';
  }

  if (dryRun) {
    describeAction(stateChanged ? (desiredState === 'closed' ? 'CLOSE' : 'REOPEN') : 'UPDATE', artifact, issue);
    return;
  }

  await github('PATCH', `/repos/${owner}/${repo}/issues/${issue.number}`, patch);
  describeAction(stateChanged ? (desiredState === 'closed' ? 'CLOSE' : 'REOPEN') : 'UPDATE', artifact, issue);
}

async function main() {
  const artifacts = await scanArtifacts();
  const activeArtifacts = artifacts.filter((artifact) => !isSuperseded(artifact.status));
  const supersededArtifacts = artifacts.filter((artifact) => isSuperseded(artifact.status));

  console.log(`Repository: ${repository}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'WRITE'}`);
  console.log(`Artifacts: ${artifacts.length} total, ${activeArtifacts.length} active, ${supersededArtifacts.length} superseded`);

  const issues = dryRun && !token ? [] : await listIssues();
  const byId = indexIssues(issues);

  for (const artifact of supersededArtifacts) {
    const existing = byId.get(artifact.id);
    if (existing) {
      console.warn(`SKIP       ${artifact.id} (#${existing.number}) — SUPERSEDED remains unmanaged on GitHub; canonical history lives only in .codex`);
    } else {
      describeAction('SKIP', artifact);
    }
  }

  for (const artifact of activeArtifacts) {
    const issue = byId.get(artifact.id);
    if (!issue) {
      await createIssue(artifact);
    } else {
      await syncExistingIssue(artifact, issue);
    }
  }

  console.log('Synchronization finished.');
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});

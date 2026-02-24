#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [k, v] = arg.split('=');
    return [k, v ?? true];
  })
);

const registry = String(args.get('--registry') || 'https://registry.npmjs.org');
const access = String(args.get('--access') || 'public');
const provenance = Boolean(args.get('--provenance'));
const githubOwner = String(
  args.get('--github-owner') ||
    process.env.GITHUB_OWNER ||
    process.env.GITHUB_REPOSITORY_OWNER ||
    ''
).toLowerCase();

const root = process.cwd();
const packagesDir = resolve(root, 'packages');
const packageDirs = readdirSync(packagesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => resolve(packagesDir, d.name));

const isGithubRegistry = registry.includes('npm.pkg.github.com');
let publishedCount = 0;
let skippedCount = 0;
const skippedReasons = new Map();

for (const dir of packageDirs) {
  const pkg = JSON.parse(readFileSync(resolve(dir, 'package.json'), 'utf8'));
  const name = String(pkg.name || '');

  if (pkg.private === true) {
    console.log(`skip private package: ${name}`);
    skippedCount++;
    skippedReasons.set('private', (skippedReasons.get('private') || 0) + 1);
    continue;
  }

  if (isGithubRegistry) {
    const m = name.match(/^@([^/]+)\//);
    const scope = m?.[1]?.toLowerCase();
    if (!scope || !githubOwner || scope !== githubOwner) {
      console.log(
        `skip github packages publish for ${name}: scope must match owner (@${githubOwner}/*)`
      );
      skippedCount++;
      skippedReasons.set('scope_mismatch', (skippedReasons.get('scope_mismatch') || 0) + 1);
      continue;
    }
  }

  const cmdArgs = ['publish', '--workspace', dir, '--registry', registry];
  if (!isGithubRegistry) {
    cmdArgs.push('--access', access);
    if (provenance) cmdArgs.push('--provenance');
  }

  console.log(`publishing ${name} -> ${registry}`);
  execFileSync('npm', cmdArgs, { stdio: 'inherit' });
  publishedCount++;
}

console.log(`publish summary: published=${publishedCount}, skipped=${skippedCount}, registry=${registry}`);
if (skippedReasons.size > 0) {
  for (const [reason, count] of skippedReasons.entries()) {
    console.log(`skip reason ${reason}: ${count}`);
  }
}

if (isGithubRegistry && publishedCount === 0) {
  console.log(
    `no package published to GitHub Packages. Ensure package scope matches repository owner (e.g. @${githubOwner || '<owner>'}/*).`
  );
}

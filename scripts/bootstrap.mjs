#!/usr/bin/env node
// Post-`npm install` setup: copies .env.example -> .env where missing, then
// generates the Prisma client, runs migrations, and seeds reference data.
// Safe to re-run — never overwrites an existing .env.
import { copyFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

const envFiles = [
  ['apps/api/.env.example', 'apps/api/.env'],
  ['apps/web/.env.example', 'apps/web/.env'],
  ['packages/database/.env.example', 'packages/database/.env'],
];

for (const [example, target] of envFiles) {
  const exampleAbs = new URL(example, `file://${root}/`).pathname;
  const targetAbs = new URL(target, `file://${root}/`).pathname;
  if (!existsSync(targetAbs) && existsSync(exampleAbs)) {
    copyFileSync(exampleAbs, targetAbs);
    console.log(`Created ${target}`);
  }
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', cwd: root, shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run('npm', ['run', 'db:generate']);
run('npm', ['run', 'db:migrate']);
run('npm', ['run', 'db:seed']);

console.log('\nBootstrap complete. Run `npm run dev` to start the API and web app.');

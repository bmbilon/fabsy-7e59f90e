import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.resolve(root, process.env.ANDERHUE_OUT_DIR || 'dist-anderhue');
const projectId = 'prj_9Nqy5wSZtRYgx1Bkpplvvq1RPh5q';
const orgId = 'team_EE3Kx2plLFZj8TgX9R1DAsWO';
const env = { ...process.env, VERCEL_PROJECT_ID: projectId, VERCEL_ORG_ID: orgId };
const linkEnv = { ...process.env };
delete linkEnv.VERCEL_PROJECT_ID;
delete linkEnv.VERCEL_ORG_ID;
function run(command, args, cwd, commandEnv = env) {
  const result = spawnSync(command, args, { cwd, env: commandEnv, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

run(process.execPath, ['scripts/build-anderhue.mjs'], root);
// Vite empties the output directory, including a previous .vercel link.
run('vercel', ['link', '--yes', '--project', 'anderhue-paralegal', '--scope', 'execom'], output, linkEnv);
const linked = JSON.parse(readFileSync(path.join(output, '.vercel/project.json'), 'utf8'));
assert.equal(linked.projectId, projectId, 'Refusing to deploy to a different Vercel project');
assert.equal(linked.orgId, orgId, 'Refusing to deploy to a different Vercel team');
// Explicit cwd and config are required: --cwd from the repository root can
// otherwise pick up Fabsy's deployment configuration and lose the SPA routes.
run('vercel', ['deploy', '--prod', '--yes', '--scope', 'execom', '--local-config', path.join(output, 'vercel.json')], output);

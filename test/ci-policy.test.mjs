import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
assert.match(workflow, /PNPM_VERSION: '\d+\.\d+\.\d+'/);
const installs = workflow.split('\n').filter(line => line.includes('npm install -g'));
assert.equal(installs.length, 3);
assert.ok(installs.every(line => line.includes('"pnpm@$PNPM_VERSION"')));

// A host must not disappear behind a skipped lane or a blanket build opt-out.
const dlx = workflow.split('\n').filter(line => line.trimStart().startsWith('pnpm dlx'));
assert.equal(dlx.length, 14);
assert.ok(dlx.every(line => line.includes('pnpm dlx $DSH_DLX_BUILD_FLAGS ')));
assert.deepEqual([...workflow.matchAll(/--allow-build=([^\s]+)/g)].map(match => match[1]), [
  '@deepseek-ai/dsh-subprocess-local', '@google/genai', 'koffi', 'node-pty', 'protobufjs',
]);
assert.match(workflow, /pnpm_config_minimum_release_age_strict: 'true'/);
assert.match(workflow, /pnpm_config_strict_dep_builds: 'true'/);
assert.doesNotMatch(workflow, /minimumReleaseAgeExclude|minimum_release_age_exclude|strictDepBuilds:\s*false|minimumReleaseAge:\s*0\b/);
const hosts = '0.1.0-rc.8, 0.1.1-rc.1, 0.1.1-rc.2, 0.1.2-alpha.3, 0.1.2-alpha.4, 0.1.2-alpha.5, 0.1.2-rc.1';
assert.equal(workflow.split(`dsh: [${hosts}]`).length - 1, 2);
assert.match(workflow, /needs: \[test, platform-test, opencode-compat, security, codeql, dsh-boot-smoke, permissions-dsh-compat, movein-dsh-compat\]/);
assert.doesNotMatch(workflow, /cat "\$RUNNER_TEMP\/dsh-web\.log"/);
console.log('CI toolchain, reviewed build allowlist, age policy, and all host gates preserved.');

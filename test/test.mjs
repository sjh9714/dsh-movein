import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cli = path.join(root, 'bin', 'cli.mjs');
const packageManifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

assert.strictEqual(packageManifest.dsh.compatibility.dsh, '>=0.1.0-rc.8 <0.2.0');
assert.deepStrictEqual(packageManifest.dsh.compatibility.dshReleases, {
  '0.1.0-rc.8': 'compatible',
  '0.1.1-rc.1': 'compatible',
  '0.1.1-rc.2': 'compatible',
  '0.1.2-alpha.3': 'compatible',
  '0.1.2-alpha.4': 'compatible',
  '0.1.2-alpha.5': 'compatible',
  '0.1.2-rc.1': 'compatible',
  '0.1.3-alpha.2': 'compatible',
});
assert.deepStrictEqual(packageManifest.dsh.compatibility.profiles, ['web']);
assert.deepStrictEqual(packageManifest.os, ['darwin', 'linux', 'win32']);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-movein-'));
const home = path.join(tmp, 'home');
const project = path.join(tmp, 'proj');
const sameContents = (actual, expected, message) => assert.strictEqual(
  fs.readFileSync(actual, 'utf8'),
  fs.readFileSync(expected, 'utf8'),
  message,
);

// fixture: fake Claude Code home + project
fs.mkdirSync(path.join(home, '.claude', 'skills', 'my-skill'), { recursive: true });
fs.writeFileSync(path.join(home, '.claude', 'skills', 'my-skill', 'SKILL.md'), '---\nname: my-skill\ndescription: d\n---\nbody');
fs.writeFileSync(path.join(home, '.claude', 'CLAUDE.md'), '# global rules');
fs.writeFileSync(path.join(home, '.claude', 'settings.json'), JSON.stringify({
  hooks: {
    SessionStart: [{ hooks: [
      { type: 'command', command: 'echo $MY_SECRET_TOKEN $CLAUDE_PROJECT_DIR $HOME' },
      { type: 'command', command: 'curl -H "Authorization: ghp_abcdefghijklmnopqrst1234"' },
    ] }],
    Notification: [{ hooks: [{ type: 'command', command: 'say ping' }] }],
    PreToolUse: [{ matcher: 'Bash', hooks: [
      { type: 'prompt', prompt: 'careful' },
      { type: 'command' },
    ] }],
  },
  permissions: { allow: ['Bash(ls:*)'], deny: ["Bash(rm -rf:*)", "Read(*secrets*)", 'WebFetch(domain:evil.com)'], ask: ['Write', 'Task'] },
}));
fs.mkdirSync(path.join(home, '.claude', 'agents'), { recursive: true });
fs.writeFileSync(path.join(home, '.claude', 'agents', 'code-reviewer.md'),
  "---\nname: Code_Reviewer\ndescription: Reviews diffs, one line per finding\ntools: Read, Grep\n---\nYou are a terse code reviewer.");
fs.mkdirSync(path.join(home, '.claude', 'commands'), { recursive: true });
fs.writeFileSync(path.join(home, '.claude', 'commands', 'ship-it.md'),
  "---\ndescription: Run tests then commit\nargument-hint: [message]\n---\nRun the test suite, then commit with $ARGUMENTS.");
// skill whose unquoted description colon makes DSH drop it silently (#1401)
fs.mkdirSync(path.join(home, '.claude', 'skills', 'risky-skill'), { recursive: true });
fs.writeFileSync(path.join(home, '.claude', 'skills', 'risky-skill', 'SKILL.md'),
  "---\nname: risky-skill\ndescription: Priority order: check the cache first\n---\nbody");
fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({
  mcpServers: { userserver: { command: 'uvx', args: ['server-x'], env: { TOKEN: '${MY_TOKEN}' } } },
}));
fs.mkdirSync(path.join(project, '.claude', 'skills', 'proj-skill'), { recursive: true });
fs.writeFileSync(path.join(project, '.claude', 'skills', 'proj-skill', 'SKILL.md'), '---\nname: proj-skill\ndescription: d\n---\nbody');
fs.writeFileSync(path.join(project, 'CLAUDE.md'), '# proj rules');
fs.writeFileSync(path.join(project, '.mcp.json'), JSON.stringify({
  mcpServers: {
    github: { command: 'npx', args: ['-y', "it's-a-server"] },
    remote: { type: 'http', url: 'https://mcp.example.com', headers: { Authorization: '${AUTH}' } },
  },
}));

// fake dsh profile with both row packages already resolvable (no network install)
for (const pkg of ['@deepseek-ai/dsh-hooks-claude-code', '@deepseek-ai/dsh-hook-protocol', '@deepseek-ai/dsh-mcp-client', 'dsh-movein-permissions']) {
  const d = path.join(home, '.dsh', 'profiles', 'web', 'node_modules', pkg);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name: pkg, version: '0.0.0' }));
}

const run = (extra = []) =>
  execFileSync(process.execPath, [cli, project, ...extra], { env: { ...process.env, HOME: home, USERPROFILE: home, DSH_HOME: '' }, encoding: 'utf8' });

// 1. dry run writes nothing, diff report present
const dry = run();
assert.match(dry, /dry run, nothing written/);
assert.match(dry, /3 MCP servers/);
assert.match(dry, /permissions: 3\/5 deny\+ask rules enforced/, 'migration diff ratio');
assert.match(dry, /not mapped, no DSH-side tool: WebFetch\(domain:evil\.com\) \(deny\)/);
assert.match(dry, /not mapped, no DSH-side tool: Task \(ask\)/);
assert.match(dry, /3 skills · 1 commands/, 'commands counted');
assert.match(dry, /command \/ship-it\s*\.+\s*convert to user-invocable skill/);
assert.match(dry, /⚠ skill risky-skill, unquoted ": " in description.*#1401/, 'silent-drop skill warned');
assert.match(dry, /⚠ secret-looking value in global hook command/, 'plaintext secret warned');
assert.match(dry, /hook references \$MY_SECRET_TOKEN/, 'unknown hook env var warned');
assert.match(dry, /hook Notification \(global settings\): event is not among the 7/, 'unbridged event warned');
assert.match(dry, /hook PreToolUse \(global settings\): type "prompt" is skipped/, 'non-command hook warned');
assert.match(dry, /hook PreToolUse \(global settings\): command hook has no non-empty command/, 'malformed command hook warned');
assert.match(dry, /records but does not enforce hook \{"continue":false\} \(#1514\)/, 'continue:false gap warned before apply');
assert.match(dry, /static inspection cannot prove hook enforcement/, 'runtime canary named before apply');
assert.ok(!dry.includes('hook SessionStart (global settings): event'), 'bridged event not flagged');
assert.ok(!dry.includes('$CLAUDE_PROJECT_DIR ('), 'substituted var not warned');
assert.ok(!dry.includes('$HOME ('), 'common shell var not warned');
assert.ok(!fs.existsSync(path.join(home, '.dsh', 'cordis.patch.yml')), 'dry run must not write patch');
assert.ok(!fs.existsSync(path.join(home, '.dsh', 'skills')), 'dry run must not link skills');

// Windows can reject symlink creation without Developer Mode. Planned link
// actions carry a copy fallback rather than failing the whole migration.
{
  const { scan } = await import('../lib/scan.mjs');
  const { planActions } = await import('../lib/apply.mjs');
  const planned = planActions(scan({ home, project }));
  assert.strictEqual(typeof planned.find((a) => a.label === 'CLAUDE.md (global)').fallback, 'function');
  assert.strictEqual(typeof planned.find((a) => a.label === 'skill my-skill').fallback, 'function');
}

// The executor retries only permission-denied link actions through their
// explicit copy fallback and reports what happened.
{
  const { applyActions } = await import('../lib/apply.mjs');
  let copied = false;
  const denied = Object.assign(new Error('symlink denied'), { code: 'EPERM' });
  const actions = [{
    status: 'move',
    note: 'link -> destination',
    exec: () => { throw denied; },
    fallback: () => { copied = true; },
    fallbackNote: 'copy -> destination (symlink unavailable)',
  }];
  applyActions(actions);
  assert.strictEqual(copied, true);
  assert.strictEqual(actions[0].status, 'done');
  assert.strictEqual(actions[0].note, 'copy -> destination (symlink unavailable)');
}

// 2. apply
const out = run(['--apply']);
assert.match(out, /moved in/);
const dsh = path.join(home, '.dsh');
sameContents(path.join(dsh, 'AGENTS.md'), path.join(home, '.claude', 'CLAUDE.md'), 'global CLAUDE.md linked or safely copied');
sameContents(path.join(dsh, 'skills', 'my-skill', 'SKILL.md'), path.join(home, '.claude', 'skills', 'my-skill', 'SKILL.md'), 'global skill linked or safely copied');
sameContents(path.join(project, '.dsh', 'skills', 'proj-skill', 'SKILL.md'), path.join(project, '.claude', 'skills', 'proj-skill', 'SKILL.md'), 'project skill linked or safely copied');
const patch = fs.readFileSync(path.join(dsh, 'cordis.patch.yml'), 'utf8');
assert.match(patch, /serverName: 'github'/);
assert.match(patch, /'it''s-a-server'/, 'single quotes escaped');
assert.match(patch, /transport: streamable-http/);
assert.match(patch, /TOKEN: !!js process\.env\.MY_TOKEN/, 'env var mapped, secret not inlined');
assert.match(patch, /'@deepseek-ai\/dsh-hooks-claude-code'/);
assert.match(patch, /configPath: '.*settings\.json'/);
assert.match(patch, /'dsh-movein-permissions'/);
assert.match(patch, /- 'Bash\(rm -rf:\*\)'/, 'deny rules carried verbatim');
assert.ok(!patch.includes('Bash(ls:*)'), 'allow rules stay out of the gate config');
assert.ok(!patch.includes('WebFetch'), 'unmapped rules stay out of the gate config');
const manifest = JSON.parse(fs.readFileSync(path.join(dsh, 'movein-manifest.json'), 'utf8'));
assert.strictEqual(manifest.length, 1);
assert.ok(manifest[0].moved.some((m) => m.kind === 'instructions' && m.dest.endsWith('AGENTS.md')), 'global instructions recorded');
assert.ok(manifest[0].moved.some((m) => m.kind === 'config' && m.dest.endsWith('cordis.patch.yml')), 'generated config recorded');
assert.ok(manifest[0].moved.some((m) => m.kind === 'skill' && m.label === 'skill my-skill' && m.source.endsWith('my-skill')), 'skill move recorded');
assert.ok(manifest[0].moved.some((m) => m.kind === 'agent' && m.dest.endsWith('code-reviewer')), 'agent move recorded');
const skillMd = fs.readFileSync(path.join(dsh, 'skills', 'code-reviewer', 'SKILL.md'), 'utf8');
assert.match(skillMd, /name: code-reviewer/, 'agent name kebab-cased');
assert.match(skillMd, /description: 'Reviews diffs, one line per finding'/);
assert.match(skillMd, /terse code reviewer/, 'agent body carried into skill');
assert.match(out, /open a NEW dsh session/, 'catalog snapshot reminder shown');
const cmdSkill = fs.readFileSync(path.join(dsh, 'skills', 'ship-it', 'SKILL.md'), 'utf8');
assert.match(cmdSkill, /name: ship-it/, 'command converted to skill');
assert.match(cmdSkill, /arguments: \[message\]/, 'argument-hint carried over');
assert.match(cmdSkill, /\$ARGUMENTS/, 'arguments note present');
assert.match(cmdSkill, /commit with \$ARGUMENTS/, 'command body carried into skill');
assert.ok(manifest[0].moved.some((m) => m.kind === 'command' && m.dest.endsWith('ship-it')), 'command move recorded');

// Static doctor proves the bridge is wired but explicitly does not claim that
// a user hook was executed or enforced.
{
  const { runDoctor } = await import('../lib/doctor.mjs');
  const wired = runDoctor({ home, project });
  assert.ok(wired.some((check) => check.level === 'ok'
    && check.label === 'hook bridge'
    && /2 supported command hook\(s\) across 1 settings file\(s\).*wiring, not runtime enforcement/.test(check.note)));
  assert.ok(wired.some((check) => check.level === 'warn'
    && check.label === 'hook enforcement'
    && /continue.*#1514/.test(check.note)));
  assert.ok(wired.some((check) => check.level === 'note'
    && check.label === 'hook canary'
    && /disposable project/.test(check.note)));

  const localSettings = path.join(project, '.claude', 'settings.local.json');
  fs.writeFileSync(localSettings, JSON.stringify({
    hooks: {
      PreCompact: [{ hooks: [{ type: 'command', command: 'node compact.mjs' }] }],
      PreToolUse: [{ matcher: '^(Bash|Read)$', hooks: [{ type: 'command', command: 'node deny.mjs' }] }],
    },
  }));
  const withLocal = runDoctor({ home, project });
  assert.ok(withLocal.some((check) => check.level === 'warn'
    && check.label === 'hook PreCompact'
    && check.note.includes(localSettings)), 'project-local hook settings are inspected');
  assert.ok(withLocal.some((check) => check.level === 'warn'
    && check.label === 'hook matcher'
    && check.note.includes('^(Bash|Read)$')), 'uppercase tools inside a regex matcher are warned');
  assert.ok(withLocal.some((check) => check.level === 'bad'
    && check.label === 'hook bridge'
    && check.note.includes(localSettings)), 'each supported settings layer needs its own bridge row');
  fs.unlinkSync(localSettings);
}

// Windows-only exit-code risk is deterministic from platform + hook config;
// no hook process is started to discover it.
{
  const { hookSafetyFindings, deadHooks } = await import('../lib/scan.mjs');
  const findings = hookSafetyFindings([{
    scope: 'fixture',
    settings: { hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: 'node deny.mjs' }] }] } },
  }], { platform: 'win32' });
  assert.ok(findings.some((finding) => finding.kind === 'windows-exit-code'
    && /\$LASTEXITCODE.*#2485\/#3714|#2485\/#3714.*\$LASTEXITCODE/.test(finding.message)));
  const malformed = deadHooks([{
    scope: 'fixture',
    settings: { hooks: { PreToolUse: {}, Stop: [{}] } },
  }]);
  assert.ok(malformed.some((finding) => /event value is not an array/.test(finding.why)));
  assert.ok(malformed.some((finding) => /matcher group has no hooks array/.test(finding.why)));
}

// 3. idempotent re-apply: no duplicate block, existing links skipped
fs.writeFileSync(path.join(dsh, 'cordis.patch.yml'), "- insert:\n    - id: user-row\n      name: 'keep-me'\n" + patch);
const out2 = run(['--apply']);
assert.match(out2, /already exists/);
const patch2 = fs.readFileSync(path.join(dsh, 'cordis.patch.yml'), 'utf8');
assert.strictEqual(patch2.match(/>>> dsh-movein/g).length, 1, 'exactly one generated block');
assert.match(patch2, /keep-me/, 'user rows preserved');

// 4. unresolvable package + failing installer: matching rows skipped, error surfaced, other rows kept
{
  const { scan } = await import('../lib/scan.mjs');
  const { planActions, applyActions } = await import('../lib/apply.mjs');
  fs.rmSync(path.join(home, '.dsh', 'profiles', 'web', 'node_modules', '@deepseek-ai', 'dsh-hooks-claude-code'), { recursive: true });
  fs.rmSync(path.join(home, '.dsh', 'cordis.patch.yml'));
  const actions = planActions(scan({ home, project }));
  let installerCalls = 0;
  applyActions(actions, { installer: () => { installerCalls++; return false; } });
  assert.strictEqual(installerCalls, 1, 'installer tried once for missing hooks pkg');
  const patchAction = actions.find((a) => a.label === 'MCP + hooks + permissions');
  assert.strictEqual(patchAction.status, 'error');
  assert.match(patchAction.note, /dsh-hooks-claude-code/);
  const partial = fs.readFileSync(path.join(home, '.dsh', 'cordis.patch.yml'), 'utf8');
  assert.match(partial, /serverName: 'github'/, 'mcp rows still written');
  assert.ok(!partial.includes('dsh-hooks-claude-code'), 'hooks row NOT written when pkg missing');
}

// 5. plugin shell: raw tool registration + in-process dry run
{
  const { apply: shellApply } = await import('../shell/index.mjs');
  const defs = new Map();
  shellApply({ tools: { register: (d) => { defs.set(d.name, d); } } });
  const def = defs.get('movein_from_claude_code');
  const openCodeDef = defs.get('movein_from_opencode');
  assert.ok(def);
  assert.ok(openCodeDef);
  assert.strictEqual(def.parameters.type, 'object');
  assert.strictEqual(typeof def.execute, 'function');
  const oldHome = process.env.HOME, oldDsh = process.env.DSH_HOME;
  process.env.HOME = home; process.env.DSH_HOME = '';
  const report = await def.execute({ project });
  process.env.HOME = oldHome; process.env.DSH_HOME = oldDsh ?? '';
  assert.match(report, /dry run, nothing written/);
  assert.match(report, /moving estimate/);
  const rendered = def.output.render({}, report);
  assert.strictEqual(rendered[0].type, 'text');
  const openCodeReport = await openCodeDef.execute({ project });
  assert.match(openCodeReport, /OpenCode -> DeepSeek Harness moving estimate/);
}

// 6. reverse: DSH-born skills come back, moved-in symlinks and existing files are skipped
{
  // DSH-born skill (real dir), created directly in ~/.dsh/skills
  const born = path.join(home, '.dsh', 'skills', 'dsh-native-skill');
  fs.mkdirSync(born, { recursive: true });
  fs.writeFileSync(path.join(born, 'SKILL.md'), '---\nname: dsh-native-skill\ndescription: d\n---\nb');
  const reverseApply = [cli, project, '--reverse', '--apply', ...(process.platform === 'win32' ? ['--copy'] : [])];
  const revOut = execFileSync(process.execPath, reverseApply,
    { env: { ...process.env, HOME: home, USERPROFILE: home, DSH_HOME: '' }, encoding: 'utf8' });
  assert.match(revOut, /skill dsh-native-skill/);
  assert.match(revOut, /skill my-skill\s*\.+\s*moved in from Claude Code originally/);
  assert.match(revOut, /AGENTS\.md \(global\)\s*\.+\s*(?:already points into ~\/.claude|copied from Claude Code originally)/);
  sameContents(path.join(home, '.claude', 'skills', 'dsh-native-skill', 'SKILL.md'), path.join(born, 'SKILL.md'), 'DSH-born skill linked or copied back');
  const manifest2 = JSON.parse(fs.readFileSync(path.join(home, '.dsh', 'movein-manifest.json'), 'utf8'));
  assert.ok(manifest2.at(-1).moved.some((m) => m.label === 'skill dsh-native-skill'), 'reverse move recorded');
  // idempotent
  const revOut2 = execFileSync(process.execPath, [cli, project, '--reverse'],
    { env: { ...process.env, HOME: home, USERPROFILE: home, DSH_HOME: '' }, encoding: 'utf8' });
  assert.match(revOut2, /skill dsh-native-skill\s*\.+.*already exists/);
}

// Copy fallback provenance is accepted only while the recorded source stays
// inside Claude's skill root and the copied tree remains byte-identical.
{
  const copyHome = path.join(tmp, 'home-reverse-copy');
  const copyProject = path.join(tmp, 'project-reverse-copy');
  const copyDsh = path.join(copyHome, '.dsh');
  const source = path.join(copyHome, '.claude', 'skills', 'copied-skill');
  const dest = path.join(copyDsh, 'skills', 'copied-skill');
  fs.mkdirSync(source, { recursive: true });
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(path.join(source, 'SKILL.md'), '---\nname: copied-skill\ndescription: d\n---\nbody');
  fs.copyFileSync(path.join(source, 'SKILL.md'), path.join(dest, 'SKILL.md'));
  const manifestPath = path.join(copyDsh, 'movein-manifest.json');
  const writeCopyManifest = (recordedSource) => fs.writeFileSync(manifestPath, JSON.stringify([{
    at: new Date().toISOString(),
    project: copyProject,
    moved: [{ kind: 'skill', label: 'skill copied-skill', source: recordedSource, dest }],
  }]));
  const { scanReverse } = await import('../lib/reverse.mjs');
  writeCopyManifest(source);
  assert.strictEqual(scanReverse({ home: copyHome, project: copyProject }).skills[0].cameFromClaude, true, 'matching manifest copy recognized');
  const outside = path.join(tmp, 'outside-skill');
  fs.cpSync(source, outside, { recursive: true });
  writeCopyManifest(outside);
  assert.strictEqual(scanReverse({ home: copyHome, project: copyProject }).skills[0].cameFromClaude, false, 'out-of-root manifest source rejected');
  writeCopyManifest(source);
  fs.appendFileSync(path.join(dest, 'SKILL.md'), '\nchanged in DSH');
  assert.strictEqual(scanReverse({ home: copyHome, project: copyProject }).skills[0].cameFromClaude, false, 'diverged copy not mistaken for its source');
}

// 7. doctor: flags the silently-dropped skill, exits 1, packages checked
{
  // a hand-placed skill in the rank-500 ~/.agents root, same silent-drop shape
  const agentsSkill = path.join(home, '.agents', 'skills', 'agents-side-skill');
  fs.mkdirSync(agentsSkill, { recursive: true });
  fs.writeFileSync(path.join(agentsSkill, 'SKILL.md'),
    "---\nname: agents-side-skill\ndescription: Note: this one lives outside .dsh\n---\nbody");
  let doc = '', code = 0;
  try {
    doc = execFileSync(process.execPath, [cli, 'doctor', project],
      { env: { ...process.env, HOME: home, USERPROFILE: home, DSH_HOME: '' }, encoding: 'utf8' });
  } catch (e) { doc = e.stdout; code = e.status; }
  assert.strictEqual(code, 1, 'doctor exits 1 when a check fails');
  assert.match(doc, /✗ skill risky-skill, unquoted ": "/, 'moved silent-drop skill flagged');
  assert.match(doc, /agents-side-skill/, 'skill in the ~/.agents root is checked too');
  assert.match(doc, /✓ package @deepseek-ai\/dsh-mcp-client, resolvable/);
  assert.match(doc, /✓ package dsh-movein-permissions, resolvable/);
  assert.match(doc, /✓ moved assets/, 'manifest destinations verified');
  assert.match(doc, /✗ hook bridge, 2 supported command hook\(s\) found, but no generated bridge row points to/, 'missing hook bridge row is fatal');
  assert.match(doc, /⚠ hook enforcement, DSH records but does not enforce/, 'known runtime enforcement gap is explicit');
  assert.match(doc, /○ hook canary, static inspection cannot prove hook enforcement/, 'manual canary is explicit');
  assert.match(doc, /NEW session/, 'catalog snapshot reminder');
}

// 8. restore: corrupted patch comes back from the newest backup
{
  const patchPath = path.join(home, '.dsh', 'cordis.patch.yml');
  fs.writeFileSync(patchPath, 'corrupted by hand\n');
  const out7 = execFileSync(process.execPath, [cli, 'restore'],
    { env: { ...process.env, HOME: home, USERPROFILE: home, DSH_HOME: '' }, encoding: 'utf8' });
  assert.match(out7, /restored cordis\.patch\.yml from/);
  const restored = fs.readFileSync(patchPath, 'utf8');
  assert.match(restored, /keep-me/, 'pre-overwrite content restored');
  assert.ok(!restored.includes('corrupted by hand'));
}

// 9. --emit-rules: dsh-permission-rules YAML from CC deny/ask rules
{
  const rules = execFileSync(process.execPath, [cli, project, '--emit-rules'],
    { env: { ...process.env, HOME: home, USERPROFILE: home, DSH_HOME: '' }, encoding: 'utf8' });
  assert.match(rules, /REVIEW BEFORE USE/);
  assert.match(rules, /tools: \[bash, pwsh\], params: \{ command: "rm -rf\*" \}/, 'Bash glob mapped');
  assert.match(rules, /tools: \[read\], paths: \["\*secrets\*"\]/, 'Read path mapped');
  assert.match(rules, /tools: \[write\] \}\n    action: ask/, 'bare Write ask rule');
  assert.match(rules, /# no DSH equivalent for WebFetch\(domain:evil\.com\) \(deny\), skipped/);
  assert.match(rules, /# no DSH equivalent for Task \(ask\), skipped/);
  assert.match(rules, /reason: "migrated from Claude Code deny rule: Bash\(rm -rf:\*\)"/);

  const { emitRules } = await import('../lib/apply.mjs');
  const adversarial = `A${'__x'.repeat(50_000)}!`;
  const parseStarted = performance.now();
  const rejected = emitRules({ deny: [adversarial], ask: [] });
  assert.strictEqual(rejected, [
    '# generated by dsh-movein --emit-rules from Claude Code settings',
    '# REVIEW BEFORE USE, param/path mapping is approximate. Engine: PerryLink/dsh-permission-rules',
    'rules:',
    '',
  ].join('\n'));
  assert.ok(performance.now() - parseStarted < 1_000, 'malformed export rules must be rejected in linear time');
}

// 10. codex origin: config.toml MCP + AGENTS.md + prompts move in
{
  const { parseCodexMcpServers } = await import('../lib/codex.mjs');
  const parsed = parseCodexMcpServers([
    '# top comment',
    'model = "gpt-5.3"',
    '[mcp_servers.github]',
    'command = "npx"',
    'args = ["-y", "server-gh"]',
    'env = { TOKEN = "${GH}" }',
    '[mcp_servers."with-dots"]',
    "command = 'uvx'",
    '[mcp_servers."with-dots".env]',
    'KEY = "v"',
    '[other_table]',
    'command = "should-not-leak"',
  ].join('\n'));
  assert.deepStrictEqual(parsed.github, { command: 'npx', args: ['-y', 'server-gh'], env: { TOKEN: '${GH}' } });
  assert.deepStrictEqual(parsed['with-dots'], { command: 'uvx', env: { KEY: 'v' } });
  assert.strictEqual(Object.keys(parsed).length, 2, 'non-mcp tables ignored');

  const home2 = path.join(tmp, 'home-codex');
  fs.mkdirSync(path.join(home2, '.codex', 'prompts'), { recursive: true });
  fs.writeFileSync(path.join(home2, '.codex', 'AGENTS.md'), '# codex global rules');
  fs.writeFileSync(path.join(home2, '.codex', 'prompts', 'review.md'), 'Review the diff carefully.');
  fs.writeFileSync(path.join(home2, '.codex', 'config.toml'),
    '[mcp_servers.gh]\ncommand = "npx"\nargs = ["-y", "server-gh"]\n');
  fs.mkdirSync(path.join(home2, '.codex', 'sessions', '2026', '08'), { recursive: true });
  fs.writeFileSync(path.join(home2, '.codex', 'sessions', '2026', '08', 'a.jsonl'), '{}');
  for (const pkg of ['@deepseek-ai/dsh-mcp-client']) {
    const d = path.join(home2, '.dsh', 'profiles', 'web', 'node_modules', pkg);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name: pkg, version: '0.0.0' }));
  }
  const proj2 = path.join(tmp, 'proj-codex');
  fs.mkdirSync(proj2, { recursive: true });
  const runC = (extra = []) =>
    execFileSync(process.execPath, [cli, proj2, '--from', 'codex', ...extra],
      { env: { ...process.env, HOME: home2, USERPROFILE: home2, DSH_HOME: '' }, encoding: 'utf8' });

  const dryC = runC();
  assert.match(dryC, /Codex -> DeepSeek Harness moving estimate/, 'codex origin in header');
  assert.match(dryC, /AGENTS\.md \(global\)/, 'codex AGENTS.md planned');
  assert.match(dryC, /prompt \/review\s*\.+\s*convert to user-invocable skill/, 'prompt labeled');
  assert.match(dryC, /1 MCP servers/);
  assert.match(dryC, /1 sessions/, 'codex sessions counted');

  const outC = runC(['--apply']);
  assert.match(outC, /moved in/);
  const dsh2 = path.join(home2, '.dsh');
  sameContents(path.join(dsh2, 'AGENTS.md'), path.join(home2, '.codex', 'AGENTS.md'), 'Codex global instructions linked or safely copied');
  const promptSkill = fs.readFileSync(path.join(dsh2, 'skills', 'review', 'SKILL.md'), 'utf8');
  assert.match(promptSkill, /Converted from a Codex custom prompt/, 'origin wording carried');
  const patchC = fs.readFileSync(path.join(dsh2, 'cordis.patch.yml'), 'utf8');
  assert.match(patchC, /serverName: 'gh'/);
  assert.ok(!patchC.includes('dsh-hooks-claude-code'), 'no hooks row for codex');
  assert.ok(!patchC.includes('dsh-movein-permissions'), 'no perms row for codex');
  const manifestC = JSON.parse(fs.readFileSync(path.join(dsh2, 'movein-manifest.json'), 'utf8'));
  assert.ok(manifestC.at(-1).moved.some((m) => m.kind === 'instructions' && m.source.endsWith(path.join('.codex', 'AGENTS.md'))), 'Codex instructions recorded');
  assert.ok(manifestC.at(-1).moved.some((m) => m.kind === 'config' && m.dest.endsWith('cordis.patch.yml')), 'Codex MCP config recorded');

  // v0.13.4 omitted a manifest when an apply contained only global
  // instructions plus MCP rows. A safe repeat repairs provenance when the
  // existing instruction destination still byte-matches its source.
  fs.rmSync(path.join(dsh2, 'movein-manifest.json'));
  runC(['--apply']);
  const repairedManifest = JSON.parse(fs.readFileSync(path.join(dsh2, 'movein-manifest.json'), 'utf8'));
  assert.ok(repairedManifest.at(-1).moved.some((m) => m.kind === 'instructions'), 'matching existing instructions recover provenance');
  assert.ok(repairedManifest.at(-1).moved.some((m) => m.kind === 'config'), 'repeated MCP apply records generated config');

  // empty codex machine
  const home3 = path.join(tmp, 'home-empty');
  fs.mkdirSync(home3, { recursive: true });
  const dryE = execFileSync(process.execPath, [cli, proj2, '--from', 'codex'],
    { env: { ...process.env, HOME: home3, USERPROFILE: home3, DSH_HOME: '' }, encoding: 'utf8' });
  assert.match(dryE, /Is Codex set up on this machine \(~\/.codex\)\?/);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log('ok - all assertions passed');

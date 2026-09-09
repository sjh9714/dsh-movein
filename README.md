# dsh-movein

[中文](./docs/README.zh.md)

<p align="center">
  <a href="https://www.npmjs.com/package/dsh-movein"><img alt="npm" src="https://img.shields.io/npm/v/dsh-movein?style=flat-square&color=4b6fff"></a>
  <a href="https://github.com/sjh9714/dsh-movein/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/sjh9714/dsh-movein/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-2EA44F?style=flat-square"></a>
</p>

**Try [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) with the setup you already use.**

Keep using Claude Code while you try its skills in DSH. Preview the changes, apply the parts you choose, and start a small task in a new DSH session. Source files and existing destinations stay untouched.

![The native DSH settings page previews and applies a Claude Code setup](./docs/settings-demo.gif)

Recorded from a real DSH `0.1.2-rc.1` Web host on macOS with a synthetic project and dsh-movein `0.13.8`. It shows preview and apply; the source was preserved and the imported skill was checked byte-for-byte. No model task ran. [Full screen recording](https://github.com/sjh9714/dsh-movein/blob/main/docs/settings-demo.webm).

If this saves you setup time, [star dsh-movein](https://github.com/sjh9714/dsh-movein).

## Import inside DSH

```sh
dsh plugin --profile web add dsh-movein
```

Restart `dsh web`, open **Settings**, then choose **Move in**.

Using a coding agent? [Copy the install, preview, and verification request](https://github.com/sjh9714/dsh-movein/blob/main/docs/agent-setup.md). To see a synthetic setup move without touching your own files, follow the [Chinese first-migration walkthrough](https://github.com/sjh9714/dsh-movein/blob/main/docs/first-migration.zh.md).

- Claude Code is the primary path
- Settings 0.13.8+ starts with Skills selected; Codex starts with Instructions
- Apply becomes available after a successful preview; changing the folder, origin, or categories requires a new preview
- Every category can be included or excluded
- Conflicts and unsupported entries appear before apply
- Codex and OpenCode stay available under the secondary origin panel

The same plugin also registers `movein_from_claude_code` and `movein_from_opencode` for model-driven use. Both tools stay dry until `apply=true`.

## Finish one small task

After applying, open a new DSH session in the same project and ask it to use one imported skill for a small task. Check that the skill was loaded and that its instructions affected the result. The Settings page links to the [first-task walkthrough](https://github.com/sjh9714/dsh-movein/blob/main/docs/first-task.md), including the separate Codex path.

We are looking for **five first-run testers**. A blocked attempt is useful too: [share what you tried and where it stopped](https://github.com/sjh9714/dsh-movein/issues/new?template=first-run.md). Use the version actually installed in your profile; successful installation alone does not establish a working task.

## Use the CLI

```sh
# Claude Code
npx dsh-movein
npx dsh-movein --apply

# Codex
npx dsh-movein --from codex
npx dsh-movein --from codex --apply

# OpenCode
npx dsh-movein --from opencode
npx dsh-movein --from opencode --apply
```

Every command is a dry run until `--apply` is present. Use `--copy` if you want copied skills instead of symlinks.

After a successful CLI apply, a human TTY asks `Star dsh-movein? (Enter = Yes) [Y/n]`; Yes uses the GitHub account authenticated in `gh`. A detected agent or any non-TTY prints `USER_CONFIRMATION_REQUIRED` and must ask the user before running exactly `npx dsh-movein --confirm-star yes` or `npx dsh-movein --confirm-star no`. CI never prompts, writes a marker, or calls the Star API. DSH Settings and model tools show only a user-clicked link and never call that API.

## Compatibility

These DSH releases passed installation, authenticated Web startup, and removal in a fresh Linux `web` profile. This checks host/plugin loading, not model tasks, migrated-hook enforcement, or Windows Minimal TUI acceptance.

| DSH release | Install | Web start | Uninstall |
| --- | --- | --- | --- |
| `0.1.0-rc.8` | Compatible | Compatible | Compatible |
| `0.1.1-rc.1` | Compatible | Compatible | Compatible |
| `0.1.1-rc.2` | Compatible | Compatible | Compatible |
| `0.1.2-alpha.3` | Compatible | Compatible | Compatible |
| `0.1.2-alpha.4` | Compatible | Compatible | Compatible |
| `0.1.2-alpha.5` | Compatible | Compatible | Compatible |
| `0.1.2-rc.1` | Compatible | Compatible | Compatible |
| `0.1.3-alpha.2` | Compatible | Compatible | Compatible |

DSH `0.1.3-alpha.2` adds the native `fs-ext` dependency for session file locking. Its build needs explicit approval when using pnpm; the [CI allowlist](.github/workflows/ci.yml) names this package individually and preserves strict build and release-age policies. No compatibility is claimed for the GitHub-only `0.1.3-alpha.1` release or untested newer alphas.

On macOS, `0.1.3-alpha.2` also passed a separate local hoisted-host check, including the live doctor's HTML/JavaScript and cleanup probes. The pnpm 11 linked `dlx` layout can start through the official CLI but fail the isolated doctor's official-component resolution. Compare a separate local hoisted host in that case; do not delete the migration profile, inherit an arbitrary `NODE_PATH`, or disable package-manager checks.

| Origin | What moves |
| --- | --- |
| Claude Code | Global and project instructions, skills, slash commands, MCP servers, the supported hook configuration subset, subagents, and mapped permission rules |
| Codex | Global `AGENTS.md`, custom prompts, and stdio MCP servers from `config.toml` |
| OpenCode | Instructions, skills, commands, agents, and local or remote MCP servers from V1 or V2 JSON and JSONC config |

The [full compatibility matrix](docs/compat.md) names the source path, destination, preserved behavior, and unsupported parts for each origin.

## OpenCode as an origin

`--from opencode` follows OpenCode configuration precedence across the global config, `OPENCODE_CONFIG`, project configs, `.opencode` directories, and `OPENCODE_CONFIG_DIR`. Direct project configs load from the Git root toward the current directory, then `.opencode` configs load in the same order.

It supports both `opencode.json` and `opencode.jsonc`, including comments and trailing commas.

- `skill` and `skills` directories move as DSH skills
- `agent` and `agents` files convert to DSH skills
- `command` and `commands` files convert to user-invocable DSH skills
- Inline agents and commands convert the same way as file-based assets
- V1 agent `prompt` and V2 agent `system` both become the DSH skill body
- Local MCP command arrays split into DSH stdio command and args
- Remote MCP servers become streamable HTTP rows
- V1 MCP maps and V2 `mcp.servers` maps are both supported
- Disabled MCP servers stay disabled and appear in the report
- `{env:VAR}` stays a runtime `process.env.VAR` reference
- `{file:path}` stays visible for manual review and is never read by dsh-movein

Project `AGENTS.md` needs no move because DSH already reads it. One global instruction file can link to `~/.dsh/AGENTS.md` when that destination is free. Multiple files, globs, URLs, OpenCode permissions, and OpenCode plugins are reported instead of guessed.

If any JSONC file cannot be parsed, `--apply` is blocked before the first write.

## Safety

- Dry run is the default
- Existing destinations are skipped
- On Windows, a permission-denied symlink falls back to a copy and is named in the report
- `cordis.patch.yml` is backed up before each write
- `npx dsh-movein restore` restores the newest patch backup
- `~/.dsh/movein-manifest.json` records moved instructions, assets, and generated configuration destinations; a safe repeated apply can recover missing instruction provenance when the existing destination still byte-matches its source
- Environment placeholders remain runtime references
- Secret-looking plaintext values are reported before apply
- Sessions stay out of scope

## After moving

```sh
npx dsh-movein doctor
npx dsh-movein doctor --live
```

`doctor` checks recorded destinations, skill frontmatter, required packages, and a matching Claude Code hook bridge row for every settings file that contains supported command hooks. It also names hook configurations that cannot enforce what they appear to enforce: events outside DSH's seven mapped events, non-command handlers, uppercase Claude tool matcher alternatives, the current `{"continue":false}` control-flow gap, and the Windows PowerShell native-child exit-code gap. It never executes a user hook. Matching bridge rows and resolvable packages prove wiring only; `doctor` prints a disposable deny-canary reminder before you rely on hooks as a policy boundary.
`doctor --live` never activates the migrated configuration. It requires an already-installed `@deepseek-ai/dsh` `0.1.1-rc.2` or newer and first proves the boot-free `web --dump-config` contract in a separate disposable snapshot containing only the official `@deepseek-ai/dsh-base` and `@deepseek-ai/dsh-web-app` bundles and empty patch layers. Only after that succeeds does it ask DSH to compose the active migration snapshot. Both dumps must return a bounded, non-empty config with the expected sectioned YAML-list shape; their output is discarded and never printed. It then resets the active snapshot to the same official base/web-only configuration, boots it on an OS-assigned loopback port, and verifies its HTML boot wire and one same-origin JavaScript bundle. Static `doctor` checks the migrated package references separately.

The installed runtime must be visible under `DSH_HOME/profiles`; DSH `0.1.2-rc.1` creates these runtime links during its first normal Web boot, not a config dump. If they are absent, the doctor stops without downloading or bootstrapping anything. It handles the isolated server's launch-token exchange with one same-origin redirect to `/` and a temporary in-memory cookie for its HTML and JavaScript probes. Other redirects are not followed; the cookie is never saved or printed.

No DSH download, model, or API credential is used. Child processes receive only a small OS, `PATH`, and locale allowlist; home, application-data, XDG, cache, and temporary paths all point inside the disposable snapshot. Shutdown signals the retained direct child handle and success requires observing that child exit and the loopback port become unreachable. It does not issue PID-tree kill commands. If child termination cannot be confirmed, the snapshot is preserved and the live check fails. Live checking requires the DSH-supported Node 22.19+ or 24+ runtime; Node 23 is rejected before any child starts.

If the official-only baseline cannot load a native binding or import official DSH packages, `doctor --live` names the host installation failure separately from migration results. Missing package names alone do not prove a native-loader problem. A reproduced case with DSH `0.1.1-rc.2`, pnpm `11.24.0`, and `node-addon-native-custom-loader` `0.1.5` on macOS arm64 resolves the platform package from the native addon's directory but not from the shared loader's directory. The installed binary loads successfully when resolved from its owning package; a separate hoisted installation also passes. This dependency-ownership issue is tracked in [DSH discussion #3250](https://github.com/deepseek-ai/deepseek-harness/discussions/3250).

Keep your migration profile intact. Compare a **separate** local DSH installation using npm or pnpm's project-local `nodeLinker: hoisted`, then rerun the live check against that installation. This is a diagnostic comparison, not an automatic repair or a guarantee for every installation layout. The doctor does not install missing packages, change global package-manager settings, disable release-age or script-approval policies, or add internal Node flags.

Then inspect the composed DSH profile.

```sh
dsh --profile web --dump-config | grep -E "mcp-|cc-hooks"
```

Open a new DSH session after moving skills because the skill catalog is captured per session.

### Hook enforcement is not migration parity

Current DSH hook bridges have upstream enforcement gaps. On Windows, a command that launches a native interpreter can lose its exit code through PowerShell, so an intended exit-2 deny can fail open. When the command shape permits it, explicitly propagate the native status with `; exit $LASTEXITCODE`. On every platform, DSH currently records `{"continue":false}` but does not halt the run. Unsupported events outside the mapped seven are skipped during parsing. See [the measured hook limits and safe canary procedure](docs/compat.md#verify-hook-enforcement-after-moving) before treating a moved hook as a security boundary.

## Claude Code dual boot

DSH-born skills can return to Claude Code without copying assets that originally came from Claude Code.

```sh
npx dsh-movein --reverse
npx dsh-movein --reverse --apply
```

Reverse moving currently targets Claude Code only.

## Claude Code to OpenCode

The compatibility command remains available for users who need the full Claude Code to OpenCode migration route.

```sh
npx claude-to-opencode
npx claude-to-opencode --apply
```

If you only need Claude Code command hooks in OpenCode, use the focused [opencode-claude-code-hooks](https://github.com/sjh9714/opencode-claude-code-hooks) plugin instead.

## Not moved

- Sessions
- OpenCode permissions and plugins
- Codex approval and sandbox policy
- Instruction globs, remote instruction URLs, or multiple instruction files
- Hand-written DSH MCP and hook rows during reverse moving

Conversation history belongs in [dsh-chat-import](https://github.com/Nwflower/dsh-chat-import). Configuration migration and session import are separate operations; review the selected sources, destinations, and each tool's limits. A combined workflow is not jointly validated or endorsed.

See [configuration and session-import boundaries](https://github.com/sjh9714/dsh-movein/blob/main/docs/session-import-boundaries.md) before repeating or undoing either operation. Movein's `restore` restores only its patch backup; chat-import's `retract_import` removes a registry entry, not session files. Neither is a full rollback.

### Windows setup comes first

If DSH cannot start PowerShell on Windows, [dsh-win32](https://github.com/sjh9714/dsh-win32) diagnoses known Windows failures and separately verifies the installed official component chain. Resolve that host problem before applying a migration. Movein does not install dsh-win32, and its success does not establish complete Minimal-session or hook-enforcement support.

## Project status

The CLI migration paths retain their rc.6 and rc.7 regression coverage. CI also installs, boots, and removes a packed release against every exact DSH version listed above.

Listed in [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) and [awesome-deepseek-harness](https://github.com/0xsline/awesome-deepseek-harness). The measured migration notes also appear in [dsh-handbook](https://github.com/Electricitysheep/dsh-handbook).

## Star history

[![Star History Chart](https://api.star-history.com/svg?repos=sjh9714/dsh-movein&type=Date)](https://star-history.com/#sjh9714/dsh-movein&Date)

## License

MIT

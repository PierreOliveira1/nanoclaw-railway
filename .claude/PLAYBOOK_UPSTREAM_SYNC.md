# Upstream Sync Playbook

Sync the Railway template repo with the parent NanoClaw repo (`https://github.com/qwibitai/nanoclaw`).

**Shortcut:** Run `/railway-template` in Claude Code — the skill follows this playbook automatically.

---

## Quick Start

```
/railway-template
```

Or tell Claude: "Sync upstream NanoClaw changes into this Railway repo"

---

## What This Does

The Railway template is a fork of NanoClaw with Railway-specific adaptations (no Docker, secrets via stdin, persistent volume, etc.). The parent repo evolves independently. This playbook pulls all new parent commits into the Railway repo **one at a time**, preserving original commit messages, and adds adaptation commits where Railway-specific code was affected.

---

## The Process

### 1. Preflight
- Working tree must be clean (`git status --porcelain` = empty)
- Commit or discard any uncommitted changes first
- `upstream` remote is added if missing: `git remote add upstream https://github.com/qwibitai/nanoclaw.git`
- Fetch: `git fetch upstream --prune`
- Create backup tag: `pre-railway-sync-<timestamp>` (for rollback)

### 2. Compute What's New
- Find merge base: `git merge-base HEAD upstream/main`
- List upstream commits since base (oldest first, no merges)
- Filter out commits already cherry-picked (match by commit message)
- Identify which commits touch Railway-adapted files (see table below)

### 3. Replay Each Commit
For each upstream commit:
1. `git cherry-pick <hash>` — preserves original author, date, and message
2. If conflicts: resolve them (keep upstream changes + Railway adaptations)
3. If Railway-adapted files were touched: verify adaptations are intact, add `railway: adapt <description>` commit if needed
4. If cherry-pick fails completely: skip and log

### 4. Validate
- `npm run build` must pass
- `npm test` should pass (fix test assertions if Railway error messages diverge)
- Verify Railway markers: `grep -l IS_RAILWAY src/config.ts src/container-runner.ts src/index.ts`
- Verify Railway-only files exist: `src/railway-runner.ts`, `src/mcp-installer.ts`, `src/skill-installer.ts`

### 5. Push
- `git push origin main`

---

## Railway-Adapted Files

These files have intentional divergences from upstream. Conflicts in these files need manual resolution that preserves both upstream changes AND Railway adaptations:

| File | What Railway Changes |
|------|---------------------|
| `src/config.ts` | `IS_RAILWAY` flag, `RAILWAY_VOLUME` path, `SLACK_MAIN_CHANNEL_ID`, redirects `STORE_DIR`/`GROUPS_DIR`/`DATA_DIR` to `/data/...` on Railway |
| `src/env.ts` | Skips `.env` file on Railway — reads everything from `process.env` (Railway service config) |
| `src/index.ts` | Conditionally starts credential proxy (skip on Railway), calls `syncSkillsOnStartup()`/`syncMcpOnStartup()`, auto-registers main group + channel groups, thread-aware context formatting |
| `src/container-runner.ts` | Early-returns to `runRailwayAgent()` on Railway, keeps `readSecrets()` for stdin-based secret passing, `secrets` field on `ContainerInput` interface |
| `src/ipc.ts` | Adds IPC handlers: `install_skills`, `remove_skill`, `list_skills`, `add_mcp_server`, `remove_mcp_server`, `list_mcp_servers` |
| `src/router.ts` | `formatThreadWithContext()` with timezone support |
| `container/agent-runner/src/index.ts` | Keeps `createSanitizeBashHook` for stripping secrets from Bash subprocesses (upstream removed it when adding credential proxy) |

### Railway-Only Files (not in upstream)
| File | Purpose |
|------|---------|
| `src/railway-runner.ts` | Spawns agent as child process instead of Docker container |
| `src/mcp-installer.ts` | Persistent MCP server registry (survives Railway deploys via `/data` volume) |
| `src/skill-installer.ts` | Persistent skill installer (clones skill repos, manages lock file) |
| `Dockerfile.railway` | Multi-stage Docker build for Railway deployment |
| `docker-entrypoint-railway.sh` | Fixes `/data` volume ownership, drops to `node` user |
| `railway.json` | Railway platform config |
| `RAILWAY.md` | Deployment documentation |

---

## Conflict Resolution Cheat Sheet

| Scenario | Resolution |
|----------|-----------|
| Upstream adds new import, Railway has different imports | Keep both — add upstream's new import alongside Railway's |
| Upstream changes function signature Railway also modified | Merge both changes into the signature |
| Upstream adds feature Railway deliberately removed (e.g., credential proxy on Railway) | Keep the feature code but gate it with `if (!IS_RAILWAY)` |
| Upstream removes code Railway still needs (e.g., `readSecrets`) | Keep Railway's version |
| Upstream changes `.env` handling | Keep Railway's `process.env`-first approach |
| CHANGELOG conflict | Accept upstream's additions, remove conflict markers |
| Skill file conflict | Usually accept upstream (`git checkout --theirs`) |

---

## Rollback

If anything goes wrong:
```bash
git reset --hard pre-railway-sync-<timestamp>
git push origin main --force
```

The backup tag is printed at the start of every sync.

---

## Last Sync: 2026-03-15

### Features Pulled from Parent

#### New Skills
- **`/remote-control`** — Host-level Claude Code access from chat. Send `/remote-control` in main group to get a URL for browser-based Claude Code on the host machine.
- **`/add-ollama`** — Local model inference via Ollama MCP server. Cheaper/faster for summarization, translation, general queries.
- **`/compact`** — Manual context compaction. Fixes context rot in long agent sessions by forwarding the SDK's built-in `/compact` command.
- **WhatsApp reactions** — Emoji reaction support: receive, send, store, and search reactions.
- **Image vision** — Processes WhatsApp image attachments and sends them to Claude as multimodal content blocks.
- **PDF reader** — Extracts text from PDFs via `pdftotext` CLI. Handles WhatsApp attachments, URLs, and local files.
- **Local Whisper** — Switch voice transcription from OpenAI API to local `whisper.cpp` on Apple Silicon.

#### Core Improvements
- **Credential proxy** — Enhanced container environment isolation. API calls from containers route through a local proxy instead of receiving secrets directly. On Railway, secrets still go via stdin (proxy is skipped).
- **Timezone-aware context** — Agent prompts now include timezone context and display timestamps in local time instead of UTC.
- **Sender allowlist** — Per-chat access control. Restrict which senders can trigger the agent or have messages stored.
- **`update_task` tool** — Agents can now update scheduled tasks (not just create/delete). Task IDs are returned from `schedule_task`.
- **DB query limits** — Added `LIMIT` to unbounded message history queries to prevent memory issues in active groups.
- **Atomic task claims** — Prevents scheduled tasks from executing twice when container runtime exceeds the poll interval.
- **Skills as branches** — Major architecture change: skills are now git branches, channels are forks. Replaces the old skills-engine directory.
- **Docker Sandboxes** — New deployment option announced in README (alternative to Railway).
- **claude-agent-sdk bumped to ^0.2.76**

#### Bug Fixes
- Close task container promptly when agent uses IPC-only messaging
- WhatsApp: use sender's JID for DM-with-bot registration, skip trigger
- WhatsApp: write pairing code to file for immediate access
- WhatsApp: add error handling to messages.upsert handler
- Voice transcription skill drops WhatsApp registerChannel call
- Correct misleading send_message tool description for scheduled tasks
- Fix broken step references in setup/SKILL.md
- Rename `_chatJid` to `chatJid` in onMessage callback
- Format src/index.ts to pass CI prettier check

### Railway Adaptations Made
- `railway: adapt credential proxy` — Kept stdin secret passing, conditionally start proxy only when not on Railway
- `railway: fix Slack test assertions` — Updated test to match Railway's error message wording

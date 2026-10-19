# DevShip Implementation Plan

> Execution: native implementation in this session, using executing-plans and test-driven-development.

**Goal:** Deliver an installable universal DevShip CLI and reproducible safety tests.

**Architecture:** Small ESM modules separate process execution, configuration, task discovery, file policy and Git orchestration. Built-in node:test exercises local bare remotes without network access.

**Tech Stack:** Node >=22, Git >=2.30, npm package, zero dependencies.

**Spec:** [DESIGN.md](DESIGN.md)

## Global constraints

- Uzbek user-facing text; Windows/macOS/Linux.
- Never use destructive Git commands, force push, or skip hooks.
- One explicit branch destination; no automatic dependency installation.
- Strict fail-closed configuration and secret checks.

## Review focus

Partial staging; filenames with shell/pathspec syntax; secrets in earlier unpublished commits; divergent feature histories; checks that change files.

## Tasks

1. Write unit and real-Git integration tests for CLI success/failure and the five review risks; run and observe missing implementation failure.
2. Implement src/process.mjs, config.mjs, tasks.mjs, safety.mjs, git.mjs and ship.mjs; bin/devship.mjs parses strict options and reports errors. Run tests and repair concrete failures.
3. Add regressions for conflicts, hooks, clean trees, no checks, excluded output, stale locks and push isolation. Verify all tests, CLI help and installation from npm pack.
4. Write Uzbek installation/config/recovery guide, security limits, license and platform CI. Package runnable source as .tgz and .zip; verify package contents and installed binary.

## 1.2 follow-up: Telegram groups

1. Add failing post-push orchestration tests; preserve no-notify behavior for dry runs, check failures and up-to-date branches.
2. Implement a fixed-host Telegram client, hidden-token global setup, confirmed group/topic pairing and native Windows DPAPI storage outside Git repositories.
3. Collect metadata after a successful branch update, format bounded summary/full text attachment, and checkpoint pending/sent receipts for explicit recipient-bound retry.
4. Test pairing, secret redaction, credential round-trips, transport failure, large reports and duplicate avoidance with fake API responses. Reproduce review findings before fixes.
5. Run the complete suite, package/install smoke tests, update the installed CLI and provide Uzbek BotFather/group setup instructions. Live group delivery requires user setup; tests do not contact a real Telegram recipient.

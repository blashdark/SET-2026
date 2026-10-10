# AGENTS.md

## rtk (Rust Token Killer) — prefix shell commands

`rtk` is installed on this machine (v0.50.0, on PATH). It is a CLI proxy that
filters and compresses command output before it reaches the agent, cutting
80-90% of the tokens for supported commands.

Zed has **no hook integration** for rtk, so it does not rewrite commands on its
own. When you run shell commands in this project, you must prefix them with
`rtk` yourself.

**Rule:** before running a shell command, check whether rtk supports it. If it
does, run `rtk <command>` instead of the plain command.

### Common rewrites

| Instead of | Run |
|---|---|
| `ls`, `tree` | `rtk ls .`, `rtk tree` |
| `cat <file>`, `head/tail <file>` | `rtk read <file>` |
| `grep -r ...`, `rg ...` | `rtk grep "pat" .`, `rtk rg "pat" .` |
| `git status/diff/log/add/commit/push/pull` | `rtk git ...` |
| `gh ...` | `rtk gh ...` |
| `docker ps/logs/images`, `kubectl ...` | `rtk docker ...`, `rtk kubectl ...` |
| `npm test`, `pytest`, `cargo test`, `go test`, `jest`, `vitest` | `rtk test <cmd>` (or `rtk pytest`, `rtk jest`, `rtk cargo test`, ...) |
| `npm run ...`, `npx ...`, `pnpm ...`, `pip ...`, `uv run ...` | `rtk npm ...`, `rtk npx ...`, `rtk pnpm ...`, `rtk pip ...`, `rtk uv run ...` |
| `eslint`, `tsc`, `ruff check`, `prettier --check` | `rtk lint`, `rtk tsc`, `rtk ruff check`, `rtk prettier ...` |
| `find ...` | `rtk find ...` |
| `diff a b` | `rtk diff a b` |
| `curl ...`, `wget ...` | `rtk curl ...`, `rtk wget ...` |
| `aws ...` | `rtk aws ...` |

### Notes

- rtk only filters **output**; the underlying command still runs normally.
  Unsupported commands pass through unchanged, so `rtk <unknown>` is safe but
  pointless — just run the plain command.
- Use `rtk run <cmd>` (raw passthrough) or the plain command when you need the
  full/raw output for debugging.
- `rtk rewrite "<command>"` shows how a command would be rewritten.
- `rtk gain` shows token savings so far.
- Installing packages, editing files, and everything outside shell output is
  unaffected by rtk.

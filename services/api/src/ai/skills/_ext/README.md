# Fork overlay skills (`_ext`)

Skills in this directory are **fork-first** teaching for the FULLSTACK_RUNTIME
backend (named queries, auto CRUD, workflows, webhooks, CDC, secrets).

They are loaded **after** `_system/` by `getSystemSkillDirs()` so upstream master
skills stay intact and this overlay can specialize without merge conflicts.

| Location | Use |
|----------|-----|
| `_system/` | Upstream-ready / platform-wide skills |
| **`_ext/`** | Fork full-stack runtime skills (this tree) |
| DB `context_skills` | Workspace-specific overrides |

See `docs/FULLSTACK_RUNTIME.md` and `docs/FORK_EXTENSIONS.md`.

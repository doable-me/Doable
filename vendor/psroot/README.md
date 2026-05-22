# Psroot — Windows AppContainer + Job Objects sandboxing

Doable's `PsrootBackend` (packages/dovault/src/backends/psroot.ts) wraps
project processes on Windows in an AppContainer + Job Object so that:

- the project can't read/write the user's home directory or registry,
- it has a memory cap, CPU rate limit, and max-process count,
- outbound network can be blocked entirely or limited to allowlisted hosts.

This requires the `psroot.exe` CLI (a small native helper). Doable does
**not** vendor the binary by default because it is a Windows-only artifact
that would bloat the repo for non-Windows contributors. Drop the binary
here and the backend picks it up automatically.

## Where to get psroot.exe

You have two options. Pick one based on whether you want a vetted upstream
build or you'd rather build it yourself.

### Option 1 — Build from source (recommended)

The reference implementation lives at <https://github.com/doable/psroot>
(or the source you maintain in-house). Clone, `cargo build --release`,
and copy `target/release/psroot.exe` into this directory.

```powershell
git clone https://github.com/doable/psroot
cd psroot
cargo build --release
cp target/release/psroot.exe <doable-repo>/vendor/psroot/psroot.exe
```

### Option 2 — Use a release binary

Download the latest signed release from the Psroot GitHub Releases page
and drop `psroot.exe` directly into this directory. Verify the SHA-256
against the release notes before committing.

## Backend resolution order

`PsrootBackend.available()` checks (in order):

1. The `DOABLE_PSROOT_PATH` env var (absolute path to a psroot.exe binary).
2. `vendor/psroot/psroot.exe` relative to the doable repo root.
3. The system PATH (via `where psroot.exe`).

The first match wins, and the resolved absolute path is used in every
spawn the backend produces.

## What gets committed

Add `psroot.exe` itself to git via `git add -f vendor/psroot/psroot.exe`.
The `.gitignore` rule below the README keeps any other binaries out so
contributors don't accidentally commit local builds.

If your install must remain unbundled (per-machine licensing, cross-org
policy), set `DOABLE_PSROOT_PATH` in `.env` instead. Production hosts on
Linux/macOS never need this — they pick a different sandbox backend.

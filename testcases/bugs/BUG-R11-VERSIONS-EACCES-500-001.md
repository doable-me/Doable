# BUG-R11-VERSIONS-EACCES-500-001 — POST /projects/:id/versions returns 500 EACCES on /boot/lost+found

- **Severity**: P2 (high — feature completely broken, leaks internal path)
- **Env**: dev (dev-api.doable.me)
- **Filed**: 2026-05-14 (Ralph R11)
- **Status**: OPEN
- **Discovered by**: R11 gap-areas smoke probes

## Repro
```bash
curl -X POST https://dev-api.doable.me/projects/4cb53939-3521-4f08-a17f-b1cc31a8e692/versions \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"createdBy":"uniquegodwin","projectPath":"/"}'
# → HTTP 500
# → {"error":"Failed to create version","message":"EACCES: permission denied, scandir '/boot/lost+found'"}
```

## Expected
- 201 with created version object
- OR 400 if `projectPath` is invalid

## Actual
- 500 with `EACCES: permission denied, scandir '/boot/lost+found'`

## Analysis
The version creation handler appears to be doing a recursive directory scan starting from a filesystem root (`/`) or `/boot` rather than the project's sandbox directory. The path `/boot/lost+found` is a system directory that should never be touched by the API. This indicates either:
1. `projectPath: "/"` is being interpreted as the filesystem root instead of the project's virtual root
2. A recursive `scandir`/`readdir` call has no path prefix/guard and walks the entire filesystem

## Information leaked
The error message exposes the internal server filesystem path `/boot/lost+found`, which reveals the OS directory structure of the server. This is a minor info-leak on top of the functional breakage.

## Recommended fix
1. Validate and sandbox `projectPath` to be within the project's working directory (e.g. `projects/<id>/` under the data root)
2. Never pass user-supplied paths directly to `fs.readdir`/`scandir` without prefix-joining and path traversal checks
3. Sanitize error messages before returning to clients — strip raw filesystem paths

## Related code
Search `services/api/src` for `scandir`, `readdir`, `readdirSync` near version creation handler.

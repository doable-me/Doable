@echo off
cd /d "c:\Users\gj\Documents\workspace\doable"
set LOGFILE=c:\Users\gj\Documents\workspace\doable\commit-result.log

echo === GIT STATUS (filtered) === > "%LOGFILE%"
git status --short -- services/api/src/projects/dev-server-ops.ts services/api/src/projects/dev-server-start.ts services/api/src/routes/thumbnails.ts services/api/src/routes/runtime.ts >> "%LOGFILE%" 2>&1

echo. >> "%LOGFILE%"
echo === STAGING === >> "%LOGFILE%"
git add services/api/src/projects/dev-server-ops.ts services/api/src/projects/dev-server-start.ts services/api/src/routes/thumbnails.ts services/api/src/routes/runtime.ts >> "%LOGFILE%" 2>&1

echo. >> "%LOGFILE%"
echo === STAGED FILES === >> "%LOGFILE%"
git diff --cached --name-only >> "%LOGFILE%" 2>&1

echo. >> "%LOGFILE%"
echo === COMMITTING === >> "%LOGFILE%"
git commit -m "fix: resolve preview stuck + thumbnail CORS + auth leak" -m "- Change internal dev server URLs from localhost to 127.0.0.1 to prevent" -m "  IPv6 resolution on Windows hitting wrong process" -m "- Add Access-Control-Allow-Origin: * to thumbnail responses for cross-origin" -m "  image loading from frontend" -m "- Narrow runtime auth middleware from /* to /projects/* to prevent it from" -m "  leaking to other route groups (thumbnails, preview)" >> "%LOGFILE%" 2>&1

echo. >> "%LOGFILE%"
echo === LAST 3 COMMITS === >> "%LOGFILE%"
git log --oneline -3 >> "%LOGFILE%" 2>&1

echo DONE >> "%LOGFILE%"

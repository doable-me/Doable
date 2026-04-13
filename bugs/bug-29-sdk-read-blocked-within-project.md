# Bug 29 — SDK read permission blocks files within project directory

**Status:** ✅ RESOLVED (2026-04-13)
**Severity:** 🟡 Medium (causes tool errors, AI retries)
**Area:** Copilot SDK permission system / sandbox interaction
**Discovered:** 2026-04-13 E2E test

## Root Cause (multi-layered)
1. `copilot-engine.ts` `resumeSession()` didn't pass `workingDirectory` to `engine.resume()` call (only to `createEngine()`)
2. `docore/engine.ts` `resume()` method didn't include `workingDirectory: this.options.workingDirectory` in resumeConfig (unlike `connect()` which did)
3. `session-manager.ts` didn't pass `workingDirectory: projectPath` when calling `eng.resumeSession()`

## Fix (3 files)
1. `session-manager.ts`: Added `workingDirectory: projectPath` to `resumeSession()` call
2. `copilot-engine.ts`: Added `workingDirectory: config?.workingDirectory` to `engine.resume()` call
3. `docore/engine.ts`: Added `workingDirectory: this.options.workingDirectory` to resumeConfig (matching `connect()` behavior)

## Verification
27 turns, 157 messages, 62K tokens with zero "blocked" or "outside allowed" errors. Previously triggered on every resumed session.
**Status:** Open

## Symptom

During the multi-turn dark mode request, the SDK attempted to read a CSS file within the project directory and received:

```
"Read blocked: path is outside your allowed directories."
```

API log:
```json
{
  "toolCallId": "tooluse_R2RqPCcBQQ2m7qamoNft...",
  "success": false,
  "error": {
    "message": "The user rejected this tool call. User feedback: Read blocked: path is outside your allowed directories.",
    "code": "denied"
  },
  "toolTelemetry": {
    "properties": {
      "command": "view",
      "fileExtension": "[\".css\"]"
    }
  }
}
```

The AI recovered by retrying with different paths and the subsequent reads succeeded. But this adds latency and wastes tokens.

## Impact

- Tool error causes a wasted turn (turn 1 ends, turn 2 starts)
- AI sees "Hit a snag — figuring it out" and has to retry
- Adds ~5-10s of latency per failed read
- Token waste from error handling in the conversation

## Expected Behavior

All files within the project directory (`services/api/projects/<id>/`) should be readable without permission errors.

## Root Cause (Likely)

This appears to come from the SDK's own internal sandboxing (not our `sandbox.ts`). The SDK's `view` tool has a path allowlist that may not include the project's working directory, or the path resolution differs between the initial session and the resumed session.

Possible factors:
- New session doesn't inherit the CWD/allowlist from the previous session
- Path resolution on Windows with backslashes vs forward slashes
- The SDK calculates allowed directories from the `cwd` passed at session start

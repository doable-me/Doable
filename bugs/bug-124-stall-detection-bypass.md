# [BUG-124] Auto-continue stall detection bypassed by wandering read loops

**Severity**: High  
**Found**: 2026-04-10 E2E test session

## Repro Steps
1. Ask the AI to debug a UI bug (e.g. "button doesn't work")
2. The AI begins investigating by reading multiple files across many auto-continue cycles
3. Each cycle reads a *slightly different* set of files (e.g. cycle 1: App.tsx + HabitForm, cycle 2: StatsPanel + layout, cycle 3: preview errors + HabitCard...)
4. Observe: AI continues running indefinitely without ever writing a fix

## Expected
Stall detection should catch this pattern and stop the loop after a reasonable number of read-only cycles (regardless of which files are being read).

## Actual
The AI ran for **6+ minutes** (370+ seconds) reading files across 6+ auto-continue cycles without writing anything. The stall detection never triggered because each cycle reads *different* files, so the fingerprint never matches.

## Root Cause
Current stall detection in `services/api/src/routes/chat.ts` uses a fingerprint of the exact file paths read in each auto-continue cycle:

```typescript
// Only detects stall if the EXACT SAME files are read twice
if (autoContinueCount > 0 && currentFingerprint === prevReadFingerprint && currentFingerprint !== "") {
  // stall detected
}
```

This catches the case where the AI reads `[fileA, fileB]` → stops → continues → reads `[fileA, fileB]` again. But it **misses** the wandering investigation pattern: `[fileA, fileB]` → `[fileC, fileD]` → `[fileE, fileF]` → ... where the AI reads different files each time but never writes.

## Suggested Fix
Add a secondary stall condition based on **write-free cycles**:

```typescript
// Track consecutive read-only auto-continue cycles
let consecutiveReadOnlyCycles = 0;
const MAX_READ_ONLY_CYCLES = 3; // Stop after 3 cycles with no writes

// In each auto-continue loop, check if any files were written
const wroteFiles = toolResults.some(r => 
  r.toolName === 'write_file' || r.toolName === 'create_file' || r.toolName === 'update_file'
);

if (!wroteFiles && onlyReadTools) {
  consecutiveReadOnlyCycles++;
  if (consecutiveReadOnlyCycles >= MAX_READ_ONLY_CYCLES) {
    // Stop: AI is investigating but not acting
    stopReason = "I've been reading files without making changes. Please provide more specific guidance about what to fix.";
    break;
  }
} else {
  consecutiveReadOnlyCycles = 0; // Reset when writes happen
}
```

## Additional Root Cause (from parallel observer)
The AI said "Let me check the live preview for errors:" and then called a tool to fetch/read the live preview URL. That tool call hung indefinitely with no timeout — blocking the entire generation. This is a separate but related issue: any tool that makes an outbound HTTP request (e.g. fetching the preview at `localhost:4000/preview/<id>/`) needs a timeout, otherwise it can block a chat turn forever.

## Evidence
- Turn 3 debug request ran 370+ seconds (confirmed by two independent observers)
- Status bar showed "This one's taking a while — still going..." at 200s, 300s
- Chat showed "Reading file" items repeating for 6+ auto-continue cycles  
- No "Updating file" or "Creating file" events during the entire run
- AI's last visible action: "Let me check the live preview for errors:" — tool call after this hung
- Had to manually click "Stop Doable" to terminate

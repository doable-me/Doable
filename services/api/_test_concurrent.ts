/**
 * Concurrent Project Testing Script
 * 
 * Tests creating and generating multiple projects simultaneously to verify:
 * 1. Multiple projects can be created concurrently
 * 2. Multiple scaffolds can run concurrently
 * 3. Multiple dev servers can run concurrently
 * 4. Multiple AI chat sessions can run concurrently
 * 5. Thumbnails are generated for all projects
 */
import { SignJWT } from "jose";

const API = "http://localhost:4000";
const USER_ID = "0ff7b403-24dd-4609-8d06-d594a6551658";
const JWT_SECRET = "change-me-to-a-64-char-random-string";

async function getToken(): Promise<string> {
  const secret = new TextEncoder().encode(JWT_SECRET);
  return new SignJWT({ sub: USER_ID, email: "uniquegodwin@gmail.com" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("doable")
    .setExpirationTime("1h")
    .sign(secret);
}

async function fetchAPI(path: string, options: RequestInit = {}) {
  const token = await getToken();
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  return res;
}

async function createProject(name: string): Promise<string> {
  const res = await fetchAPI("/projects", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Create failed: ${JSON.stringify(data)}`);
  console.log(`  ✓ Created project "${name}" → ${data.data.id}`);
  return data.data.id;
}

async function scaffoldProject(projectId: string): Promise<{ previewUrl: string | null }> {
  const res = await fetchAPI(`/projects/${projectId}/scaffold`, { method: "POST" });
  const data = await res.json();
  if (!res.ok) throw new Error(`Scaffold failed: ${JSON.stringify(data)}`);
  console.log(`  ✓ Scaffolded ${projectId.slice(0, 8)} → preview: ${data.data.previewUrl ?? "none"}`);
  return { previewUrl: data.data.previewUrl };
}

async function sendChat(projectId: string, message: string): Promise<{ text: string; toolCalls: number }> {
  const res = await fetchAPI(`/projects/${projectId}/chat`, {
    method: "POST",
    body: JSON.stringify({ content: message, mode: "agent" }),
  });

  if (!res.ok) {
    const errData = await res.text();
    throw new Error(`Chat failed: ${errData}`);
  }

  // Read SSE stream
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  let toolCalls = 0;
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      try {
        const parsed = JSON.parse(line.slice(5).trim());
        if (parsed.type === "text_delta") fullText += parsed.data;
        if (parsed.type === "tool_call") toolCalls++;
      } catch {
        // Not JSON or incomplete
      }
    }
  }

  return { text: fullText, toolCalls };
}

async function checkThumbnail(projectId: string): Promise<boolean> {
  const res = await fetch(`${API}/thumbnails/${projectId}.png`);
  return res.ok;
}

// ─── Main test ─────────────────────────────────────────────

const PROJECT_CONFIGS = [
  { name: "Concurrent Test - Calculator", prompt: "Build a colorful calculator app with big round buttons and a gradient background. Use CSS grid for the button layout." },
  { name: "Concurrent Test - Clock", prompt: "Build a beautiful analog clock with hour, minute and second hands on a dark background. Use CSS transforms for the hands." },
];

async function runTest() {
  console.log("═══ CONCURRENT PROJECT TEST ═══\n");

  // Step 1: Create projects concurrently
  console.log("1. Creating projects concurrently...");
  const projectIds = await Promise.all(
    PROJECT_CONFIGS.map((c) => createProject(c.name))
  );
  console.log(`   Created ${projectIds.length} projects\n`);

  // Step 2: Scaffold projects concurrently
  console.log("2. Scaffolding projects concurrently...");
  const scaffoldResults = await Promise.all(
    projectIds.map((id) => scaffoldProject(id))
  );
  console.log(`   Scaffolded ${scaffoldResults.length} projects\n`);

  // Wait for dev servers to fully start
  console.log("3. Waiting 3s for dev servers to stabilize...");
  await new Promise((r) => setTimeout(r, 3000));

  // Step 3: Send AI messages concurrently
  console.log("4. Sending AI messages concurrently...");
  const startTime = Date.now();
  
  const chatResults = await Promise.allSettled(
    projectIds.map((id, i) => {
      console.log(`   → Sending to ${id.slice(0, 8)}: "${PROJECT_CONFIGS[i].prompt.slice(0, 50)}..."`);
      return sendChat(id, PROJECT_CONFIGS[i].prompt);
    })
  );

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`   Completed in ${elapsed}s\n`);

  for (let i = 0; i < chatResults.length; i++) {
    const result = chatResults[i];
    const id = projectIds[i].slice(0, 8);
    if (result.status === "fulfilled") {
      console.log(`   ✓ ${id}: ${result.value.toolCalls} tool calls, ${result.value.text.length} chars response`);
    } else {
      console.log(`   ✗ ${id}: FAILED — ${result.reason}`);
    }
  }

  // Step 4: Wait for thumbnails (they're async with delay)
  console.log("\n5. Waiting 15s for thumbnail captures...");
  await new Promise((r) => setTimeout(r, 15000));

  console.log("6. Checking thumbnails...");
  for (let i = 0; i < projectIds.length; i++) {
    const hasThumbnail = await checkThumbnail(projectIds[i]);
    const id = projectIds[i].slice(0, 8);
    console.log(`   ${hasThumbnail ? "✓" : "✗"} ${id} (${PROJECT_CONFIGS[i].name}): ${hasThumbnail ? "HAS thumbnail" : "NO thumbnail"}`);
  }

  // Summary
  console.log("\n═══ TEST COMPLETE ═══");
  const succeeded = chatResults.filter((r) => r.status === "fulfilled").length;
  console.log(`Chat success: ${succeeded}/${chatResults.length}`);
  
  // Cleanup: delete test projects
  console.log("\n7. Cleaning up test projects...");
  for (const id of projectIds) {
    try {
      await fetchAPI(`/projects/${id}`, { method: "DELETE" });
      console.log(`   ✓ Deleted ${id.slice(0, 8)}`);
    } catch {
      console.log(`   ✗ Failed to delete ${id.slice(0, 8)}`);
    }
  }
}

runTest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
  });

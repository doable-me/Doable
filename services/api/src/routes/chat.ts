import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

export const chatRoutes = new Hono();

// ─── In-memory chat storage (replace with DB in production) ─
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

const chatHistories = new Map<string, ChatMessage[]>();

function getChatHistory(projectId: string): ChatMessage[] {
  if (!chatHistories.has(projectId)) {
    chatHistories.set(projectId, []);
  }
  return chatHistories.get(projectId)!;
}

function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ─── POST /projects/:id/chat ─ SSE streaming response ───────
const sendMessageSchema = z.object({
  content: z.string().min(1).max(32_000),
  mode: z.enum(["agent", "plan"]).default("agent"),
});

chatRoutes.post(
  "/projects/:id/chat",
  zValidator("json", sendMessageSchema),
  async (c) => {
    const projectId = c.req.param("id");
    const { content, mode } = c.req.valid("json");
    const history = getChatHistory(projectId);

    // Store user message
    const userMessage: ChatMessage = {
      id: generateId(),
      role: "user",
      content,
      timestamp: new Date().toISOString(),
    };
    history.push(userMessage);

    // Generate AI response (placeholder - replace with real AI call)
    const assistantId = generateId();
    const responseText = generatePlaceholderResponse(content, mode);

    return streamSSE(c, async (stream) => {
      // Simulate streaming by chunking the response
      const words = responseText.split(" ");
      let accumulated = "";

      for (let i = 0; i < words.length; i++) {
        accumulated += (i > 0 ? " " : "") + words[i];

        await stream.writeSSE({
          data: JSON.stringify({
            type: "text_delta",
            data: (i > 0 ? " " : "") + words[i],
          }),
        });

        // Simulate delay
        await new Promise((resolve) => setTimeout(resolve, 30));
      }

      // Store complete assistant message
      const assistantMessage: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: accumulated,
        timestamp: new Date().toISOString(),
      };
      history.push(assistantMessage);

      // Send done event
      await stream.writeSSE({
        data: "[DONE]",
      });
    });
  }
);

// ─── GET /projects/:id/chat/history ─ Chat history ──────────
chatRoutes.get("/projects/:id/chat/history", (c) => {
  const projectId = c.req.param("id");
  const history = getChatHistory(projectId);

  return c.json({ data: history });
});

// ─── DELETE /projects/:id/chat ─ Clear chat ─────────────────
chatRoutes.delete("/projects/:id/chat", (c) => {
  const projectId = c.req.param("id");
  chatHistories.delete(projectId);

  return c.json({ data: { cleared: true } });
});

// ─── Placeholder Response Generator ─────────────────────────
function generatePlaceholderResponse(
  userMessage: string,
  mode: string
): string {
  if (mode === "plan") {
    return `Here's my plan for: "${userMessage}"

**Step 1: Analyze Requirements**
I'll break down the requirements and identify key components needed.

**Step 2: Create File Structure**
Set up the necessary files and directories.

**Step 3: Implement Core Logic**
Build the main functionality with TypeScript and React.

**Step 4: Add Styling**
Apply Tailwind CSS for a polished look.

**Step 5: Test & Refine**
Verify everything works and make adjustments.

Would you like me to proceed with this plan?`;
  }

  return `I'll help you with that! Let me work on: "${userMessage}"

I'm generating the code now. Here's what I'm building:

\`\`\`tsx
// Component generated based on your request
export function GeneratedComponent() {
  return (
    <div className="p-4">
      <h1>Generated Content</h1>
      <p>This is a placeholder response.</p>
    </div>
  );
}
\`\`\`

The files have been created and the preview should update shortly. Let me know if you'd like any changes!`;
}

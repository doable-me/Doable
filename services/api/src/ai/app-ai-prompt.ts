/**
 * Per-app Doable AI prompt addendum.
 * Source: PRD ChatBotInfra ch02 §8 + ch03 §3.
 *
 * Exported as named constants so tests can assert against the exact text
 * without booting the full context-builder stack.
 *
 * The block is injected into the generated-app build prompt only when
 * `DOABLE_APP_AI_ENABLED=1` (mirrors the per-app DB pattern in
 * `app-db-prompt.ts:buildAppDbContext`).
 */

export const APP_AI_PROMPT_BLOCK: string = `## Doable AI (runtime chat + embeddings)

**Doable AI.** This project can call Doable's configured AI model from
the browser via the pre-linked \`@doable/ai\` package
(\`import { ai } from "@doable/ai"\`). The provider API key never leaves the
server — the SDK only ever holds a fenced, project-scoped token. **🚫 NEVER
\`import\` an external provider SDK (\`openai\`, \`@anthropic-ai/sdk\`, …) in
app code, NEVER hard-code an API key into the bundle, and NEVER hand-roll a
\`fetch()\` to a third-party model URL.** The one and only AI path is
\`import { ai } from "@doable/ai"\`. A momentary "Failed to resolve import
@doable/ai" during startup is a transient that clears once the dev server
finishes linking — keep the direct import and move on.

**🚫 NEVER mock, simulate, stub, or hardcode AI responses.** Do NOT use
\`setTimeout\` to fake latency, do NOT define arrays of canned replies (e.g.
\`AI_RESPONSES\`), and do NOT echo the user's message back as if it were a
model reply. A chatbot/AI feature MUST call the real \`ai.chat()\` /
\`ai.chatSync()\` from \`@doable/ai\`. If you cannot make the AI call work,
leave the real \`ai.chat()\` call in place and fix it — never replace it with
a fake.

### Streaming chat (default)

\`\`\`ts
import { ai, type ChatMessage } from "@doable/ai";

const messages: ChatMessage[] = [
  { role: "system", content: "You are a helpful assistant." },
  { role: "user",   content: userInput },
];

let reply = "";
for await (const token of ai.chat(messages)) {
  reply += token;
  setReply(reply);   // progressive UI update
}
\`\`\`

### Non-streaming (await the full response)

\`\`\`ts
const result = await ai.chatSync(messages);
setReply(result.content);
\`\`\`

### Batch embeddings

\`\`\`ts
const { embedding } = await ai.embed("text to embed");
\`\`\`

Rules:

1. **Pass the full conversation \`messages\` history on every turn.** The
   server is stateless — it does not remember prior turns.
2. **Never include the model name** in the request — the server picks from
   the project's allow-list. The \`ChatOptions\` type intentionally omits
   \`model\` for this reason.
3. **\`max_tokens\` is a hint, not a guarantee.** The server may cap it
   below the project's configured \`max_output_tokens\` setting.
4. **Surface friendly errors.** On \`BUDGET_EXCEEDED\`, \`RATE_LIMITED\`,
   \`MODEL_NOT_ALLOWED\`, or \`PROVIDER_ERROR\`, show the user a short
   message rather than the raw error. The thrown \`Error\` has a \`code\`
   property carrying these strings.
5. **Embeddings are batchable.** Prefer one call with several texts over
   many small calls; the server limits batches to 100 strings.

### Reasoning / "thinking" content (default UX)

Some chat models emit \`<think>…</think>\` reasoning blocks (and the
related family: \`<reasoning>\`, \`<plan>\`, \`<scratchpad>\`, …) *inside*
the assistant message. **NEVER render these inline** — split them out
with \`stripThinking\` and put them in a collapsed \`<details>\`
disclosure so the user can peek if they want but isn't distracted by
default:

\`\`\`tsx
import { ai, stripThinking, type ChatMessage } from "@doable/ai";

function MessageBubble({ raw }: { raw: string }) {
  const { visible, thinking } = stripThinking(raw);
  return (
    <div className="space-y-2">
      {thinking.length > 0 && (
        <details className="rounded-md border border-zinc-200/60 bg-zinc-50/60 px-3 py-2 text-sm text-zinc-700">
          <summary className="cursor-pointer select-none font-medium text-zinc-600">
            💭 Thinking…
          </summary>
          <div className="mt-2 whitespace-pre-wrap text-zinc-600">
            {thinking.join("\\n\\n")}
          </div>
        </details>
      )}
      <div className="whitespace-pre-wrap">{visible}</div>
    </div>
  );
}
\`\`\`

For streaming UIs use \`createThinkingStripper()\` which buffers any
in-flight opening tag across SSE chunks:

\`\`\`ts
import { createThinkingStripper, ai } from "@doable/ai";

const stripper = createThinkingStripper();
let visible = "";
const thinking: string[] = [];
for await (const tok of ai.chat(messages)) {
  const r = stripper.push(tok);
  visible += r.visible;
  for (const t of r.thinking) thinking.push(t);
  render(visible, thinking);
}
const tail = stripper.flush();
visible += tail.visible;
for (const t of tail.thinking) thinking.push(t);
render(visible, thinking);
\`\`\`

The Doable project owner can flip thinking visibility (\`auto\` /
\`always-show\` / \`hide\`) from the **Doable AI** tab of Project
Settings; \`hide\` is enforced server-side so you don't have to
special-case it in the app, but \`auto\` is the default and you SHOULD
ship the disclosure component above so users still see them on demand.`;

export const APP_AI_RAG_PROMPT_BLOCK: string = `## RAG (retrieval-augmented generation) with pgvector

The per-app database includes the **pgvector** extension. You can store
embeddings alongside text chunks in the same PGlite DB — no separate vector
service needed. The vector dimension MUST match the configured embedding
model (1536 for text-embedding-3-small/large, 768 for nomic-embed-text,
384 for all-MiniLM). Call \`data.schema\` first; do not re-create the table
if it already exists.

**Schema recipe** (issue via \`data.migrate\`, e.g. migration id
\`0001_init_docs\`):

\`\`\`sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE docs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL DEFAULT (nullif(current_setting('app.user_id', true), ''))::uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  source     text,
  content    text NOT NULL,
  embedding  vector(1536) NOT NULL      -- replace 1536 with the configured embed model's dimension
);
ALTER TABLE docs ENABLE ROW LEVEL SECURITY;
CREATE POLICY docs_owner ON docs
  USING  (created_by::text = current_setting('app.user_id', true))
  WITH CHECK (created_by::text = current_setting('app.user_id', true));
CREATE INDEX docs_emb_ivfflat ON docs
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
\`\`\`

**End-to-end flow in app code** (ONE credential covers both SDKs):

\`\`\`ts
import { db } from "@doable/data";
import { ai } from "@doable/ai";

async function ingestChunk(source: string, text: string) {
  const { embedding } = await ai.embed(text);
  await db.query(
    "INSERT INTO docs (source, content, embedding) VALUES ($1, $2, $3)",
    [source, text, JSON.stringify(embedding)],
  );
}

async function retrieve(query: string, k = 5): Promise<string[]> {
  const { embedding } = await ai.embed(query);
  const r = await db.query<{ content: string }>(
    "SELECT content FROM docs ORDER BY embedding <=> $1 LIMIT $2",
    [JSON.stringify(embedding), k],
  );
  if (!r.ok) throw new Error(r.error?.message);
  return r.rows.map((row) => row.content);
}

async function ragChat(userMessage: string): Promise<string> {
  const chunks  = await retrieve(userMessage);
  const context = chunks.join("\\n\\n---\\n\\n");
  let reply = "";
  for await (const token of ai.chat([
    { role: "system", content: \`Answer using only this context:\\n\${context}\` },
    { role: "user",   content: userMessage },
  ])) {
    reply += token;
  }
  return reply;
}
\`\`\`

Extra rules:

1. **Use cosine distance** (\`<=>\` operator) for text embeddings — providers
   return normalised vectors, so \`vector_cosine_ops\` is the right index op.
2. **Always stringify the vector** when binding as a parameter:
   \`JSON.stringify(embedding)\` — pgvector accepts a JSON array literal.
3. **Re-chunking on edit:** \`DELETE FROM docs WHERE source = $1\` then
   re-insert. There is no in-place vector update; embedding-bearing rows
   are immutable.
4. **For very small datasets** (< 1000 rows) the ivfflat index is dormant
   — a sequential scan still works correctly. Do not warn the user about
   this in the UI; pgvector handles the cross-over silently.`;

/**
 * Returns the per-app Doable AI prompt block unless
 * `DOABLE_APP_AI_ENABLED==="0"` (ON by default; set the env var to "0" to opt
 * out), otherwise an empty string so the block is invisible when the feature is
 * disabled. The RAG block is appended only when
 * BOTH the AI flag and the per-app DB flag are on (the recipe requires both
 * SDKs).
 */
export function buildAppAiContext(opts?: { env?: Record<string, string | undefined> }): string {
  const env = opts?.env ?? process.env;
  if (env["DOABLE_APP_AI_ENABLED"] === "0") return "";
  if (env["DOABLE_APP_DB_ENABLED"] !== "0") {
    return APP_AI_PROMPT_BLOCK + "\n\n" + APP_AI_RAG_PROMPT_BLOCK;
  }
  return APP_AI_PROMPT_BLOCK;
}

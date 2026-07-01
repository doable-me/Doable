# NotebookLM MCP Server & Chrome Extension

A powerful Model Context Protocol (MCP) server that connects AI assistants (like ChatGPT/Claude) to Google's NotebookLM. It enables features like **visual infographic generation**, **smart summarization**, and **structured Q&A** directly within your chat interface.

## 🚀 Features

### 1. **Visual Infographic Generation** (Async)
- Generates beautiful, visual infographics from YouTube videos or NotebookLM sources.
- **Asynchronous Design:** Handles long-running generation (1-3 mins) without timeouts.
- **Dedicated Viewer UI:** Returns a structured "App" window to view, download, or open the infographic.

### 2. **Structured UI for All Tools**
- **Rich Interaction:** Instead of plain text, tools return interactive UI components.
- **Formatted Summaries:** `generate_summary` returns beautifully styled markdown with `white-space: pre-wrap`.
- **Source Lists:** `list_sources` displays a structured list of citations and links.
- **Interactive Q&A:** `ask_question` presents answers in a chat-like bubble.

### 3. **Context-Aware Intelligence**
- **Session Persistence:** Remembers your "active notebook" across messages.
- **Implicit Context:** Ask "What does *it* say about X?" without re-pasting URLs.
- **Smart Source Detection:** Automatically finds and uses the correct `source_id` for queries.

### 4. **Robust Browser Management**
- **Auto-Recovery:** `ensureBrowserReady()` detects if the browser crashes and auto-restarts it instantly.
- **Auto-Login:** Detects authentication failures and launches a login window for you.
- **Race Condition Handling:** Ensures resources (like images) are fully downloaded before marking jobs as complete.

---

## 🛠️ Prerequisites

- **Node.js** (v20.0.0 or higher)
- **npm** (v10+)
- **ngrok** (Recommended for stability) or `cloudflared`
- **Google Account** (for NotebookLM access)

---

## ⚙️ Setup Guide (For New Users)

If you are cloning this repository, follow these steps to get running.

### 1. Installation
```bash
git clone <your-repo-url>
cd Chrome_extension
npm install
```

### 2. Path Configuration (Zero Config)
The server automatically manages:
*   `user_data`: Stores your Google login session (created in project root).
*   `server.log`: Logs debug information (created in project root).
*   `cache.json`: Caches NotebookLM IDs to speed up queries (created in project root).

**No manual path updates are required in the code.** Just ensure these files are **gitignored** (already set up) to protect your session data.

### 3. Build
Compile the TypeScript server and the frontend UI assets:
```bash
npm run build
```

### 4. Start the Server
Run the server in HTTP mode:
```bash
node dist/server.js
```
*The server will listen on port 3001.*

### 5. Expose via Tunnel (ngrok)
To allow ChatGPT/Claude to connect, you need a public URL.
```bash
ngrok http 3001
```
*Copy the HTTPS URL provided by ngrok (e.g., `https://random-id.ngrok-free.app`).*

### 6. Configure Your AI Assistant
- **ChatGPT:** Go to **Drafts / GPT Builder** -> **Actions** -> **Import from URL** -> Paste your ngrok URL + `/mcp`.
- **Claude Desktop:** Add the ngrok URL (or local URL if supported) to your `claude_desktop_config.json`.

---

## ⚠️ Challenges & Solutions (Dev Log)

During development, we solved several critical engineering challenges:

### 1. **The "502 Bad Gateway" & Connection Stability**
*   **Challenge:** Tunnels would drop or return 502s arbitrarily.
*   **Solution:** Switched to **ngrok** for better stability over Cloudflare Quick Tunnels. Implemented robust error handling in the server to catch process exits.

### 2. **Browser Session Crashes**
*   **Challenge:** The Playwright browser instance would sometimes close or disconnect (e.g., after laptop sleep), causing `Target page, context or browser has been closed` errors.
*   **Solution:** Implemented a **Health Check Strategy** (`ensureBrowserReady`). Before every critical operation (like generating an infographic), the code checks if the browser is alive. If not, it seamlessly re-launches purely in the background.

### 3. **Async Job Race Conditions**
*   **Challenge:** Tool would report "Job Completed" before the large image file finished downloading to the server. This resulted in the UI showing "Image Not Found" or raw text.
*   **Solution:** Refactored the job queue logic. The status is now marked 'completed' strictly **AFTER** the `sharp` image processing pipeline finishes writing the buffer.

### 4. **Rich UI Rendering (MCP Apps)**
*   **Challenge:** ChatGPT's MCP client sometimes displayed raw JSON text instead of the interactive viewer.
*   **Solution:**
    *   Updated `mcp-app.ts` to implement a **hybrid rendering strategy**.
    *   It first checks for a binary `image` part.
    *   If missing, it parses the text response using regex to extract image URLs and renders them dynamically.
    *   Added `white-space: pre-wrap` CSS to preserve markdown formatting in text responses.

---

## 📂 Project Structure

*   `src/server.ts` - Main entry point. Defines all MCP tools and handles HTTP requests.
*   `src/notebooklm_client.ts` - Playwright automation layer for interacting with Google NotebookLM.
*   `src/mcp-app.ts` - Frontend logic for the structured UI viewer.
*   `public/infographic-viewer.html` - The HTML template for the infographic result page.
*   `user_data/` - (Gitignored) Chrome user profile data for session persistence.

---

## 📝 Usage Tips

*   **First Run:** The first time you ask a question, a browser window may pop up asking you to **log in to Google**. Log in, and the window will close automatically.
*   **Infographics:** Generating an infographic takes ~1 minute. The tool returns a "Job Started" message instantly. Ask "Check status" after a minute to see the result.
*   **Context:** You don't need to paste the video URL every time. Just say "Summarize it" or "Ask a question about the video".

---
**Created by:** Hari Vishnu S & Antigravity (Google DeepMind)

# NotebookLM MCP Server

This project allows Claude Desktop to interact with **Google NotebookLM** to automatically generate and retrieve infographics from YouTube videos. It functions as a Model Context Protocol (MCP) server, bridging the gap between Claude's interface and Google's internal APIs.

## 🛠️ How It Works

The system operates as a **headless browser automation agent** (using Playwright) wrapped in an **MCP Server**.

1.  **User Request**: You ask Claude to "Generate an infographic for [YouTube URL]".
2.  **MCP Server (`server.ts`)**: Receives the tool call and delegates it to the `NotebookLMClient`.
3.  **Automation Client (`notebooklm_client.ts`)**:
    *   Launches a headless Chrome instance with persistent user data (cookies).
    *   Navigates to NotebookLM and acquires session tokens (`at`, `bl`, `fsid`).
    *   **RPC Execution**: Instead of clicking buttons, it reverse-engineered Google's internal RPC (Remote Procedure Call) endpoints (`batchexecute`) to programmatically create notebooks, add sources, and trigger generation.
4.  **Polling**: The client polls the "List Artifacts" RPC until the specific "Infographic" artifact appears.
5.  **Retrieval**: The tool downloads the generated image and returns it directly to Claude.

---

## 🏗️ System Architecture

*   **`server.ts`**: The entry point. Uses `McpServer` to expose tools:
    *   `generate_infographic(video_url)`: The main driver.
    *   `fetch_infographic(notebook_id)`: Helper to retrieve an image if the initial generation timed out or failed.
*   **`notebooklm_client.ts`**: A robust wrapper around Playwright.
    *   Handles Google Authentication (via `user_data` directory).
    *   Manages the complex RPC payload structures required to talk to NotebookLM.
    *   Handles authenticated file downloads.

## Phase 2:
An MCP (Model Context Protocol) server that connects ChatGPT, Claude, and other AI assistants to **Google NotebookLM**. Generate summaries, ask questions, and create infographics from YouTube videos and documents.

## ✨ Features

- **Video Summarization**: Get comprehensive summaries of YouTube videos
- **Q&A**: Ask questions about video content
- **Infographic Generation**: Create visual infographics from videos
- **Multi-User Support**: Share the server with multiple users, each using their own Google account

---

## 🐛 The Debugging Journey & Solutions

Getting the infographic to actually render in Claude was a significant engineering challenge involving three major hurdles.

### 1. The Authentication Wall
*   **Problem**: Initially, we tried descending the image URL using the standard Python `requests` library.
*   **Symptom**: The download would return a 200 OK, but the content was a Google Login HTML page (hidden redirect), not an image.
*   **Reason**: The image URLs (`lh3.googleusercontent.com/...`) require specific session cookies to access. `requests` does not share the browser's authenticated state.
*   **Fix**: We switched to using the **Playwright Browser Context**. This allows us to "borrow" the active session cookies from the headless browser window.

### 2. The CORS Trap
*   **Problem**: We tried to download the image using JavaScript execution inside the page (`page.evaluate(fetch(url))`).
*   **Symptom**: `TypeError: Failed to fetch`.
*   **Reason**: **CORS (Cross-Origin Resource Sharing)**. The script running on `notebooklm.google.com` is not allowed to fetch data from `googleusercontent.com` via XHR/Fetch due to browser security policies.
*   **Fix**: We switched to **Playwright's APIRequestContext** (`context.request.get()`). This interacts with the network layer *outside* the page's sandbox but *inside* the browser's cookie jar. It bypasses CORS completely while maintaining authentication.

### 3. The "Silent Crash" (Payload Size)
*   **Problem**: After fixing the download, the tool would run successfully, but Claude would show a generic "Tool execution failed" or "Disconnected" error.
*   **Symptom**: The server logs showed the image was downloaded and encoded... and then silence.
*   **Reason**: The original images from NotebookLM are massive (approx. **10MB** PNGs). This exceeded the payload size limits for the MCP connection or triggered timeouts in Claude's processing.
*   **Fix**: We implemented an optimization pipeline in `server.ts`:
    1.  **Resize**: Any image wider than 1024px is resized (using High-Quality Lanczos resampling).
    2.  **Compress**: The image is converted from PNG to **JPEG** (Quality 85).
    *   **Result**: Payload reduced from ~10MB to **~300KB**.

## 🔐 Authentication Workflow

Since NotebookLM does not have a public API, this tool relies on **browser cookies**.

### What happens if I am not logged in?
1.  **Server Check**: When you make a request, the server launches a **headless** browser.
2.  **Redirect Detection**: If Google redirects to a login page (`accounts.google.com`), the server detects this.
3.  **Error**: Since the server is headless (invisible), it cannot let you type your password. It will fail and return an error:
    > *"Authentication required. Please run with headless=False first to login."*


### How to Authenticate (First Time Setup)
To fix this, we provided a dedicated script: `src/setup_auth.ts`.

1.  Stop the MCP server.
2.  Run the setup script:
   ```bash
   npm run setup
   ```
3.  **Manual Login**: A visible Chrome window will open. Log in to your Google Account manually.
4.  **Token Capture**: Once you reach the NotebookLM dashboard, the script captures the session cookies and saves them to the `user_data/` directory.
5.  **Restart**: Close the window and restart the MCP server (`npm start`). The server now has the "key" (cookies) to work headlessly.

## ✅ Final Solution
The robust pipeline is now:
`RPC Trigger` -> `Poll Loop` -> `Playwright API Download (Auth+CORS safe)` -> `Pillow Resize/Compress` -> `Base64 Return`.

---

## 📝 Feature: Video Summary Tool

We have added a powerful new tool: `generate_summary(video_url)`.
This tool automatically:
1.  Creates a notebook for the YouTube video.
2.  Triggers the internal "Summarize" chat action.
3.  Streams the response and extracts the **Final, Clean Summary** with citations.

### 🐛 Debugging the Summary Tool (Complex Stream Parsing)

Extracting a clean text summary from Google's internal `GenerateFreeFormStreamed` endpoint was significantly harder than the image generation.

#### 1. The "Stream of Thought" Problem
*   **Challenge**: The API streams the response in multiple chunks. Early chunks contain "Chain of Thought" reasoning (e.g., "Thinking...", "Reading transcript...").
*   **Refinement**: Later chunks *overwrite* previous ones with more polished text.
*   **Solution**: We implemented a **"Last Write Wins"** strategy. Instead of appending every chunk (which resulted in a messy log of the AI's internal monologue), we continuously parse the stream and overwrite our buffer. The final chunk always contains the complete, polished answer.

#### 2. The "Nested JSON" Nightmare
*   **Challenge**: The stream format is a "JSON Miner's" worst nightmare. It consists of:
    *   Length-prefixed raw bytes.
    *   Multiple JSON objects concatenated together.
    *   Deeply nested arrays (often 5-6 levels deep).
    *   JSON strings *inside* JSON strings (double-encoded).
*   **Solution**: We built a robust **recursive parser (`walk` function)**. It traverses the arbitrary JSON structure, identifies specific keys (`wrb.fr`), and recursively decodes inner JSON strings until it finds the actual payload.

#### 3. The "Artifact" Invasion (UUIDs & Transcripts)
*   **Challenge**: Even after extracting the final answer, the output contained garbage:
    *   **Citation IDs**: Random 36-character UUIDs (`d53235fd-...`) interspersed in the text.
    *   **Raw Transcripts**: Huge blocks of timestamped transcript text (`[StartMs, EndMs, ["Text"]]`) leaking into the summary.
*   **Solution**: We implemented strict **Heuristic Filters**:
    *   **UUID Filter**: Any text string exactly 36 characters long is aggressively removed.
    *   **Anti-Transcript Heuristic**: The recursive walker detects JSON lists that start with integer timestamps (e.g., `[4000, 5000, ...]`) and **blocks** them entirely. This ensures we only extract the AI's generated summary, not the raw source text.

#### 4. The "Read-Only" Error
*   **Challenge**: The tool worked in local tests but crashed in the MCP server with `[Errno 30] Read-only file system`.
*   **Reason**: We left a debug flag on that tried to write a 100MB `payload_dump.txt` file to disk. The MCP server runs in a restricted environment.
*   **Solution**: Removed file logging.

### 🏗️ Implementation Details
The core logic resides in `src/notebooklm_client.ts`:
*   `_parse_streamed_response`: Handles the raw byte stream and "JSON Mining".
*   `_extract_wrb_text`: The recursive extraction engine with the Heuristic Filters.
*   `generate_summary`: Orchestrates the RPC call and returns the final clean string.

## 🚀 Quick Start

### Prerequisites

- **Node.js** 20.19+ or 22.12+ (recommended)
- **npm** (comes with Node.js)
- **Google Chrome** browser
- A **Google Account** logged into NotebookLM

### Installation

```bash
# 1. Clone/download the project
cd Chrome_extension

# 2. Install dependencies
npm install

# 3. Build the project
npm run build

# 4. Install Chrome Extension (see below)
```

---

## 📋 Terminal Commands

You need **3 terminals** running simultaneously:

### Terminal 1: MCP Server
```bash
cd /path/to/Chrome_extension
npm start
```
The server runs on `http://localhost:3001`.

### Terminal 2: Cloudflare Tunnel (for remote access)
```bash
cd /path/to/Chrome_extension
cloudflared tunnel --url http://localhost:3001
```
This creates a public URL like `https://xyz-abc.trycloudflare.com`.

### Terminal 3: (Optional) Watch logs
```bash
cd /path/to/Chrome_extension
tail -f server.log
```

---

## 🧩 Chrome Extension Setup

1. **Build the extension icons** (if needed):
   Run `npm run build` to generate the `dist` folder.

2. **Load the extension in Chrome**:
   - Navigate to `chrome://extensions/`
   - Enable **Developer mode** (top right)
   - Click **Load unpacked**
   - Select the `Chrome_extension` folder

3. **Verify**: Click the extension icon to open the popup. You should see a "Sync Cookies" button.

---

## 👤 Single-User Mode (Local Use)

If you're the only user:

1. Start the server (`npm start`)
2. Click the Chrome extension icon
3. Click **"Sync Cookies"**
4. Use your Cloudflare link with ChatGPT or Claude

Your cookies are automatically saved to `user_data/user_cookies.json` and persist across restarts.

---

## 👥 Multi-User Mode (Sharing with Others)

If you want to share your server with multiple people (e.g., friends or team):

### For the Server Admin (You)

1. Start the server and Cloudflare tunnel
2. Share your Cloudflare URL with others

### For Each User

1. **Install the Chrome Extension** on their machine
2. **Open the Registration Page**: Visit `<your-cloudflare-url>/register.html`
   > Note: `register.html` is served by the MCP server.
   > **Important**: This page might not be served correctly if not built or if server routes are not set up. This feature assumes `register.html` is available.
3. **Generate a Token**: Click "Generate New Token" and copy it
4. **Configure Extension**: Open the extension popup and enter:
   - **Server URL**: Your Cloudflare URL (e.g., `https://xyz.trycloudflare.com`)
   - **User Token**: The token they generated
5. **Sync Cookies**: Click "Sync Cookies"
6. **Use with AI**: When calling tools, include their token:
   - Example: *"Summarize https://youtube.com/watch?v=xxx with token user_abc123..."*

---

## 🛠️ Available MCP Tools

| Tool | Description |
|------|-------------|
| `generate_summary` | Get a comprehensive summary of a YouTube video |
| `ask_question` | Ask questions about video content |
| `list_sources` | List all sources in a notebook |
| `generate_infographic` | Create a visual infographic |
| `check_infographic_status` | Check generation progress |
| `get_active_notebook` | Get the current session's notebook |

### Example Prompts

```
Summarize this video: https://www.youtube.com/watch?v=dQw4w9WgXcQ

What are the main points in https://www.youtube.com/watch?v=xyz?

Create an infographic for https://www.youtube.com/watch?v=abc
```

### Multi-User Example

```
Summarize https://www.youtube.com/watch?v=xyz with token user_abc123def456
```

---

## 🔧 Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `NOTEBOOKLM_HEADLESS` | `true` | Run Playwright in headless mode |

### Files

| Path | Purpose |
|------|---------|
| `user_data/user_cookies.json` | Stored user cookies (auto-generated) |
| `cache.json` | Notebook/source ID cache |
| `server.log` | Server logs |

---

## 🐛 Troubleshooting

### "Authentication required" Error

1. Make sure you're logged into Google in Chrome
2. Open the extension popup and click "Sync Cookies"
3. Wait 5-10 seconds and try again

### Cookies Not Syncing

1. Check server is running (`npm start`)
2. Check server URL in extension settings
3. Check browser console for errors

### Multi-User Token Not Working

1. Ensure the token was generated from the same server
2. Re-sync cookies after setting the token
3. Include the exact token in your prompt

---

## 📁 Project Structure

```
Chrome_extension/
├── src/
│   ├── server.ts          # Main MCP server
│   ├── native_fetch_client.ts  # Cookie-based API client
│   └── notebooklm_client.ts    # Playwright fallback client
├── background.js          # Chrome extension background script
├── manifest.json          # Extension manifest
├── user_data/             # Cookie storage (auto-created)
└── dist/                  # Built server files
```

---

## 🔒 Security Notes

- Cookies are stored locally on the server machine
- Each user token is unique and randomly generated
- The server only accepts cookies from the Chrome extension
- HTTPS via Cloudflare tunnel encrypts all traffic

---

## 📄 License

MIT

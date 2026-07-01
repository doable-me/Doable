
import { App } from "@modelcontextprotocol/ext-apps";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const viewerEl = document.getElementById("viewer")!;
const statusEl = document.getElementById("status")!;

const app = new App({ name: "NotebookLM Infographic", version: "1.0.0" });

// Check for transport configuration in URL
const urlParams = new URLSearchParams(window.location.search);
const transportType = urlParams.get("transport");
const serverUrl = urlParams.get("url") || "http://localhost:3001/mcp";

// Connect based on transport type
function connectApp() {
    if (transportType === "http") {
        console.log(`[MCP-App] Connecting via StreamableHTTP to ${serverUrl}...`);
        statusEl.textContent = `Connecting to ${serverUrl}...`;

        try {
            const transport = new StreamableHTTPClientTransport(new URL(serverUrl));
            app.connect(transport);
            console.log("[MCP-App] Connected via HTTP transport");
        } catch (err: any) {
            console.error("[MCP-App] Failed to connect:", err);
            statusEl.textContent = `Connection error: ${err.message}`;
        }
    } else {
        // Default to PostMessage (Claude Desktop / Host environment)
        console.log("[MCP-App] Connecting via PostMessage (Host)...");
        app.connect();
    }
}

// Handle the initial tool result pushed by the host
app.ontoolresult = (result) => {
    console.log("[MCP-App] Received tool result:", result);
    renderResult(result);
};


function renderResult(result: any) {
    if (!result || !result.content) {
        statusEl.textContent = "No content received";
        return;
    }

    console.log("[MCP-App] Rendering result with", result.content.length, "parts");

    // Look for Image content part first
    const imagePart = result.content.find((c: any) => c.type === "image");

    if (imagePart) {
        displayImage(`data:${imagePart.mimeType};base64,${imagePart.data}`);
        return;
    }

    // Fallback: Extract image URL from text content
    const textPart = result.content.find((c: any) => c.type === "text");
    if (textPart && textPart.text) {
        // Try to extract Google image URL from text
        const match = textPart.text.match(/https:\/\/lh3\.googleusercontent\.com\/[^\s)\]"]+/);
        if (match) {
            console.log("[MCP-App] Found image URL in text:", match[0]);
            displayImage(match[0]);
            return;
        }

        // No image URL found, show the text with formatting
        statusEl.innerHTML = formatMarkdown(textPart.text);
        statusEl.style.color = "#333";
        statusEl.style.whiteSpace = "pre-wrap";
        statusEl.style.textAlign = "left";
        statusEl.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
        statusEl.style.lineHeight = "1.6";
        statusEl.style.padding = "20px";
    }
}

// Basic Markdown Formatter
function formatMarkdown(text: string): string {
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
        .replace(/\*(.*?)\*/g, '<em>$1</em>') // Italic
        .replace(/`(.*?)`/g, '<code style="background:#f0f0f0;padding:2px 4px;border-radius:4px">$1</code>') // Inline Code
        .replace(/\n\n/g, '<br><br>') // Paragraphs
        .replace(/\n/g, '<br>'); // Line breaks
}

function displayImage(src: string) {
    statusEl.style.display = 'none';
    viewerEl.innerHTML = '';

    const img = document.createElement('img');
    img.src = src;
    img.style.maxWidth = "100%";
    img.style.borderRadius = "8px";
    img.alt = "Generated Infographic";

    img.onload = () => {
        console.log("[MCP-App] Image loaded successfully");
    };
    img.onerror = (err) => {
        console.error("[MCP-App] Image load error:", err);
        statusEl.textContent = "Failed to load image";
        statusEl.style.display = 'block';
    };

    viewerEl.appendChild(img);
}

// Start connection
connectApp();

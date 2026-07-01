
import { NotebookLMClient } from "./notebooklm_client.js";

async function main() {
    console.log("Starting NotebookLM Auth Setup...");
    console.log("This will launch a visible Chrome window.");
    console.log("Please log in to your Google Account inside that window.");
    console.log("Once you see the NotebookLM dashboard, this script will save your session and exit.");

    const client = new NotebookLMClient(false); // Headless = false
    try {
        await client.start();
        console.log("Browser launched. Waiting for login...");

        // The start() method calls _refreshTokens() which waits for login if needed.
        // It will print "Tokens acquired" when successful.
        console.log("SUCCESS! Session saved to 'user_data'.");
        console.log("You can now close the browser (or it will close automatically in 5s).");
        await new Promise(r => setTimeout(r, 5000));

    } catch (e) {
        console.error("Setup failed:", e);
    } finally {
        await client.stop();
    }
}

main();

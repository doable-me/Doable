
import { NotebookLMClient } from "./notebooklm_client.js";

async function main() {
    const videoUrl = "https://www.youtube.com/watch?v=Kg2Ux47hwg4"; // Test video
    console.log(`Testing Summary Generation for: ${videoUrl}`);

    const client = new NotebookLMClient(true); // Headless
    try {
        await client.start();
        const summary = await client.generateSummary(videoUrl);
        console.log("\n=== FINAL SUMMARY ===\n");
        console.log(summary);
    } catch (e: any) {
        console.error("Test Failed:", e);
        if (e.message.includes("Authentication required")) {
            console.log("\n⚠️  You need to run 'npm run setup' to log in first!");
        }
    } finally {
        await client.stop();
    }
}

main();

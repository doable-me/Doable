/*
 * Token Extractor & RPC Proxy - LOGIN CHECK EDITION
 * 1. Scans for Version Info.
 * 2. Checks if user is Logged In (4s timeout).
 * 3. Executes RPC requests.
 */
(function () {
    console.log("NotebookSpy: Proxy Loaded.");

    let cachedBL = null;
    let cachedFSID = null;
    let cachedToken = null;
    let hasReportedStatus = false;

    function scanContext() {
        try {
            if (window.WIZ_global_data) {
                cachedToken = window.WIZ_global_data.SNlM0e;
                cachedFSID = window.WIZ_global_data.FdrFJe;
            }
            const html = document.documentElement.innerHTML;
            const blMatch = html.match(/(boq_labs-tailwind-[a-zA-Z0-9_.-]+)/);
            if (blMatch) cachedBL = blMatch[0];

            if (cachedToken && cachedBL && !hasReportedStatus) {
                hasReportedStatus = true;
                window.postMessage({ type: "EXTENSION_PROXY_READY" }, "*");
            }
        } catch (e) {
            console.error("Context Scan Error", e);
        }
    }

    // --- LOGIN CHECK ---
    setTimeout(() => {
        if (!cachedToken) {
            console.warn("NotebookSpy: No Token found. User likely logged out.");
            window.postMessage({ type: "EXTENSION_LOGIN_REQUIRED" }, "*");
        }
    }, 4000); // Wait 4 seconds for page load

    window.addEventListener("message", async (event) => {
        if (event.source !== window || !event.data.type) return;
        if (event.data.type === "EXTENSION_CMD_EXECUTE") {
            const { rpcId, payload, reqId } = event.data;
            await executeRPC(rpcId, payload, reqId);
        }
    });

    async function executeRPC(rpcId, payload, reqId) {
        if (!cachedToken || !cachedBL) scanContext();
        if (!cachedToken) {
             window.postMessage({
                type: "EXTENSION_RPC_RESULT",
                status: "ERROR",
                error: "Not Signed In",
                rpcId: rpcId
            }, "*");
            return;
        }

        const baseUrl = "https://notebooklm.google.com/_/LabsTailwindUi/data/batchexecute";
        const url = new URL(baseUrl);
        
        url.searchParams.append("rpcids", rpcId);
        url.searchParams.append("source-path", "/");
        url.searchParams.append("bl", cachedBL);
        url.searchParams.append("f.sid", cachedFSID || ""); 
        url.searchParams.append("hl", "en"); 
        url.searchParams.append("rt", "c");
        url.searchParams.append("_reqid", reqId);

        const innerPayload = JSON.stringify(payload);
        const envelope = JSON.stringify([[[rpcId, innerPayload, null, "generic"]]]);
        
        const body = new URLSearchParams();
        body.append("f.req", envelope);
        body.append("at", cachedToken);

        try {
            console.log(`NotebookSpy: 🚀 Sending RPC ${rpcId}...`);
            const response = await fetch(url.toString(), {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
                    "X-Same-Domain": "1"
                },
                body: body
            });

            if (!response.ok) throw new Error(`Server responded with ${response.status}`);
            const text = await response.text();
            
            window.postMessage({
                type: "EXTENSION_RPC_RESULT",
                status: "SUCCESS",
                data: text,
                rpcId: rpcId
            }, "*");

        } catch (err) {
            console.error("NotebookSpy Error:", err);
            window.postMessage({
                type: "EXTENSION_RPC_RESULT",
                status: "ERROR",
                error: err.toString(),
                rpcId: rpcId
            }, "*");
        }
    }

    scanContext();
    setInterval(scanContext, 1000); 
})();
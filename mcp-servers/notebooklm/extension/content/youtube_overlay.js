/*
 * YouTube content script - PREMIUM GLASS EDITION
 * 1. Draggable Panel
 * 2. Subtle "Premium" Colors (No more bright blue)
 * 3. Perfect Centering & Spacing
 */

console.log("[NotebookLM] YouTube overlay script loaded");

(function () {
    if (window.hasInjectedNotebookLMOverlay) return;
    window.hasInjectedNotebookLMOverlay = true;

    let overlay = null;
    let generateBtn = null;
    let observer = null;
    let isDragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    const TARGET_SELECTORS = [
        '#top-level-buttons-computed',
        '#owner',
        '#above-the-fold',
        'ytd-watch-metadata'
    ];

    function createButton() {
        if (document.getElementById('notebooklm-gen-btn')) return;
        if (!location.pathname.startsWith('/watch') && !location.href.includes('/watch')) return;

        let container = null;
        for (const selector of TARGET_SELECTORS) {
            const el = document.querySelector(selector);
            if (el && el.isConnected) {
                container = el;
                break;
            }
        }

        if (!container) {
            if (document.readyState === 'complete') injectFloatingButton();
            return;
        }

        generateBtn = document.createElement('button');
        generateBtn.id = 'notebooklm-gen-btn';
        generateBtn.innerText = '✨ Infographic';

        // Subtle Header Button Style
        Object.assign(generateBtn.style, {
            backgroundColor: 'rgba(255, 255, 255, 0.08)', // Very subtle grey
            color: '#f1f1f1',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            padding: '0 16px',
            height: '36px',
            fontSize: '14px',
            fontWeight: '500',
            borderRadius: '18px',
            cursor: 'pointer',
            marginLeft: '8px',
            display: 'flex',
            alignItems: 'center',
            transition: 'all 0.2s ease'
        });

        generateBtn.onmouseover = () => {
            generateBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
            generateBtn.style.borderColor = 'rgba(255, 255, 255, 0.3)';
        };
        generateBtn.onmouseout = () => {
            generateBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
            generateBtn.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        };
        generateBtn.onclick = startGeneration;

        container.appendChild(generateBtn);
    }

    function injectFloatingButton() {
        if (document.getElementById('notebooklm-gen-btn')) return;

        generateBtn = document.createElement('button');
        generateBtn.id = 'notebooklm-gen-btn';
        generateBtn.innerText = '✨ Generate';

        Object.assign(generateBtn.style, {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            zIndex: '9999',
            padding: '12px 24px',
            backgroundColor: '#222', // Dark instead of blue
            color: 'white',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '24px',
            fontWeight: '600',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            transition: 'transform 0.2s'
        });

        generateBtn.onmouseover = () => generateBtn.style.transform = 'scale(1.05)';
        generateBtn.onmouseout = () => generateBtn.style.transform = 'scale(1)';

        generateBtn.onclick = startGeneration;
        document.body.appendChild(generateBtn);
    }

    function startGeneration() {
        const videoUrl = window.location.href;
        try {
            chrome.runtime.sendMessage({ type: 'INIT_GENERATION', videoUrl: videoUrl });
            showOverlay();
            updateOverlay("Initializing...");
        } catch (error) {
            alert("Please refresh the page. Extension updated.");
        }
    }

    function showOverlay() {
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'notebooklm-overlay';

            // --- PREMIUM CARD STYLING ---
            Object.assign(overlay.style, {
                position: 'fixed',
                bottom: '80px',
                right: '24px',
                width: '320px',
                backgroundColor: 'rgba(20, 20, 20, 0.98)', // Deep Matte Black
                backdropFilter: 'blur(12px)',
                color: 'white',
                zIndex: '10000',
                borderRadius: '16px',
                boxShadow: '0 20px 50px rgba(0,0,0,0.7)', // Deeper shadow
                border: '1px solid rgba(255,255,255,0.1)',
                fontFamily: 'Roboto, Arial, sans-serif',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                transition: 'opacity 0.3s ease',
                opacity: '0'
            });

            overlay.innerHTML = `
                <div id="nlm-header" style="
                    padding: 16px 20px; 
                    background: rgba(255,255,255,0.03); 
                    border-bottom: 1px solid rgba(255,255,255,0.05);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    cursor: grab;
                    user-select: none;
                ">
                    <span style="font-size: 12px; font-weight: 600; color: #888; letter-spacing: 1px; text-transform: uppercase;">NotebookLM Generator</span>
                    <button id="nlm-close" style="background:none; border:none; color:#666; font-size: 20px; cursor:pointer; padding:0; line-height:1; transition: color 0.2s;">&times;</button>
                </div>
                
                <div id="nlm-content" style="padding: 24px 20px 28px 20px; text-align: center;">
                    <h3 id="nlm-status" style="margin: 0 0 16px 0; font-size: 14px; font-weight: 400; color: #ccc;">Initializing...</h3>
                    
                    <div class="nlm-loader" style="
                        border: 2px solid rgba(255,255,255,0.1); 
                        border-top: 2px solid #fff; 
                        border-radius: 50%; 
                        width: 24px; 
                        height: 24px; 
                        animation: spin 0.8s linear infinite;
                        margin: 0 auto;
                    "></div>
                    
                    <div id="nlm-preview" style="display:none; margin-top:16px; animation: fadeIn 0.4s ease-out;"></div>
                </div>
                <style>
                    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                    @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
                    #nlm-close:hover { color: #fff !important; }
                </style>
            `;

            document.body.appendChild(overlay);

            // Drag Logic
            const header = document.getElementById('nlm-header');
            header.addEventListener('mousedown', (e) => {
                isDragging = true;
                header.style.cursor = 'grabbing';
                dragOffsetX = e.clientX - overlay.getBoundingClientRect().left;
                dragOffsetY = e.clientY - overlay.getBoundingClientRect().top;

                const rect = overlay.getBoundingClientRect();
                overlay.style.bottom = 'auto';
                overlay.style.right = 'auto';
                overlay.style.left = rect.left + 'px';
                overlay.style.top = rect.top + 'px';
            });
            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                e.preventDefault();
                overlay.style.left = (e.clientX - dragOffsetX) + 'px';
                overlay.style.top = (e.clientY - dragOffsetY) + 'px';
            });
            document.addEventListener('mouseup', () => {
                if (isDragging) {
                    isDragging = false;
                    header.style.cursor = 'grab';
                }
            });
            document.getElementById('nlm-close').addEventListener('click', () => {
                overlay.style.display = 'none';
            });
        }

        overlay.style.display = 'flex';
        requestAnimationFrame(() => overlay.style.opacity = '1');

        document.querySelector('.nlm-loader').style.display = 'block';
        document.getElementById('nlm-preview').style.display = 'none';
        document.getElementById('nlm-status').innerText = 'Initializing...';
        document.getElementById('nlm-status').style.color = '#ccc';
    }

    function updateOverlay(text, payload) {
        if (!overlay) return;
        const statusEl = document.getElementById('nlm-status');
        statusEl.innerText = text;

        if (payload && payload.imageUrl) {
            const loader = document.querySelector('.nlm-loader');
            const preview = document.getElementById('nlm-preview');

            loader.style.display = 'none';
            preview.style.display = 'block';

            // --- PREMIUM SUCCESS UI ---
            preview.innerHTML = `
                <div style="
                    width: 100%; 
                    height: 180px; 
                    background-color: #111;
                    border-radius: 8px;
                    margin-bottom: 20px;
                    overflow: hidden;
                    position: relative;
                    border: 1px solid rgba(255,255,255,0.08);
                ">
                    <img src="${payload.imageUrl}" style="
                        width: 100%;
                        height: 100%;
                        object-fit: contain; 
                        opacity: 0.9;
                    " />
                </div>
                
                <a href="${payload.imageUrl}" target="_blank" style="
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    gap: 8px;
                    width: 100%;
                    background: rgba(255, 255, 255, 0.08); /* Subtle Glass */
                    color: #fff; 
                    text-decoration: none; 
                    padding: 12px 0; 
                    border-radius: 8px; 
                    font-weight: 500; 
                    font-size: 13px;
                    text-align: center;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    transition: all 0.2s ease;
                " onmouseover="this.style.background='rgba(255,255,255,0.15)'; this.style.borderColor='rgba(255,255,255,0.3)'" 
                  onmouseout="this.style.background='rgba(255,255,255,0.08)'; this.style.borderColor='rgba(255,255,255,0.1)'">
                   <span>View Full Infographic</span>
                   <span style="font-size: 16px; line-height: 1;">↗</span>
                </a>
            `;

            statusEl.innerText = "Generation Complete";
            statusEl.style.color = "#fff"; // Clean White
        } else if (text.includes("Error") || text.includes("rejected")) {
            statusEl.style.color = "#ff6b6b"; // Soft Red
        } else if (text.includes("sign in")) {
            statusEl.style.color = "#ff9f43"; // Soft Orange
        }
    }

    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'UPDATE_STATUS') {
            if (message.status === 'COMPLETED') {
                updateOverlay("Generation Complete!", message.payload);
            } else if (message.status === 'ERROR') {
                updateOverlay("Error: " + (message.payload?.error || "Unknown"));
                document.querySelector('.nlm-loader').style.display = 'none';
            } else if (message.status === 'LOGIN_REQUIRED') {
                updateOverlay("Please sign in to Google.");
                document.querySelector('.nlm-loader').style.display = 'none';
                const preview = document.getElementById('nlm-preview');
                preview.style.display = 'block';
                preview.innerHTML = `
                    <a href="https://notebooklm.google.com" target="_blank" style="
                        display: block; margin-top: 10px; color: #fff; text-decoration: underline; font-size: 13px; opacity: 0.7;
                    ">Open NotebookLM to Sign In ↗</a>
                `;
            } else {
                updateOverlay(message.status);
            }
        }
    });

    function initObserver() {
        observer = new MutationObserver((mutations) => {
            if (location.pathname.startsWith('/watch')) {
                if (!document.getElementById('notebooklm-gen-btn')) createButton();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    initObserver();
    createButton();
    setTimeout(createButton, 3000);

})();
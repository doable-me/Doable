document.addEventListener('DOMContentLoaded', function () {
    const serverUrlInput = document.getElementById('serverUrl');
    const userTokenInput = document.getElementById('userToken');
    const detectBtn = document.getElementById('detectBtn');
    const saveTokenBtn = document.getElementById('saveTokenBtn');
    const syncBtn = document.getElementById('syncBtn');
    const statusDiv = document.getElementById('status');

    // Load saved settings, then auto-detect if no token is stored yet
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, function (response) {
        if (response) {
            serverUrlInput.value = response.server_url || 'https://staging-api.doable.me';
            if (response.user_token) {
                userTokenInput.value = response.user_token;
                userTokenInput.classList.add('saved');
            } else {
                // No saved token — try to detect from an open Doable tab automatically
                detectBtn.textContent = '...';
                detectBtn.disabled = true;
                chrome.runtime.sendMessage({ type: 'DETECT_USER_ID' }, function (resp) {
                    detectBtn.textContent = 'Detect';
                    detectBtn.disabled = false;
                    if (resp?.userId) {
                        userTokenInput.value = resp.userId;
                        userTokenInput.classList.add('saved');
                        showStatus('✅ Auto-detected your Doable User ID.', 'success');
                    }
                });
            }
        }
    });

    // Manual detect button
    detectBtn.addEventListener('click', function () {
        detectBtn.textContent = 'Detecting...';
        detectBtn.disabled = true;
        chrome.runtime.sendMessage({ type: 'DETECT_USER_ID' }, function (response) {
            detectBtn.textContent = 'Detect';
            detectBtn.disabled = false;
            if (response?.userId) {
                userTokenInput.value = response.userId;
                userTokenInput.classList.add('saved');
                showStatus('✅ Detected: ' + response.userId, 'success');
            } else {
                showStatus('❌ No Doable tab found. Open Doable in a tab and try again.', 'error');
            }
        });
    });

    // Save Doable User ID
    saveTokenBtn.addEventListener('click', function () {
        const token = userTokenInput.value.trim();
        if (!token) {
            showStatus('Please enter your Doable User ID.', 'error');
            return;
        }
        chrome.runtime.sendMessage({ type: 'SET_USER_TOKEN', token }, function (response) {
            if (response?.success) {
                userTokenInput.classList.add('saved');
                saveTokenBtn.textContent = 'Saved!';
                setTimeout(() => { saveTokenBtn.textContent = 'Save'; }, 1500);
            }
        });
    });

    // Clear saved indicator when user edits the field
    userTokenInput.addEventListener('input', function () {
        userTokenInput.classList.remove('saved');
    });

    // Handle sync click
    syncBtn.addEventListener('click', function () {
        const serverUrl = serverUrlInput.value.trim();
        const token = userTokenInput.value.trim();

        if (!serverUrl) {
            showStatus('Please enter a Server URL.', 'error');
            return;
        }
        if (!token) {
            showStatus('Please enter and save your Doable User ID first.', 'error');
            return;
        }

        syncBtn.disabled = true;
        syncBtn.textContent = 'Syncing...';
        showStatus('Connecting...', 'info');

        // Save server URL, then save token, then sync
        chrome.runtime.sendMessage({ type: 'SET_SERVER_URL', url: serverUrl }, () => {
            chrome.runtime.sendMessage({ type: 'SET_USER_TOKEN', token }, () => {
                userTokenInput.classList.add('saved');
                chrome.runtime.sendMessage({ type: 'REFRESH_COOKIES' }, function (response) {
                    syncBtn.disabled = false;
                    syncBtn.textContent = 'Sync Cookies';

                    if (response && response.success) {
                        showStatus(`✅ Synced ${response.count} cookies.`, 'success');
                    } else {
                        showStatus(`❌ ${response?.error || 'Unknown error'}`, 'error');
                    }
                });
            });
        });
    });

    function showStatus(msg, type) {
        statusDiv.textContent = msg;
        statusDiv.className = type;
        statusDiv.style.display = 'block';
    }
});

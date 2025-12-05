// sidepanel.js - Pure JS Implementation

// --- State ---
let requests = [];
let activeTabId = null;
let isCapturing = true;
let preserveLog = false;
let filterText = '';
let filterMode = 'all'; // New state: 'all' | 'path' | 'path_query' | 'exact' | 'regex'
let selectedRequestId = null;

// --- DOM Elements ---
const listPane = document.getElementById('list-pane');
const detailPane = document.getElementById('detail-pane');
const requestListEl = document.getElementById('request-list');
const listEmptyState = document.getElementById('list-empty-state');
const detailContent = document.getElementById('detail-content');
const detailPlaceholder = document.getElementById('detail-placeholder');
const detailUrl = document.getElementById('detail-url');

const detailReqHeaders = document.getElementById('detail-req-headers');
const detailPayload = document.getElementById('detail-payload');
const detailResHeaders = document.getElementById('detail-res-headers');
const detailResponse = document.getElementById('detail-response');

// Filter Elements
const inputFilter = document.getElementById('input-filter');
const filterModeSelect = document.getElementById('filter-mode');

// Modal Elements
const replayModal = document.getElementById('replay-modal');
const replayMethod = document.getElementById('replay-method');
const replayUrl = document.getElementById('replay-url');
const replayHeaders = document.getElementById('replay-headers');
const replayBody = document.getElementById('replay-body');
const jsonError = document.getElementById('json-error');

// --- Initialization ---

async function init() {
    // 1. Get Active Tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0) {
        activeTabId = tabs[0].id;
    }

    // 2. Listeners
    setupEventListeners();
    
    // 3. Render initial state
    renderRequestList();
}

function setupEventListeners() {
    // Toolbar buttons
    document.getElementById('btn-record').addEventListener('click', (e) => {
        isCapturing = !isCapturing;
        const btn = e.currentTarget;
        btn.classList.toggle('active', isCapturing);
        btn.setAttribute('title', isCapturing ? 'Stop recording' : 'Start recording');
        
        // Update Icon SVG
        if (isCapturing) {
            // Recording (Show Red Dot)
             btn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <circle cx="12" cy="12" r="3" fill="currentColor"></circle>
                </svg>
            `;
        } else {
            // Paused (Show Play/Resume icon)
            btn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polygon points="10 8 16 12 10 16 10 8" fill="currentColor"></polygon>
                </svg>
            `;
        }
    });

    document.getElementById('btn-clear').addEventListener('click', () => {
        requests = [];
        selectedRequestId = null;
        renderRequestList();
        renderDetail();
    });

    document.getElementById('chk-preserve').addEventListener('change', (e) => {
        preserveLog = e.target.checked;
    });

    // Filter Input
    inputFilter.addEventListener('input', (e) => {
        filterText = e.target.value; // Don't lowercase here, handle in render based on mode
        renderRequestList();
    });

    // Filter Mode Select
    filterModeSelect.addEventListener('change', (e) => {
        filterMode = e.target.value;
        renderRequestList();
    });

    document.getElementById('btn-back').addEventListener('click', () => {
        selectedRequestId = null;
        detailPane.style.display = 'none'; // Back to list on mobile
    });

    // Replay Buttons
    document.getElementById('btn-replay').addEventListener('click', openReplayModal);
    document.getElementById('btn-close-modal').addEventListener('click', closeReplayModal);
    document.getElementById('btn-send-replay').addEventListener('click', sendReplayRequest);
    
    // Close modal on outside click
    replayModal.addEventListener('click', (e) => {
        if (e.target === replayModal) closeReplayModal();
    });

    // Copy buttons
    document.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetType = e.target.getAttribute('data-target');
            const req = requests.find(r => r.id === selectedRequestId);
            if (!req) return;
            
            const data = targetType === 'req' ? req.requestBody : req.responseBody;
            const text = data ? JSON.stringify(data, null, 2) : '';
            
            navigator.clipboard.writeText(text).then(() => {
                const original = e.target.innerText;
                e.target.innerText = 'Copied!';
                setTimeout(() => e.target.innerText = original, 1500);
            });
        });
    });

    // Runtime Messages (Data from Content Script)
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (!isCapturing) return;
        if (!message || !message.url) return;
        
        // Tab Isolation
        if (activeTabId && sender.tab && sender.tab.id !== activeTabId) {
            return;
        }

        const newRequest = {
            id: message.id || crypto.randomUUID(),
            timestamp: message.timestamp,
            method: message.method,
            url: message.url,
            status: message.status,
            type: message.type || 'xhr',
            isReplay: message.isReplay || false,
            requestHeaders: message.requestHeaders || {},
            responseHeaders: message.responseHeaders || {},
            requestBody: message.requestBody,
            responseBody: message.responseBody
        };

        // Add to top
        requests.unshift(newRequest);
        
        // Limit buffer
        if (requests.length > 200) requests.pop();
        
        renderRequestList();
    });

    // Tab Switching
    chrome.tabs.onActivated.addListener((activeInfo) => {
        activeTabId = activeInfo.tabId;
        if (!preserveLog) {
            requests = [];
            selectedRequestId = null;
            renderRequestList();
            renderDetail();
        }
    });

    // Navigation/Refresh
    chrome.webNavigation.onCommitted.addListener((details) => {
        if (details.frameId === 0 && details.tabId === activeTabId && !preserveLog) {
            requests = [];
            selectedRequestId = null;
            renderRequestList();
            renderDetail();
        }
    });
}

// --- Replay Logic ---

function openReplayModal() {
    const req = requests.find(r => r.id === selectedRequestId);
    if (!req) return;

    replayMethod.value = req.method;
    replayUrl.value = req.url;
    
    // Fill Headers
    if (req.requestHeaders && Object.keys(req.requestHeaders).length > 0) {
        replayHeaders.value = JSON.stringify(req.requestHeaders, null, 2);
    } else {
        replayHeaders.value = "{}";
    }
    
    // Fill Body
    if (req.requestBody && typeof req.requestBody === 'object') {
        replayBody.value = JSON.stringify(req.requestBody, null, 2);
    } else {
        replayBody.value = req.requestBody || '';
    }
    
    jsonError.classList.add('hidden');
    replayModal.classList.remove('hidden');
}

function closeReplayModal() {
    replayModal.classList.add('hidden');
}

async function sendReplayRequest() {
    const url = replayUrl.value;
    const method = replayMethod.value;
    const bodyText = replayBody.value;
    const headersText = replayHeaders.value;

    let body = bodyText;
    let headers = {};
    
    // Validate Headers
    try {
        if (headersText.trim()) {
            headers = JSON.parse(headersText);
        }
    } catch (e) {
        jsonError.textContent = "Invalid JSON in Headers";
        jsonError.classList.remove('hidden');
        return;
    }

    // Validate Body
    if (method !== 'GET' && bodyText.trim()) {
        try {
            JSON.parse(bodyText); // Check validity
        } catch (e) {
            jsonError.textContent = "Invalid JSON in Body";
            jsonError.classList.remove('hidden');
            return;
        }
    } else if (method === 'GET') {
        body = undefined;
    }

    // Send to Content Script
    if (activeTabId) {
        chrome.tabs.sendMessage(activeTabId, {
            type: 'REPLAY_REQUEST',
            data: {
                url,
                method,
                headers, // Use edited headers
                body
            }
        });
        closeReplayModal();
    }
}

// --- Rendering ---

function renderRequestList() {
    requestListEl.innerHTML = '';
    
    const searchText = filterText.trim();
    
    const filtered = requests.filter(req => {
        // If filter is empty, show all
        if (!searchText) return true;

        let targetUrl = req.url;
        let urlObj = null;

        try {
            urlObj = new URL(req.url);
        } catch (e) {
            // If URL is invalid (e.g. data URI), force simple match mode
            return req.url.toLowerCase().includes(searchText.toLowerCase());
        }

        // Apply Logic based on mode
        switch (filterMode) {
            case 'path':
                // Match path only (e.g., /api/v1/users)
                return urlObj.pathname.toLowerCase().includes(searchText.toLowerCase());
            
            case 'path_query':
                // Match path + query (e.g., /api/v1/users?id=123)
                const pathQuery = urlObj.pathname + urlObj.search;
                return pathQuery.toLowerCase().includes(searchText.toLowerCase());
            
            case 'exact':
                return req.url === searchText;

            case 'regex':
                try {
                    // Case-insensitive regex match
                    const regex = new RegExp(searchText, 'i');
                    return regex.test(req.url);
                } catch (e) {
                    // Invalid regex, treat as non-match (or fallback to simple include?)
                    // Let's fallback to simple include to be user friendly while typing
                    return req.url.toLowerCase().includes(searchText.toLowerCase());
                }

            case 'all':
            default:
                // Match Method OR Full URL
                return req.method.toLowerCase().includes(searchText.toLowerCase()) || 
                       req.url.toLowerCase().includes(searchText.toLowerCase());
        }
    });

    if (filtered.length === 0) {
        listEmptyState.style.display = 'flex';
    } else {
        listEmptyState.style.display = 'none';
        filtered.forEach(req => {
            const el = document.createElement('div');
            el.className = `request-item ${selectedRequestId === req.id ? 'selected' : ''}`;
            if (req.isReplay) {
                el.classList.add('replay-item');
            }
            el.onclick = () => selectRequest(req.id);
            
            const urlName = req.url.split('/').pop() || req.url;
            const statusClass = getStatusClass(req.status);
            
            // Replay Tag HTML
            const replayTag = req.isReplay ? '<span class="tag-replay">REPLAY</span>' : '';

            el.innerHTML = `
                <div class="req-header">
                    <span class="method ${req.method}">${req.method}</span>
                    <span class="status ${statusClass}">${req.status || '...'}</span>
                </div>
                <div class="req-url" title="${req.url}">${replayTag}${urlName}</div>
                <div class="req-meta">
                    <span style="overflow:hidden; text-overflow:ellipsis; max-width:70%">${formatUrl(req.url)}</span>
                    <span>${req.timestamp}</span>
                </div>
            `;
            requestListEl.appendChild(el);
        });
    }
}

function selectRequest(id) {
    selectedRequestId = id;
    renderRequestList(); // To update selection highlight
    renderDetail();
    
    // On mobile, show the detail pane
    if (window.innerWidth < 600) {
        detailPane.style.display = 'flex';
    }
}

function renderDetail() {
    const req = requests.find(r => r.id === selectedRequestId);
    
    if (!req) {
        detailPlaceholder.style.display = 'flex';
        detailContent.classList.add('hidden');
        return;
    }

    detailPlaceholder.style.display = 'none';
    detailContent.classList.remove('hidden');
    
    detailUrl.textContent = req.url;
    detailUrl.title = req.url;

    // Render Request Headers
    detailReqHeaders.innerHTML = '';
    if (req.requestHeaders && Object.keys(req.requestHeaders).length > 0) {
        detailReqHeaders.appendChild(createJsonTree(req.requestHeaders));
    } else {
        detailReqHeaders.innerHTML = '<span class="json-null">No headers</span>';
    }

    // Render Payload
    detailPayload.innerHTML = '';
    if (req.requestBody) {
        detailPayload.appendChild(createJsonTree(req.requestBody));
    } else {
        detailPayload.innerHTML = '<span class="json-null">No payload</span>';
    }

    // Render Response Headers
    detailResHeaders.innerHTML = '';
    if (req.responseHeaders && Object.keys(req.responseHeaders).length > 0) {
        detailResHeaders.appendChild(createJsonTree(req.responseHeaders));
    } else {
        detailResHeaders.innerHTML = '<span class="json-null">No headers</span>';
    }

    // Render Response Body
    detailResponse.innerHTML = '';
    if (req.responseBody) {
        detailResponse.appendChild(createJsonTree(req.responseBody));
    } else {
        detailResponse.innerHTML = '<span class="json-null">No JSON response</span>';
    }
}

// --- Helpers ---

function getStatusClass(status) {
    if (!status) return '';
    if (status >= 200 && status < 300) return 'status-2xx';
    if (status >= 300 && status < 400) return 'status-3xx';
    if (status >= 400) return 'status-4xx';
    return 'status-5xx';
}

function formatUrl(url) {
    try {
        const u = new URL(url);
        return u.pathname;
    } catch(e) { return url; }
}

// --- Recursive JSON Viewer ---

function createJsonTree(data) {
    if (data === null) return createSpan('null', 'json-null');
    if (data === undefined) return createSpan('undefined', 'json-null');
    if (typeof data === 'boolean') return createSpan(data, 'json-boolean');
    if (typeof data === 'number') return createSpan(data, 'json-number');
    if (typeof data === 'string') return createSpan(`"${data}"`, 'json-string');

    if (Array.isArray(data)) {
        if (data.length === 0) return createSpan('[]', 'json-null');
        return createCollapsible(data, '[', ']');
    }

    if (typeof data === 'object') {
        if (Object.keys(data).length === 0) return createSpan('{}', 'json-null');
        return createCollapsible(data, '{', '}');
    }

    return createSpan(String(data));
}

function createCollapsible(data, openChar, closeChar) {
    const container = document.createElement('div');
    container.className = 'json-tree';

    const header = document.createElement('div');
    
    const toggle = document.createElement('span');
    toggle.className = 'json-expand-btn';
    toggle.textContent = '▼';
    
    const label = document.createElement('span');
    label.textContent = openChar;
    label.style.color = '#text-muted';

    const placeholder = document.createElement('span');
    placeholder.className = 'json-placeholder hidden';
    const isArray = Array.isArray(data);
    placeholder.textContent = isArray ? `Array(${data.length})` : '{...}';

    header.appendChild(toggle);
    header.appendChild(label);
    header.appendChild(placeholder);

    const body = document.createElement('div');
    body.className = 'json-block';

    // Populate Children
    const keys = Object.keys(data);
    keys.forEach((key, index) => {
        const line = document.createElement('div');
        
        if (!isArray) {
            const keySpan = createSpan(`${key}: `, 'json-key');
            line.appendChild(keySpan);
        }
        
        line.appendChild(createJsonTree(data[key]));
        
        if (index < keys.length - 1) {
            line.appendChild(document.createTextNode(','));
        }
        
        body.appendChild(line);
    });

    const footer = document.createElement('div');
    footer.textContent = closeChar;
    footer.style.marginLeft = '16px';

    // Toggle logic
    let isOpen = true;
    header.onclick = (e) => {
        e.stopPropagation();
        isOpen = !isOpen;
        body.classList.toggle('hidden', !isOpen);
        footer.classList.toggle('hidden', !isOpen);
        placeholder.classList.toggle('hidden', isOpen);
        toggle.classList.toggle('collapsed', !isOpen);
    };

    container.appendChild(header);
    container.appendChild(body);
    container.appendChild(footer);

    return container;
}

function createSpan(text, className) {
    const s = document.createElement('span');
    s.textContent = text;
    if (className) s.className = className;
    return s;
}

// Start
init();
// content.js

// Note: proxy.js is now injected via manifest.json with world: "MAIN".
// We no longer need to manually inject the script tag here.

// Listen for messages from the proxy script (running in Main World)
window.addEventListener('message', (event) => {
  // We only accept messages from ourselves
  if (event.source !== window || !event.data || event.data.source !== 'ajax-interceptor') {
    return;
  }

  // Forward the message to the extension runtime (Side Panel / Background)
  try {
    if (chrome && chrome.runtime) {
        chrome.runtime.sendMessage(event.data.payload);
    }
  } catch (e) {
    // Extension context might be invalidated if updated/reloaded
  }
});

// Listen for messages from the Side Panel / Background (e.g., REPLAY request)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'REPLAY_REQUEST') {
        // Forward to the proxy script in the main world
        window.postMessage({
            source: 'extension-replay',
            payload: message.data
        }, '*');
    }
});
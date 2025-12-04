// content.js

// This script runs in the isolated content world.
// It injects the proxy script into the MAIN world to intercept window.fetch/XHR.

const injectScript = () => {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('proxy.js');
  script.onload = function() {
    this.remove();
  };
  (document.head || document.documentElement).appendChild(script);
};

injectScript();

// Listen for messages from the injected script (proxy.js)
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
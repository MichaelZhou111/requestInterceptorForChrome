export {};
declare const chrome: any;

// This script runs in the isolated content world.
// It injects the proxy script into the MAIN world to intercept window.fetch/XHR.

const injectScript = () => {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('proxy.js');
  script.onload = function() {
    // @ts-ignore
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
    chrome.runtime.sendMessage(event.data.payload);
  } catch (e) {
    // Extension context might be invalidated if updated/reloaded
    // console.warn('Failed to send message to extension', e);
  }
});
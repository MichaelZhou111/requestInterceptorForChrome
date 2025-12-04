// background.js - Service Worker

// Allows users to open the side panel by clicking the action toolbar icon
if (chrome && chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));
}

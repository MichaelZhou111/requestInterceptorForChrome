export {};
declare const chrome: any;

// Allows users to open the side panel by clicking the action toolbar icon
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error: Error) => console.error(error));
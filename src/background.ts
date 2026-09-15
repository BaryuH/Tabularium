/**
 * M1 scaffold: minimal service worker.
 * The global quick-save command handler arrives in M9.
 */
chrome.runtime.onInstalled.addListener((details) => {
  console.info('[Tabularium] installed:', details.reason);
});

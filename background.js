'use strict';

/**
 * Background script — Phase 2
 * Handles Google OAuth via chrome.identity.
 */

// Listen for requests from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'login') {
    chrome.identity.getAuthToken({ interactive: true }, token => {
      if (chrome.runtime.lastError || !token) {
        console.error('Login failed:', chrome.runtime.lastError);
        sendResponse({ success: false, error: chrome.runtime.lastError });
        return;
      }
      console.log('Got token:', token);
      sendResponse({ success: true, token });
    });
    return true; // Keep sendResponse async
  }
});
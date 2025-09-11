// storageService.js
'use strict';

const LOCAL_EVENTS_KEY = 'miniCal.localEvents';

export async function loadLocalEvents() {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      return await new Promise((resolve, reject) => {
        chrome.storage.local.get([LOCAL_EVENTS_KEY], res => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          resolve(res[LOCAL_EVENTS_KEY] || []);
        });
      });
    } else {
      const raw = localStorage.getItem(LOCAL_EVENTS_KEY);
      return raw ? JSON.parse(raw) : [];
    }
  } catch (err) {
    // rethrow so callers can show assistant bubbles
    throw new Error('Storage read failed: ' + (err && err.message ? err.message : String(err)));
  }
}

export async function saveLocalEvents(events) {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      return await new Promise((resolve, reject) => {
        chrome.storage.local.set({ [LOCAL_EVENTS_KEY]: events }, () => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          resolve();
        });
      });
    } else {
      localStorage.setItem(LOCAL_EVENTS_KEY, JSON.stringify(events));
    }
  } catch (err) {
    throw new Error('Storage write failed: ' + (err && err.message ? err.message : String(err)));
  }
}

// storageService.js
const LOCAL_EVENTS_KEY = 'miniCal.localEvents';

export function loadLocalEvents() {
  return new Promise(resolve => {
    try {
      if (chrome?.storage?.local) {
        chrome.storage.local.get([LOCAL_EVENTS_KEY], res => resolve(res[LOCAL_EVENTS_KEY] || []));
      } else {
        const raw = localStorage.getItem(LOCAL_EVENTS_KEY);
        resolve(raw ? JSON.parse(raw) : []);
      }
    } catch (_) { resolve([]); }
  });
}

export function saveLocalEvents(events) {
  return new Promise(resolve => {
    try {
      if (chrome?.storage?.local) {
        chrome.storage.local.set({ [LOCAL_EVENTS_KEY]: events }, resolve);
      } else {
        localStorage.setItem(LOCAL_EVENTS_KEY, JSON.stringify(events));
        resolve();
      }
    } catch (_) { resolve(); }
  });
}

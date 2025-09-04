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

  if (request.action === 'createCalendarEvent') {
    // request.payload should include: title, startISO, endISO, attendees[] (optional), description (optional)
    const { title, startISO, endISO, attendees = [], description = '' } = request.payload || {};
    if (!title || !startISO) {
      sendResponse({ success: false, error: 'Missing title or start time' });
      return true;
    }

    chrome.identity.getAuthToken({ interactive: true }, token => {
      if (chrome.runtime.lastError || !token) {
        console.error('Token error:', chrome.runtime.lastError);
        sendResponse({ success: false, error: chrome.runtime.lastError });
        return;
      }

      const body = {
        summary: title,
        description,
        start: { dateTime: startISO },
        end: { dateTime: endISO || startISO },
        attendees: attendees
          .filter(Boolean)
          .map(email => ({ email }))
      };

      fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      })
      .then(r => r.json().then(j => ({ ok: r.ok, status: r.status, json: j })))
      .then(({ ok, status, json }) => {
        if (!ok) {
          console.error('Calendar API error:', status, json);
          sendResponse({ success: false, status, error: json });
          return;
        }
        sendResponse({ success: true, event: json });
      })
      .catch(err => {
        console.error('Network error:', err);
        sendResponse({ success: false, error: String(err) });
      });
    });
    return true; // async
  }
});
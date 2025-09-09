'use strict';

/**
 * Background script — Phase 2
 * Purpose:
 * - Handles Google OAuth login to get an access token
 * - Receives requests from the popup (StudyJS.js)
 * - Creates/list events in the user’s Google Calendar
 *
 * Think of this file as the "middleman" between your popup and Google’s servers.
 */

// ---------------------------
// Helper: Get OAuth Token
// ---------------------------

/**
 * Opens a Google login popup (if needed) and retrieves an access token.
 * @returns {Promise<string>} token used to call Google Calendar API
 */
function getAuthTokenInteractive() {
  return new Promise((resolve, reject) => {
    // Ask Chrome Identity API for a token
    chrome.identity.getAuthToken({ interactive: true }, token => {
      if (chrome.runtime.lastError || !token) {
        reject(chrome.runtime.lastError || new Error('No token'));
        return;
      }
      resolve(token);
    });
  });
}

/**
 * Helper to fetch JSON responses safely
 * - Calls fetch()
 * - Returns object { ok, status, json }
 */
async function fetchJson(url, init) {
  const resp = await fetch(url, init);
  const json = await resp.json().catch(() => ({})); // fallback if not JSON
  return { ok: resp.ok, status: resp.status, json };
}

// ---------------------------
// Message Listener
// ---------------------------

/**
 * The popup (StudyJS.js) sends messages here using chrome.runtime.sendMessage
 * We check the action type (login, createCalendarEvent, listCalendarEvents)
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
  // ---------------------------
  // LOGIN ACTION
  // ---------------------------
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
    return true; // keep sendResponse alive (async)
  }

  // ---------------------------
  // CREATE EVENT ACTION
  // ---------------------------
  if (request.action === 'createCalendarEvent') {
    /**
     * request.payload should look like:
     * {
     *   title: "Meeting with Sarah",
     *   startISO: "2025-09-09T14:00:00Z",
     *   endISO: "2025-09-09T14:30:00Z",
     *   attendees: ["test@example.com"],
     *   description: "Optional notes"
     * }
     */
    const { title, startISO, endISO, attendees = [], description = '' } = request.payload || {};
    if (!title || !startISO) {
      sendResponse({ success: false, error: 'Missing title or start time' });
      return true;
    }

    // Async function to create event
    (async () => {
      try {
        const token = await getAuthTokenInteractive();
        
        // Body to send to Google Calendar API
        const body = {
          summary: title, // event title
          description,
          start: { dateTime: startISO },
          end: { dateTime: endISO || startISO }, // fallback if end not given
          attendees: attendees.filter(Boolean).map(email => ({ email }))
        };

        // Make API request
        const { ok, status, json } = await fetchJson(
          'https://www.googleapis.com/calendar/v3/calendars/primary/events',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
          }
        );

        // If Google returns error
        if (!ok) {
          console.error('Calendar API error:', status, json);
          sendResponse({ success: false, status, error: json });
          return;
        }

        // Success → return event data
        sendResponse({ success: true, event: json });
      } catch (err) {
        console.error('createCalendarEvent error:', err);
        sendResponse({ success: false, error: String(err && err.message || err) });
      }
    })();
    return true; // async
  }

  // ---------------------------
  // LIST UPCOMING EVENTS ACTION
  // ---------------------------
  if (request.action === 'listCalendarEvents') {
    /**
     * request.payload can include:
     * - maxResults: how many events to show (default 10)
     * - timeMin: start date for events (default = now)
     */
    const { maxResults = 10, timeMin } = request.payload || {};
    const startTime = timeMin || new Date().toISOString();

    (async () => {
      try {
        const token = await getAuthTokenInteractive();

        // Build URL with query params
        const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
        url.searchParams.set('singleEvents', 'true');   // expand recurring
        url.searchParams.set('orderBy', 'startTime');   // sort
        url.searchParams.set('timeMin', startTime);     // only future events
        url.searchParams.set('maxResults', String(maxResults));

        // Fetch events
        const { ok, status, json } = await fetchJson(url.toString(), {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!ok) {
          console.error('Calendar list error:', status, json);
          sendResponse({ success: false, status, error: json });
          return;
        }

        // Return array of events
        sendResponse({ success: true, events: Array.isArray(json.items) ? json.items : [] });
      } catch (err) {
        console.error('listCalendarEvents error:', err);
        sendResponse({ success: false, error: String(err && err.message || err) });
      }
    })();
    return true; // async
  }
});

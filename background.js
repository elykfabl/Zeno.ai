'use strict';

/**
 * Background script — Phase 2
 * What this does:
 * - Handles Google OAuth via chrome.identity to obtain an access token.
 * - Receives chat-driven requests from the popup to create calendar events.
 * - Calls Google Calendar API (v3) to insert events into the user's primary calendar.
 *
 * How to extend this:
 * - Add more message actions (e.g., listUpcomingEvents, updateEvent, cancelEvent).
 * - Include additional event fields (location, reminders, conferenceData) in the body.
 * - Handle attendee emails, time zones, or recurrence rules.
 */

// Listen for requests from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'login') {
    chrome.identity.getAuthToken({ interactive: true }, token => {
      if (chrome.runtime.lastError || !token) {
       ` console.error('Login failed:', chrome.runtime.lastError);`
        sendResponse({ success: false, error: chrome.runtime.lastError });
        return;
      }
      console.log('Got token:', token);
      sendResponse({ success: true, token });
    });
    return true; // Keep sendResponse async
  }

  if (request.action === 'createCalendarEvent') {
    // Creates an event on the user's primary Google Calendar.
    // request.payload should include: title, startISO, endISO, attendees[] (optional), description (optional)
    const { title, startISO, endISO, attendees = [], description = '' } = request.payload || {};
    if (!title || !startISO) {
      sendResponse({ success: false, error: 'Missing title or start time' });
      return true;
    }

    // Ensure we have an OAuth token for Calendar API
    chrome.identity.getAuthToken({ interactive: true }, token => {
      if (chrome.runtime.lastError || !token) {
        console.error('Token error:', chrome.runtime.lastError);
        sendResponse({ success: false, error: chrome.runtime.lastError });
        return;
      }

      // Construct Calendar API event resource
      const body = {
        summary: title,
        description,
        start: { dateTime: startISO },
        end: { dateTime: endISO || startISO },
        attendees: attendees
          .filter(Boolean)
          .map(email => ({ email }))
      };

      // Call Calendar API: insert event on primary calendar
      fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      })
      .then(r => r.json().then(j => ({ ok: r.ok, status: r.status, json: j }))) // unwrap JSON with status
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

  if (request.action === 'listCalendarEvents') {
    // Lists upcoming events from the user's primary calendar.
    // Optional request.payload: { maxResults?: number, timeMin?: string }
    const { maxResults = 10, timeMin } = request.payload || {};

    const startTime = timeMin || new Date().toISOString();

    chrome.identity.getAuthToken({ interactive: true }, token => {
      if (chrome.runtime.lastError || !token) {
        console.error('Token error:', chrome.runtime.lastError);
        sendResponse({ success: false, error: chrome.runtime.lastError });
        return;
      }

      const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
      url.searchParams.set('singleEvents', 'true');
      url.searchParams.set('orderBy', 'startTime');
      url.searchParams.set('timeMin', startTime);
      url.searchParams.set('maxResults', String(maxResults));

      fetch(url.toString(), {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(r => r.json().then(j => ({ ok: r.ok, status: r.status, json: j })))
      .then(({ ok, status, json }) => {
        if (!ok) {
          console.error('Calendar list error:', status, json);
          sendResponse({ success: false, status, error: json });
          return;
        }
        sendResponse({ success: true, events: Array.isArray(json.items) ? json.items : [] });
      })
      .catch(err => {
        console.error('Network error:', err);
        sendResponse({ success: false, error: String(err) });
      });
    });
    return true; // async
  }
});
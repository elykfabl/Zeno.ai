'use strict';

/**
 * Mini Calendar Assistant — Chat-only popup
 * - Chat UI for natural-language scheduling; creates events via background.js
 * - Local list/composer removed for streamlined ChatGPT-like experience
 */

// ---------- DOM Utilities ----------
/** @param {string} id */
function byId(id) { return /** @type {HTMLElement} */(document.getElementById(id)); }
/** @param {string|number|Date} d */
function fmtDate(d) {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}
/** simple HTML escape (bugfix: removed stray ';' from char class) */
function escapeHtml(str) {
  return String(str).replace(/[&<>"]/g, s => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[s]));
}

// No local storage list, composer, or login UI. OAuth will occur implicitly from background on API call.

// --- Simple LLM parsing stub and chat flow ---
/**
 * Overview
 * - The popup provides a chat box where users type scheduling requests.
 * - We parse the text locally (for now) to extract a start time, and a simple title.
 * - Then we message the background to create the Calendar event with the user's OAuth token.
 *
 * Moving forward
 * - Replace parseNaturalLanguageToEvent with a real LLM call (send the text to your model,
 *   return structured fields: title, startISO, endISO, attendees[], description, etc.).
 * - Add a small dialog/turn-taking logic to ask clarifying questions (e.g., title, attendees).
 * - Maintain conversation state in chrome.storage.local so follow-up messages can reference context.
 */
/**
 * parseNaturalLanguageToEvent attempts to extract { title, startISO, endISO }
 * from a natural-language instruction like "Set calendar for 4:00 AM tomorrow".
 * This is a lightweight deterministic stub; later we can swap in a real LLM call.
 */
function parseNaturalLanguageToEvent(input) {
  const text = String(input || '').trim();
  if (!text) return { error: 'Empty message' };

  // Very naive parse: look for time like 4:00 or 4am and words like today/tomorrow
  const timeMatch = text.match(/(\b\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  const isTomorrow = /tomorrow/i.test(text);
  const isToday = /today/i.test(text);

  let date = new Date();
  if (isTomorrow) {
    date.setDate(date.getDate() + 1);
  }
  // If neither today nor tomorrow mentioned, default to today

  let hours = 9; let minutes = 0;
  if (timeMatch) {
    hours = Number(timeMatch[1]);
    minutes = Number(timeMatch[2] || 0);
    const ampm = (timeMatch[3] || '').toLowerCase();
    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;
  }

  date.setHours(hours, minutes, 0, 0);
  const startISO = date.toISOString();

  // Default 30-minute duration if no end provided
  const endDate = new Date(date.getTime() + 30 * 60 * 1000);
  const endISO = endDate.toISOString();

  // Title fallback
  let title = 'New event';
  const titleMatch = text.match(/(?:about|titled|called)\s+([\w\s]+)/i);
  if (titleMatch && titleMatch[1]) {
    title = titleMatch[1].trim();
  }

  return { title, startISO, endISO };
}

function appendChat(role, content) {
  // Render ChatGPT-like bubbles
  const log = byId('chatLog');
  const row = document.createElement('div');
  row.className = `msg ${role.toLowerCase() === 'you' ? 'user' : 'assistant'}`;
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = content;
  row.appendChild(bubble);
  log.appendChild(row);
  log.scrollTop = log.scrollHeight;
}

function setBusy(disabled) {
  byId('chatSend').disabled = disabled;
  byId('chatInput').disabled = disabled;
}

function setTyping(visible) {
  const t = byId('typing');
  if (!t) return;
  t.classList.toggle('hidden', !visible);
}

byId('chatSend').addEventListener('click', async () => {
  // 1) Read user message  2) Parse it  3) Ask for title if missing
  // 4) Request background to create event  5) Show result
  const inputEl = byId('chatInput');
  const text = inputEl.value.trim();
  if (!text) return;

  appendChat('You', text);
  setBusy(true);
  setTyping(true);
  try {
    const parsed = parseNaturalLanguageToEvent(text);
    if (parsed.error) {
      appendChat('Assistant', parsed.error);
      return;
    }

    // Ask for title if generic
    if (!parsed.title || parsed.title === 'New event') {
      appendChat('Assistant', 'What should the title be?');
      return;
    }

    // Create via background
    await new Promise((resolve) => chrome.runtime.sendMessage({
      action: 'createCalendarEvent',
      payload: parsed
    }, (resp) => {
      if (!resp || !resp.success) {
        appendChat('Assistant', 'Failed to create event. Please sign in and try again.');
        resolve();
        return;
      }
      const when = `${fmtDate(parsed.startISO)} → ${new Date(parsed.endISO).toLocaleTimeString([], { timeStyle: 'short' })}`;
      appendChat('Assistant', `Created event: "${parsed.title}" at ${when}`);
      resolve();
    }));
  } finally {
    setBusy(false);
    setTyping(false);
    inputEl.value = '';
  }
});

// Enter to send, Shift+Enter for newline
byId('chatInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    byId('chatSend').click();
  }
});

// Fetch and display upcoming events in the chat as a system message
byId('showEvents').addEventListener('click', () => {
  setBusy(true);
  setTyping(true);
  chrome.runtime.sendMessage({ action: 'listCalendarEvents', payload: { maxResults: 10 } }, (resp) => {
    setBusy(false);
    setTyping(false);
    if (!resp || !resp.success) {
      appendChat('Assistant', 'Could not retrieve events. Please sign in and try again.');
      return;
    }
    if (!resp.events.length) {
      appendChat('Assistant', 'No upcoming events found.');
      return;
    }
    const lines = resp.events.map(ev => {
      const start = ev.start && (ev.start.dateTime || ev.start.date);
      const end = ev.end && (ev.end.dateTime || ev.end.date);
      const when = start ? fmtDate(start) : '—';
      return `• ${ev.summary || 'Untitled'} — ${when}`;
    });
    appendChat('Assistant', `Upcoming events:\n${lines.join('\n')}`);
  });
});
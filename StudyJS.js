'use strict'; // Enforces stricter JavaScript rules (helps avoid errors)

/**
 * Mini Calendar Assistant — Chat-only popup
 * - Provides a chat-like UI where users can type scheduling requests
 * - Parses those requests into events (locally for now)
 * - Saves them to local storage (not yet Google Calendar)
 */

// ---------- DOM Utilities ----------
/** 
 * Helper: get element by ID 
 * Example: byId("chatInput") returns <textarea> element
 */
function byId(id) { return /** @type {HTMLElement} */(document.getElementById(id)); }

/**
 * Format a date into a user-friendly string
 * Example: "Sep 9, 2025, 2:00 PM"
 */
function fmtDate(d) {
  const dt = new Date(d);
  // If invalid date, return a placeholder
  if (!(dt instanceof Date) || Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

/** Simple function to prevent HTML injection (security) */
const HTML_ESCAPE_MAP = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' };
const HTML_ESCAPE_RE = /[&<>"]/g;
function escapeHtml(str) {
  return String(str).replace(HTML_ESCAPE_RE, s => HTML_ESCAPE_MAP[s]);
}

// -----------------------------------
// --- Natural Language Event Parser ---
// -----------------------------------

/**
 * This tries to turn text like "Coffee with Sarah tomorrow at 2pm"
 * into a structured event: { title, startISO, endISO }.
 * Currently very basic (stub). Later you’d replace this with an LLM.
 */
function parseNaturalLanguageToEvent(input) {
  const text = String(input || '').trim();
  if (!text) return { error: 'Empty message' };

  // Find time like "4:00", "4am", "2:30 pm"
  const timeMatch = text.match(/(\b\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);

  // Detect words "tomorrow" or "today"
  const isTomorrow = /tomorrow/i.test(text);
  const isToday = /today/i.test(text);

  let date = new Date();
  if (isTomorrow) {
    date.setDate(date.getDate() + 1); // move to tomorrow
  }
  // if "today" or nothing → keep current date

  // Default time is 9:00 AM
  let hours = 9; let minutes = 0;
  if (timeMatch) {
    hours = Number(timeMatch[1]);
    minutes = Number(timeMatch[2] || 0);
    const ampm = (timeMatch[3] || '').toLowerCase();
    if (ampm === 'pm' && hours < 12) hours += 12; // convert to 24h
    if (ampm === 'am' && hours === 12) hours = 0; // midnight fix
  }

  // Set event start time
  date.setHours(hours, minutes, 0, 0);
  const startISO = date.toISOString();

  // End time = +30 minutes
  const endDate = new Date(date.getTime() + 30 * 60 * 1000);
  const endISO = endDate.toISOString();

  // Extract a possible title
  let title = 'New event';
  const titleMatch = text.match(/(?:about|titled|called)\s+([\w\s]+)/i);
  if (titleMatch && titleMatch[1]) {
    title = titleMatch[1].trim();
  }

  return { title, startISO, endISO };
}

// -----------------------------------
// --- Local Storage for Test Events ---
// -----------------------------------

/**
 * Instead of Google Calendar, we use chrome.storage.local (or browser localStorage)
 * so we can test the full flow inside the popup.
 */
const LOCAL_EVENTS_KEY = 'miniCal.localEvents';

// Load locally saved events
function loadLocalEvents() {
  return new Promise(resolve => {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get([LOCAL_EVENTS_KEY], res => resolve(res[LOCAL_EVENTS_KEY] || []));
      } else {
        const raw = localStorage.getItem(LOCAL_EVENTS_KEY);
        resolve(raw ? JSON.parse(raw) : []);
      }
    } catch (_) {
      resolve([]);
    }
  });
}

// Save events locally
function saveLocalEvents(events) {
  return new Promise(resolve => {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ [LOCAL_EVENTS_KEY]: events }, resolve);
      } else {
        localStorage.setItem(LOCAL_EVENTS_KEY, JSON.stringify(events));
        resolve();
      }
    } catch (_) {
      resolve(); // fallback: ignore errors
    }
  });
}

// -----------------------------------
// --- Chat Rendering Helpers ---
// -----------------------------------

/**
 * Append a message bubble to the chat log
 * role = "You" (user) or "Assistant" (AI bot)
 */
function appendChat(role, content) {
  const log = byId('chatLog');

  // Create outer container
  const message = document.createElement('div');
  message.className = `message ${role.toLowerCase() === 'you' ? 'user' : 'assistant'}`;
  message.style.opacity = '0'; // for animation
  message.style.transform = 'translateY(10px)';

  // Inner chat bubble
  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  bubble.textContent = content;
  message.appendChild(bubble);
  log.appendChild(message);

  // Animate message appearing
  requestAnimationFrame(() => {
    message.style.transition = 'all 0.3s ease-out';
    message.style.opacity = '1';
    message.style.transform = 'translateY(0)';
  });

  // Auto-scroll down
  log.scrollTop = log.scrollHeight;
}

// Disable/enable chat input + button
function setBusy(disabled) {
  byId('chatSend').disabled = disabled;
  byId('chatInput').disabled = disabled;
}

// Show/hide "typing..." indicator
function setTyping(visible) {
  const t = byId('typing');
  if (!t) return;
  t.classList.toggle('hidden', !visible);
}

// -----------------------------------
// --- Input Handling & UX ---
// -----------------------------------

const inputEl = byId('chatInput');
const sendBtn = byId('chatSend');

// Auto-resize textarea as user types
function autoResize(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
}
inputEl.addEventListener('input', () => autoResize(inputEl));

// Handle Enter vs Shift+Enter
inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault(); // prevent newline
    sendBtn.click();    // trigger send
  }
});

// Send button handler
sendBtn.addEventListener('click', async () => {
  const text = inputEl.value.trim();
  if (!text) return;

  // Show user's message
  appendChat('You', text);
  setBusy(true);
  setTyping(true);

  // Clear input box immediately
  inputEl.value = '';
  autoResize(inputEl);

  try {
    await handleChatTurn(text); // handle conversation logic
  } finally {
    setBusy(false);
    setTyping(false);
  }
});

// Focus input when popup opens
inputEl.focus();

// -----------------------------------
// --- Upcoming Events Panel ---
// -----------------------------------

byId('showEvents').addEventListener('click', async () => {
  const panel = byId('upcomingPanel');
  panel.classList.remove('hidden');
  panel.style.opacity = '0';
  panel.style.transform = 'translateX(100%)';

  await renderUpcomingList();

  // Animate slide-in
  requestAnimationFrame(() => {
    panel.style.transition = 'all 0.3s ease-out';
    panel.style.opacity = '1';
    panel.style.transform = 'translateX(0)';
  });
});

// Close panel animation
byId('closeUpcoming').addEventListener('click', () => {
  const panel = byId('upcomingPanel');
  panel.style.transition = 'all 0.3s ease-out';
  panel.style.opacity = '0';
  panel.style.transform = 'translateX(100%)';
  
  setTimeout(() => {
    panel.classList.add('hidden');
    panel.style.transition = '';
    panel.style.opacity = '';
    panel.style.transform = '';
  }, 300);
});

/**
 * Render saved events into the Upcoming panel
 */
async function renderUpcomingList() {
  const list = byId('upcomingList');
  list.innerHTML = '';
  const events = await loadLocalEvents();

  // If no events → show empty message
  if (!events.length) {
    const emptyState = document.createElement('div');
    emptyState.className = 'event-item';
    emptyState.style.textAlign = 'center';
    emptyState.style.color = 'var(--text-tertiary)';
    emptyState.style.fontStyle = 'italic';
    emptyState.textContent = 'No events scheduled yet.';
    list.appendChild(emptyState);
    return;
  }

  // Sort by start time
  const sorted = [...events].sort((a,b) => {
    const ta = a.start ? new Date(a.start).getTime() : Number.POSITIVE_INFINITY;
    const tb = b.start ? new Date(b.start).getTime() : Number.POSITIVE_INFINITY;
    return ta - tb;
  });

  // Render each event
  for (let i = 0; i < sorted.length; i++) {
    const ev = sorted[i];
    const item = document.createElement('div');
    item.className = 'event-item';

    const timeDiv = document.createElement('div');
    timeDiv.className = 'event-time';
    timeDiv.textContent = ev.start ? fmtDate(ev.start) : '—';

    const titleDiv = document.createElement('div');
    titleDiv.className = 'event-title';
    titleDiv.textContent = ev.title || 'Untitled';

    // Delete button
    const actions = document.createElement('div');
    actions.className = 'event-actions';
    const delBtn = document.createElement('button');
    delBtn.dataset.action = 'delete-local';
    delBtn.dataset.index = String(i);
    delBtn.type = 'button';
    delBtn.innerHTML = '<svg width="14" height="14" ... >X</svg>';
    delBtn.setAttribute('aria-label', 'Delete event');
    actions.appendChild(delBtn);

    item.appendChild(timeDiv);
    item.appendChild(titleDiv);
    item.appendChild(actions);
    list.appendChild(item);
  }
}

// Handle delete click inside event list
byId('upcomingList').addEventListener('click', async (e) => {
  const btn = /** @type {HTMLElement|null} */(e.target && e.target.closest('button'));
  if (!btn) return;
  if (btn.dataset.action !== 'delete-local') return;
  const idx = Number(btn.dataset.index);

  const events = await loadLocalEvents();
  if (idx < 0 || idx >= events.length) return;
  events.splice(idx, 1); // remove
  await saveLocalEvents(events);
  await renderUpcomingList();
});

// Clear all events button
const clearBtn = document.getElementById('clearLocal');
if (clearBtn) {
  clearBtn.addEventListener('click', async () => {
    if (!confirm('Clear all local test events?')) return;
    await saveLocalEvents([]);
    await renderUpcomingList();
  });
}

// -----------------------------------
// --- Conversational State Machine ---
// -----------------------------------

/**
 * convo = remembers where we are in the conversation
 * Example steps: askTitle → askWhen → askAttendees → askConfirm
 */
let convo = null;
function resetConvo() { convo = null; }

function startConvoFromText(text) {
  const parsed = parseNaturalLanguageToEvent(text);
  if (parsed.error) { appendChat('Assistant', parsed.error); return null; }
  const draft = { title: parsed.title, startISO: parsed.startISO, endISO: parsed.endISO, attendees: [] };

  if (!draft.title || draft.title === 'New event') return { step: 'askTitle', draft };
  if (!draft.startISO) return { step: 'askWhen', draft };
  return { step: 'askAttendees', draft };
}

// Extract emails from user text
function parseEmails(text) {
  const emails = (text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map(s => s.toLowerCase());
  return Array.from(new Set(emails)); // remove duplicates
}

/**
 * Handles a single user input turn.
 * Moves convo forward depending on step.
 */
async function handleChatTurn(text) {
  if (convo) {
    const step = convo.step;
    const d = convo.draft;

    // If we’re asking for a title
    if (step === 'askTitle') {
      d.title = text.trim() || d.title || 'Untitled';
      convo.step = d.startISO ? 'askAttendees' : 'askWhen';
      if (convo.step === 'askWhen') appendChat('Assistant', 'When is it? (e.g., “tomorrow 4pm”)');
      else appendChat('Assistant', 'Anyone to invite? (paste emails or say “no”)');
      return;
    }

    // If we’re asking for when
    if (step === 'askWhen') {
      const r = parseNaturalLanguageToEvent(text);
      if (!r.startISO) { appendChat('Assistant', 'I could not parse a time. Try “tomorrow 4pm”.'); return; }
      d.startISO = r.startISO; d.endISO = r.endISO;
      convo.step = 'askAttendees';
      appendChat('Assistant', 'Anyone to invite? (paste emails or say “no”)');
      return;
    }

    // If we’re asking for attendees
    if (step === 'askAttendees') {
      const emails = /^(no|none|skip)$/i.test(text.trim()) ? [] : parseEmails(text);
      d.attendees = emails;
      convo.step = 'askConfirm';

      const when = `${fmtDate(d.startISO)} → ${new Date(d.endISO).toLocaleTimeString([], { timeStyle: 'short' })}`;
      appendChat('Assistant', `Confirm event:\nTitle: ${d.title}\nWhen: ${when}\nAttendees: ${emails.length ? emails.join(', ') : '—'}\nType "confirm" to save or "edit" to change.`);
      return;
    }

    // If we’re confirming event
    if (step === 'askConfirm') {
      const t = text.trim().toLowerCase();
      if (t === 'confirm' || t === 'yes' || t === 'y') {
        // Save event locally
        const events = await loadLocalEvents();
        events.push({ title: d.title, start: d.startISO, end: d.endISO, attendees: d.attendees, createdAt: Date.now() });
        await saveLocalEvents(events);

        const when = `${fmtDate(d.startISO)} → ${new Date(d.endISO).toLocaleTimeString([], { timeStyle: 'short' })}`;
        appendChat('Assistant', `Saved locally: "${d.title}" at ${when}. (Concept test)`);
        resetConvo();
        return;
      }
      if (t === 'edit' || t === 'change') {
        convo.step = 'askWhatEdit';
        appendChat('Assistant', 'What would you like to change? (say: title / time / attendees)');
        return;
      }
      appendChat('Assistant', 'Please type "confirm" to save or "edit" to change.');
      return;
    }

    // If user wants to edit fields
    if (step === 'askWhatEdit') {
      const k = text.trim().toLowerCase();
      if (k.includes('title')) { convo.step = 'askTitle'; appendChat('Assistant', 'What is the new title?'); return; }
      if (k.includes('time') || k.includes('when')) { convo.step = 'askWhen'; appendChat('Assistant', 'What is the new time? (e.g., “tomorrow 4pm”)'); return; }
      if (k.includes('invite') || k.includes('attendee')) { convo.step = 'askAttendees'; appendChat('Assistant', 'Paste emails to invite, or say “no”.'); return; }
      appendChat('Assistant', 'Please say: title / time / attendees.');
      return;
    }
  }

  // If starting a brand-new conversation
  convo = startConvoFromText(text);
  if (!convo) return;
  if (convo.step === 'askTitle') { appendChat('Assistant', 'What should the title be?'); return; }
  if (convo.step === 'askWhen') { appendChat('Assistant', 'When is it? (e.g., “tomorrow 4pm”)'); return; }
  if (convo.step === 'askAttendees') { appendChat('Assistant', 'Anyone to invite? (paste emails or say “no”)'); return; }
}

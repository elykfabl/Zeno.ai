// 'use strict';

// /**
//  * Mini Calendar Assistant — Chat-only popup
//  * - Chat UI for natural-language scheduling; creates events via background.js
//  * - Local list/composer removed for streamlined ChatGPT-like experience
//  */

// // ---------- DOM Utilities ----------
// /** @param {string} id */
// function byId(id) { return /** @type {HTMLElement} */(document.getElementById(id)); }
// /** @param {string|number|Date} d */
// function fmtDate(d) {
//   const dt = new Date(d);
//   if (!(dt instanceof Date) || Number.isNaN(dt.getTime())) return '—';
//   return dt.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
// }
// /** simple HTML escape (bugfix: removed stray ';' from char class) */
// const HTML_ESCAPE_MAP = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' };
// const HTML_ESCAPE_RE = /[&<>"]/g;
// function escapeHtml(str) {
//   return String(str).replace(HTML_ESCAPE_RE, s => HTML_ESCAPE_MAP[s]);
// }

// // No local storage list, composer, or login UI. OAuth will occur implicitly from background on API call.

// // --- Simple LLM parsing stub and chat flow ---
// /**
//  * Overview
//  * - The popup provides a chat box where users type scheduling requests.
//  * - We parse the text locally (for now) to extract a start time, and a simple title.
//  * - Then we message the background to create the Calendar event with the user's OAuth token.
//  *
//  * Moving forward
//  * - Replace parseNaturalLanguageToEvent with a real LLM call (send the text to your model,
//  *   return structured fields: title, startISO, endISO, attendees[], description, etc.).
//  * - Add a small dialog/turn-taking logic to ask clarifying questions (e.g., title, attendees).
//  * - Maintain conversation state in chrome.storage.local so follow-up messages can reference context.
//  */
// /**
//  * parseNaturalLanguageToEvent attempts to extract { title, startISO, endISO }
//  * from a natural-language instruction like "Set calendar for 4:00 AM tomorrow".
//  * This is a lightweight deterministic stub; later we can swap in a real LLM call.
//  */
// function parseNaturalLanguageToEvent(input) {
//   const text = String(input || '').trim();
//   if (!text) return { error: 'Empty message' };

//   // Very naive parse: look for time like 4:00 or 4am and words like today/tomorrow
//   const timeMatch = text.match(/(\b\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
//   const isTomorrow = /tomorrow/i.test(text);
//   const isToday = /today/i.test(text);

//   let date = new Date();
//   if (isTomorrow) {
//     date.setDate(date.getDate() + 1);
//   }
//   // If neither today nor tomorrow mentioned, default to today

//   let hours = 9; let minutes = 0;
//   if (timeMatch) {
//     hours = Number(timeMatch[1]);
//     minutes = Number(timeMatch[2] || 0);
//     const ampm = (timeMatch[3] || '').toLowerCase();
//     if (ampm === 'pm' && hours < 12) hours += 12;
//     if (ampm === 'am' && hours === 12) hours = 0;
//   }

//   date.setHours(hours, minutes, 0, 0);
//   const startISO = date.toISOString();

//   // Default 30-minute duration if no end provided
//   const endDate = new Date(date.getTime() + 30 * 60 * 1000);
//   const endISO = endDate.toISOString();

//   // Title fallback
//   let title = 'New event';
//   const titleMatch = text.match(/(?:about|titled|called)\s+([\w\s]+)/i);
//   if (titleMatch && titleMatch[1]) {
//     title = titleMatch[1].trim();
//   }

//   return { title, startISO, endISO };
//   // return { title, startISO, endISO };
// }

// // ---- Minimal local storage for test-mode events ----
// // Purpose: While we don't persist to Google Calendar yet, we keep a local
// // list of "events" so you can test the full chat flow end-to-end. This uses
// // chrome.storage.local inside the extension. If someone opens testOne.html
// // directly in a normal tab (no extension context), we transparently fall back
// // to window.localStorage so it still works for demos.
// const LOCAL_EVENTS_KEY = 'miniCal.localEvents';
// function loadLocalEvents() {
//   return new Promise(resolve => {
//     try {
//       if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
//         chrome.storage.local.get([LOCAL_EVENTS_KEY], res => resolve(res[LOCAL_EVENTS_KEY] || []));
//       } else {
//         const raw = localStorage.getItem(LOCAL_EVENTS_KEY);
//         resolve(raw ? JSON.parse(raw) : []);
//       }
//     } catch (_) {
//       resolve([]);
//     }
//   });
// }
// function saveLocalEvents(events) {
//   return new Promise(resolve => {
//     try {
//       if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
//         chrome.storage.local.set({ [LOCAL_EVENTS_KEY]: events }, resolve);
//       } else {
//         localStorage.setItem(LOCAL_EVENTS_KEY, JSON.stringify(events));
//         resolve();
//       }
//     } catch (_) {
//       // best effort
//       resolve();
//     }
//   });
// }

// function appendChat(role, content) {
//   // Render modern chat bubbles with smooth animation
//   const log = byId('chatLog');
//   const message = document.createElement('div');
//   message.className = `message ${role.toLowerCase() === 'you' ? 'user' : 'assistant'}`;
//   message.style.opacity = '0';
//   message.style.transform = 'translateY(10px)';
  
//   const bubble = document.createElement('div');
//   bubble.className = 'message-bubble';
//   bubble.textContent = content;
//   message.appendChild(bubble);
//   log.appendChild(message);
  
//   // Animate in
//   requestAnimationFrame(() => {
//     message.style.transition = 'all 0.3s ease-out';
//     message.style.opacity = '1';
//     message.style.transform = 'translateY(0)';
//   });
  
//   log.scrollTop = log.scrollHeight;
// }

// function setBusy(disabled) {
//   byId('chatSend').disabled = disabled;
//   byId('chatInput').disabled = disabled;
// }

// function setTyping(visible) {
//   const t = byId('typing');
//   if (!t) return;
//   t.classList.toggle('hidden', !visible);
// }

// // Enhanced chat input handling with auto-resize and better UX
// const inputEl = byId('chatInput');
// const sendBtn = byId('chatSend');

// // Auto-resize textarea
// function autoResize(textarea) {
//   textarea.style.height = 'auto';
//   textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
// }

// inputEl.addEventListener('input', () => {
//   autoResize(inputEl);
// });

// // Enhanced keyboard handling
// inputEl.addEventListener('keydown', (e) => {
//   if (e.key === 'Enter' && !e.shiftKey) {
//     e.preventDefault();
//     sendBtn.click();
//   }
// });

// // Send button click handler
// sendBtn.addEventListener('click', async () => {
//   const text = inputEl.value.trim();
//   if (!text) return;

//   appendChat('You', text);
//   setBusy(true);
//   setTyping(true);
  
//   // Clear input immediately for better UX
//   inputEl.value = '';
//   autoResize(inputEl);
  
//   try {
//     await handleChatTurn(text);
//   } finally {
//     setBusy(false);
//     setTyping(false);
//   }
// });

// // Focus input on load
// inputEl.focus();

// // Fetch and display locally saved test events instead of Calendar API (concept test)
// // Open the dedicated Upcoming panel and render the local list
// byId('showEvents').addEventListener('click', async () => {
//   // Toggle/open upcoming panel with smooth animation
//   const panel = byId('upcomingPanel');
//   panel.classList.remove('hidden');
//   panel.style.opacity = '0';
//   panel.style.transform = 'translateX(100%)';
  
//   await renderUpcomingList();
  
//   // Animate in
//   requestAnimationFrame(() => {
//     panel.style.transition = 'all 0.3s ease-out';
//     panel.style.opacity = '1';
//     panel.style.transform = 'translateX(0)';
//   });
// });

// byId('closeUpcoming').addEventListener('click', () => {
//   const panel = byId('upcomingPanel');
//   panel.style.transition = 'all 0.3s ease-out';
//   panel.style.opacity = '0';
//   panel.style.transform = 'translateX(100%)';
  
//   setTimeout(() => {
//     panel.classList.add('hidden');
//     panel.style.transition = '';
//     panel.style.opacity = '';
//     panel.style.transform = '';
//   }, 300);
// });

// /**
//  * renderUpcomingList
//  * Renders the locally saved test events (sorted by start) into the
//  * dedicated Upcoming panel. This mirrors a real "Upcoming" page but
//  * stays fully local for concept testing.
//  */
// async function renderUpcomingList() {
//   const list = byId('upcomingList');
//   list.innerHTML = '';
//   const events = await loadLocalEvents();
//   if (!events.length) {
//     const emptyState = document.createElement('div');
//     emptyState.className = 'event-item';
//     emptyState.style.textAlign = 'center';
//     emptyState.style.color = 'var(--text-tertiary)';
//     emptyState.style.fontStyle = 'italic';
//     emptyState.textContent = 'No events scheduled yet.';
//     list.appendChild(emptyState);
//     return;
//   }
//   const sorted = [...events].sort((a,b) => {
//     const ta = a.start ? new Date(a.start).getTime() : Number.POSITIVE_INFINITY;
//     const tb = b.start ? new Date(b.start).getTime() : Number.POSITIVE_INFINITY;
//     return ta - tb;
//   });
//   for (let i = 0; i < sorted.length; i++) {
//     const ev = sorted[i];
//     const item = document.createElement('div');
//     item.className = 'event-item';

//     const timeDiv = document.createElement('div');
//     timeDiv.className = 'event-time';
//     timeDiv.textContent = ev.start ? fmtDate(ev.start) : '—';

//     const titleDiv = document.createElement('div');
//     titleDiv.className = 'event-title';
//     titleDiv.textContent = ev.title || 'Untitled';

//     const actions = document.createElement('div');
//     actions.className = 'event-actions';
//     const delBtn = document.createElement('button');
//     delBtn.dataset.action = 'delete-local';
//     delBtn.dataset.index = String(i);
//     delBtn.type = 'button';
//     delBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
//     delBtn.setAttribute('aria-label', 'Delete event');
//     actions.appendChild(delBtn);

//     item.appendChild(timeDiv);
//     item.appendChild(titleDiv);
//     item.appendChild(actions);
//     list.appendChild(item);
//   }
// }

// // Handle delete clicks within the Upcoming list (event delegation)
// byId('upcomingList').addEventListener('click', async (e) => {
//   const btn = /** @type {HTMLElement|null} */(e.target && e.target.closest('button'));
//   if (!btn) return;
//   if (btn.dataset.action !== 'delete-local') return;
//   const idx = Number(btn.dataset.index);
//   if (!Number.isInteger(idx)) return;
//   const events = await loadLocalEvents();
//   if (idx < 0 || idx >= events.length) return;
//   events.splice(idx, 1);
//   await saveLocalEvents(events);
//   await renderUpcomingList();
// });

// // Clear all locally saved test events
// const clearBtn = document.getElementById('clearLocal');
// if (clearBtn) {
//   clearBtn.addEventListener('click', async () => {
//     if (!confirm('Clear all local test events?')) return;
//     await saveLocalEvents([]);
//     await renderUpcomingList();
//   });
// }

// // ---- Conversational state machine (local-only test) ----
// // How it works (high-level):
// // 1) We try to parse the initial user message for time/title.
// // 2) If something is missing, we set a "step" and ask a follow-up.
// // 3) Each subsequent message is routed based on the current step until we
// //    have all fields (title, when, optional attendees).
// // 4) We show a confirmation summary and save locally on confirmation.
// let convo = null; // { step: string, draft: {title,startISO,endISO,attendees[]} }
// function resetConvo() { convo = null; }

// function startConvoFromText(text) {
//   const parsed = parseNaturalLanguageToEvent(text);
//   if (parsed.error) { appendChat('Assistant', parsed.error); return null; }
//   const draft = { title: parsed.title, startISO: parsed.startISO, endISO: parsed.endISO, attendees: [] };
//   if (!draft.title || draft.title === 'New event') return { step: 'askTitle', draft };
//   if (!draft.startISO) return { step: 'askWhen', draft };
//   return { step: 'askAttendees', draft };
// }

// function parseEmails(text) {
//   const emails = (text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map(s => s.toLowerCase());
//   return Array.from(new Set(emails));
// }

// async function handleChatTurn(text) {
//   if (convo) {
//     const step = convo.step;
//     const d = convo.draft;
//     if (step === 'askTitle') {
//       d.title = text.trim() || d.title || 'Untitled';
//       convo.step = d.startISO ? 'askAttendees' : 'askWhen';
//       if (convo.step === 'askWhen') appendChat('Assistant', 'When is it? (e.g., “tomorrow 4pm”)');
//       else appendChat('Assistant', 'Anyone to invite? (paste emails or say “no”)');
//     return;
//   }
//     if (step === 'askWhen') {
//       const r = parseNaturalLanguageToEvent(text);
//       if (!r.startISO) { appendChat('Assistant', 'I could not parse a time. Try “tomorrow 4pm”.'); return; }
//       d.startISO = r.startISO; d.endISO = r.endISO;
//       convo.step = 'askAttendees';
//       appendChat('Assistant', 'Anyone to invite? (paste emails or say “no”)');
//       return;
//     }
//     if (step === 'askAttendees') {
//       const emails = /^(no|none|skip)$/i.test(text.trim()) ? [] : parseEmails(text);
//       d.attendees = emails;
//       convo.step = 'askConfirm';
//       const when = `${fmtDate(d.startISO)} → ${new Date(d.endISO).toLocaleTimeString([], { timeStyle: 'short' })}`;
//       appendChat('Assistant', `Confirm event:\nTitle: ${d.title}\nWhen: ${when}\nAttendees: ${emails.length ? emails.join(', ') : '—'}\nType "confirm" to save or "edit" to change.`);
//       return;
//     }
//     if (step === 'askConfirm') {
//       const t = text.trim().toLowerCase();
//       if (t === 'confirm' || t === 'yes' || t === 'y') {
//         const events = await loadLocalEvents();
//         events.push({ title: d.title, start: d.startISO, end: d.endISO, attendees: d.attendees, createdAt: Date.now() });
//         await saveLocalEvents(events);
//         const when = `${fmtDate(d.startISO)} → ${new Date(d.endISO).toLocaleTimeString([], { timeStyle: 'short' })}`;
//         appendChat('Assistant', `Saved locally: "${d.title}" at ${when}. (Concept test)`);
//         resetConvo();
//         return;
//       }
//       if (t === 'edit' || t === 'change') { convo.step = 'askWhatEdit'; appendChat('Assistant', 'What would you like to change? (say: title / time / attendees)'); return; }
//       appendChat('Assistant', 'Please type "confirm" to save or "edit" to change.');
//       return;
//     }
//     if (step === 'askWhatEdit') {
//       const k = text.trim().toLowerCase();
//       if (k.includes('title')) { convo.step = 'askTitle'; appendChat('Assistant', 'What is the new title?'); return; }
//       if (k.includes('time') || k.includes('when')) { convo.step = 'askWhen'; appendChat('Assistant', 'What is the new time? (e.g., “tomorrow 4pm”)'); return; }
//       if (k.includes('invite') || k.includes('attendee')) { convo.step = 'askAttendees'; appendChat('Assistant', 'Paste emails to invite, or say “no”.'); return; }
//       appendChat('Assistant', 'Please say: title / time / attendees.');
//       return;
//     }
//   }

//   // New conversation: seed from initial text
//   convo = startConvoFromText(text);
//   if (!convo) return;
//   if (convo.step === 'askTitle') { appendChat('Assistant', 'What should the title be?'); return; }
//   if (convo.step === 'askWhen') { appendChat('Assistant', 'When is it? (e.g., “tomorrow 4pm”)'); return; }
//   if (convo.step === 'askAttendees') { appendChat('Assistant', 'Anyone to invite? (paste emails or say “no”)'); return; }
// }
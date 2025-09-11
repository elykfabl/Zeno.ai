// convoService.js
'use strict';

import { parseNaturalLanguageToEvent } from './parserService.js';
import { loadLocalEvents, saveLocalEvents } from './storageService.js';
import { appendChat, fmtDate } from './uiService.js';

let convo = null;
export function resetConvo() { convo = null; }

/**
 * handleChatTurn(text)
 * Drives the conversation state machine and reports user-facing errors
 * via appendChat(..., true)
 */
export async function handleChatTurn(text) {
  try {
    if (convo) {
      const step = convo.step;
      const d = convo.draft;

      if (step === 'askTitle') {
        d.title = text.trim() || d.title || 'Untitled';
        convo.step = d.startISO ? 'askAttendees' : 'askWhen';
        appendChat('Assistant', convo.step === 'askWhen' ? 'When is it? (e.g., “tomorrow 4pm”)' : 'Anyone to invite? (paste emails or say “no”)');
        return;
      }

      if (step === 'askWhen') {
        const parsed = parseNaturalLanguageToEvent(text);
        if (parsed.error) { appendChat('Assistant', parsed.error, true); return; }
        if (!parsed.startISO) { appendChat('Assistant', 'I still could not detect a time. Try something like "tomorrow 4pm".', true); return; }
        d.startISO = parsed.startISO; d.endISO = parsed.endISO;
        convo.step = 'askAttendees';
        appendChat('Assistant', 'Anyone to invite? (paste emails or say “no”)');
        return;
      }

      if (step === 'askAttendees') {
        const emails = /^(no|none|skip)$/i.test(text.trim()) ? [] : (text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map(s => s.toLowerCase());
        d.attendees = emails;
        convo.step = 'askConfirm';
        const when = `${fmtDate(d.startISO)} → ${new Date(d.endISO).toLocaleTimeString([], { timeStyle: 'short' })}`;
        appendChat('Assistant', `Confirm event:\nTitle: ${d.title}\nWhen: ${when}\nAttendees: ${emails.length ? emails.join(', ') : '—'}\nType "confirm" to save or "edit" to change.`);
        return;
      }

      if (step === 'askConfirm') {
        const t = text.trim().toLowerCase();
        if (['confirm','yes','y'].includes(t)) {
          try {
            const events = await loadLocalEvents();
            events.push({ title: d.title, start: d.startISO, end: d.endISO, attendees: d.attendees, createdAt: Date.now() });
            await saveLocalEvents(events);
            appendChat('Assistant', `✅ Saved: "${d.title}" at ${fmtDate(d.startISO)}. (Local)`);
            resetConvo();
            return;
          } catch (err) {
            console.error(err);
            appendChat('Assistant', '⚠️ Could not save event — storage error. Try again.', true);
            return;
          }
        }
        if (['edit','change'].includes(t)) {
          convo.step = 'askWhatEdit';
          appendChat('Assistant', 'What would you like to change? (say: title / time / attendees)');
          return;
        }
        appendChat('Assistant', 'Please type "confirm" to save or "edit" to change.', true);
        return;
      }

      if (step === 'askWhatEdit') {
        const k = text.trim().toLowerCase();
        if (k.includes('title')) { convo.step = 'askTitle'; appendChat('Assistant', 'What is the new title?'); return; }
        if (k.includes('time') || k.includes('when')) { convo.step = 'askWhen'; appendChat('Assistant', 'What is the new time? (e.g., “tomorrow 4pm”)'); return; }
        if (k.includes('invite') || k.includes('attendee')) { convo.step = 'askAttendees'; appendChat('Assistant', 'Paste emails to invite, or say “no”.'); return; }
        appendChat('Assistant', 'Please say: title / time / attendees.', true);
        return;
      }
    }

    // New conversation seeded from text
    const parsed = parseNaturalLanguageToEvent(text);
    if (parsed.error) { appendChat('Assistant', parsed.error, true); return; }

    // Choose step depending on which fields are present
    const draft = { title: parsed.title || 'New event', startISO: parsed.startISO || null, endISO: parsed.endISO || null, attendees: [] };
    if (!draft.title || draft.title === 'New event') {
      convo = { step: 'askTitle', draft };
      appendChat('Assistant', 'What should the title be?');
      return;
    }
    if (!draft.startISO) {
      convo = { step: 'askWhen', draft };
      appendChat('Assistant', 'When is it? (e.g., “tomorrow 4pm”)');
      return;
    }
    // otherwise proceed to attendees
    convo = { step: 'askAttendees', draft };
    appendChat('Assistant', 'Anyone to invite? (paste emails or say “no”)');
  } catch (err) {
    console.error(err);
    appendChat('Assistant', '⚠️ Unexpected error occurred — please try again.', true);
  }
}

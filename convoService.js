// convoService.js
import { appendChat, fmtDate } from './uiService.js';
import { parseNaturalLanguageToEvent } from './parserService.js';
import { loadLocalEvents, saveLocalEvents } from './storageService.js';

let convo = null;
export function resetConvo() { convo = null; }

function startConvoFromText(text) {
  const parsed = parseNaturalLanguageToEvent(text);
if (parsed.error) {
  appendChat('Assistant', "😕 I couldn’t figure out the date/time. Try something like ‘meeting tomorrow at 2pm’.");
  return null;
}
  const draft = { title: parsed.title, startISO: parsed.startISO, endISO: parsed.endISO, attendees: [] };
  if (!draft.title || draft.title === 'New event') return { step: 'askTitle', draft };
  if (!draft.startISO) return { step: 'askWhen', draft };
  return { step: 'askAttendees', draft };
}

function parseEmails(text) {
  return (text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map(s => s.toLowerCase());
}

export async function handleChatTurn(text) {
  if (convo) {
    const step = convo.step;
    const d = convo.draft;

    if (step === 'askTitle') {
      d.title = text.trim() || d.title || 'Untitled';
      convo.step = d.startISO ? 'askAttendees' : 'askWhen';
      appendChat('Assistant', convo.step === 'askWhen' ? 'When is it?' : 'Anyone to invite?');
      return;
    }

    if (step === 'askWhen') {
      const r = parseNaturalLanguageToEvent(text);
      if (!r.startISO) { appendChat('Assistant', 'Could not parse a time.'); return; }
      d.startISO = r.startISO; d.endISO = r.endISO;
      convo.step = 'askAttendees';
      appendChat('Assistant', 'Anyone to invite?');
      return;
    }

    if (step === 'askAttendees') {
      d.attendees = /^(no|none|skip)$/i.test(text.trim()) ? [] : parseEmails(text);
      convo.step = 'askConfirm';
      const when = `${fmtDate(d.startISO)} → ${new Date(d.endISO).toLocaleTimeString([], { timeStyle: 'short' })}`;
      appendChat('Assistant', `Confirm:\n${d.title}\n${when}\nAttendees: ${d.attendees.join(', ') || '—'}\nType "confirm" or "edit"`);
      return;
    }

    if (step === 'askConfirm') {
      const t = text.trim().toLowerCase();
      if (['confirm','yes','y'].includes(t)) {
        const events = await loadLocalEvents();
        events.push({ title: d.title, start: d.startISO, end: d.endISO, attendees: d.attendees, createdAt: Date.now() });
        await saveLocalEvents(events);
        appendChat('Assistant', `Saved: "${d.title}" at ${fmtDate(d.startISO)}`);
        resetConvo();
        return;
      }
      if (['edit','change'].includes(t)) { convo.step = 'askWhatEdit'; appendChat('Assistant', 'What to change?'); return; }
      appendChat('Assistant', 'Type "confirm" or "edit".');
      return;
    }

    if (step === 'askWhatEdit') {
      const k = text.trim().toLowerCase();
      if (k.includes('title')) { convo.step = 'askTitle'; appendChat('Assistant', 'New title?'); return; }
      if (k.includes('time')) { convo.step = 'askWhen'; appendChat('Assistant', 'New time?'); return; }
      if (k.includes('attendee')) { convo.step = 'askAttendees'; appendChat('Assistant', 'Who to invite?'); return; }
      appendChat('Assistant', 'Say: title / time / attendees.');
      return;
    }
  }

  convo = startConvoFromText(text);
  if (!convo) return;
  appendChat('Assistant', convo.step === 'askTitle' ? 'What should the title be?' :
                           convo.step === 'askWhen' ? 'When is it?' :
                           'Anyone to invite?');
}

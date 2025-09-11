// parserService.js
'use strict';

/**
 * parseNaturalLanguageToEvent(input)
 * - Returns { title, startISO, endISO } on success (startISO may be null if time missing)
 * - Returns { error: 'message' } when input is nonsense or clearly unparseable.
 *
 * Rules:
 * - If no time tokens found, startISO === null (so convo can prompt for time).
 * - If input looks like nonsense (no scheduling keywords, no alpha words), return an error.
 */

const SCHEDULE_KEYWORDS = /\b(meeting|meet|lunch|dinner|coffee|call|appointment|schedule|set|remind|reminder|book|session|interview)\b/i;
const MONTH_WORD = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/i;

export function parseNaturalLanguageToEvent(input) {
  const text = String(input || '').trim();
  if (!text) return { error: 'Empty message' };

  // simple sanity check: if the text is mostly punctuation or too short, treat as parse-fail
  if (!/[a-zA-Z0-9]/.test(text) || text.trim().length < 2) {
    return { error: "I couldn't understand that. Try: 'Meeting tomorrow at 2pm'." };
  }

  // --- Detect explicit date (month name + day + optional year) ---
  let baseDate = new Date();
  const dateMatch = text.match(/(\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*)\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?/i);
  if (dateMatch) {
    try {
      const month = new Date(`${dateMatch[1]} 1, 2000`).getMonth();
      const day = parseInt(dateMatch[2], 10);
      const year = dateMatch[3] ? parseInt(dateMatch[3], 10) : new Date().getFullYear();
      baseDate = new Date(year, month, day);
    } catch (e) {
      // if constructing date fails, leave baseDate as today
      baseDate = new Date();
    }
  } else if (/tomorrow/i.test(text)) {
    baseDate.setDate(baseDate.getDate() + 1);
  } else if (/today/i.test(text)) {
    // keep today
  }

  // --- Time detection: range or single time ---
  // range variants: "10am - 11:30am", "2:00pm to 3pm"
  const rangeRe = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|to|–)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i;
  const singleTimeRe = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i;

  let startISO = null;
  let endISO = null;
  const rangeMatch = text.match(rangeRe);
  if (rangeMatch) {
    // parse start
    let sh = parseInt(rangeMatch[1], 10);
    let sm = parseInt(rangeMatch[2] || '0', 10);
    const sampm = (rangeMatch[3] || '').toLowerCase();
    if (sampm === 'pm' && sh < 12) sh += 12;
    if (sampm === 'am' && sh === 12) sh = 0;

    // parse end
    let eh = parseInt(rangeMatch[4], 10);
    let em = parseInt(rangeMatch[5] || '0', 10);
    const eampm = (rangeMatch[6] || '').toLowerCase();
    if (eampm === 'pm' && eh < 12) eh += 12;
    if (eampm === 'am' && eh === 12) eh = 0;

    const s = new Date(baseDate);
    s.setHours(sh, sm, 0, 0);
    const e = new Date(baseDate);
    e.setHours(eh, em, 0, 0);

    if (!isNaN(s.getTime()) && !isNaN(e.getTime())) {
      startISO = s.toISOString();
      endISO = e.toISOString();
    }
  } else {
    // check for single time (requires am/pm explicitly)
    const timeMatch = text.match(singleTimeRe);
    if (timeMatch) {
      let h = parseInt(timeMatch[1], 10);
      let m = parseInt(timeMatch[2] || '0', 10);
      const ampm = (timeMatch[3] || '').toLowerCase();
      if (ampm === 'pm' && h < 12) h += 12;
      if (ampm === 'am' && h === 12) h = 0;

      const s = new Date(baseDate);
      s.setHours(h, m, 0, 0);
      startISO = s.toISOString();
      endISO = new Date(s.getTime() + 30 * 60 * 1000).toISOString(); // default 30m
    }
  }

  // --- Title extraction: remove known date/time fragments to get a human title ---
  let title = '';
  // remove explicit date phrases and times to get title candidate
  title = text
    .replace(rangeRe, '')
    .replace(singleTimeRe, '')
    .replace(/(today|tomorrow)/i, '')
    .replace(dateMatch ? dateMatch[0] : '', '')
    .replace(/\b(set|schedule|add|create|book|remind me of)\b/i, '')
    .trim();

  if (!title) {
    // if no title detected but we do have schedule keywords, use a fallback
    if (SCHEDULE_KEYWORDS.test(text)) title = 'New event';
    else {
      // if the text lacks scheduling keywords and there's no time, it's likely nonsense
      if (!startISO && !MONTH_WORD.test(text) && !SCHEDULE_KEYWORDS.test(text)) {
        return { error: "I couldn't detect a date or time. Try: 'Meeting tomorrow at 2pm'." };
      }
      title = 'New event';
    }
  }

  // debug log for dev
  console.log('🧩 parser =>', { text, title, startISO, endISO });

  return { title, startISO, endISO };
}

// parserService.js
/**
 * Smarter natural language parser for events
 * Handles:
 * - "Sept 5, 2025 at 10am"
 * - "September 5 2025 14:00"
 * - "10am - 11:30am"
 * - "2pm to 3pm tomorrow"
 * - "meeting today at 4pm"
 */
export function parseNaturalLanguageToEvent(input) {
  const text = String(input || '').trim();
  if (!text) return { error: 'Empty message' };

  // --- Date detection ---
  let date = new Date();

  // Look for explicit month/day/year
  const dateMatch = text.match(/(\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*)\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?/i);
  if (dateMatch) {
    const month = new Date(`${dateMatch[1]} 1, 2000`).getMonth(); // normalize month name
    const day = parseInt(dateMatch[2], 10);
    const year = dateMatch[3] ? parseInt(dateMatch[3], 10) : new Date().getFullYear();
    date = new Date(year, month, day);
  } else if (/tomorrow/i.test(text)) {
    date.setDate(date.getDate() + 1);
  } else if (/today/i.test(text)) {
    // keep today
  }

  // --- Time detection ---
  const rangeMatch = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*[-to]+\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  let startDate = new Date(date), endDate;

  if (rangeMatch) {
    // Start time
    let sh = parseInt(rangeMatch[1], 10);
    let sm = parseInt(rangeMatch[2] || '0', 10);
    const sampm = (rangeMatch[3] || '').toLowerCase();
    if (sampm === 'pm' && sh < 12) sh += 12;
    if (sampm === 'am' && sh === 12) sh = 0;
    startDate.setHours(sh, sm, 0, 0);

    // End time
    let eh = parseInt(rangeMatch[4], 10);
    let em = parseInt(rangeMatch[5] || '0', 10);
    const eampm = (rangeMatch[6] || '').toLowerCase();
    if (eampm === 'pm' && eh < 12) eh += 12;
    if (eampm === 'am' && eh === 12) eh = 0;
    endDate = new Date(date);
    endDate.setHours(eh, em, 0, 0);
  } else {
    // Single time
    const timeMatch = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    let h = 9, m = 0;
    if (timeMatch) {
      h = parseInt(timeMatch[1], 10);
      m = parseInt(timeMatch[2] || '0', 10);
      const ampm = (timeMatch[3] || '').toLowerCase();
      if (ampm === 'pm' && h < 12) h += 12;
      if (ampm === 'am' && h === 12) h = 0;
    }
    startDate.setHours(h, m, 0, 0);
    endDate = new Date(startDate.getTime() + 30 * 60 * 1000); // default 30min
  }

  // --- Title extraction ---
  let title = 'New Event';
  const titleMatch = text.match(/^(?:set|schedule|add|create)?\s*(?:a|an)?\s*(.*?)(?:\s+on|\s+at|\s+tomorrow|\s+today|$)/i);
  if (titleMatch && titleMatch[1]) {
    title = titleMatch[1].trim();
  }

// --- Debug log for dev/testing ---
  console.log("Parsed event:", { title, start: startDate, end: endDate });

  return { 
    title, 
    startISO: startDate.toISOString(), 
    endISO: endDate.toISOString() 
  };
}

// parserService.js
export function parseNaturalLanguageToEvent(input) {
  const text = String(input || '').trim();
  if (!text) return { error: 'Empty message' };

  const timeMatch = text.match(/(\b\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  const isTomorrow = /tomorrow/i.test(text);

  let date = new Date();
  if (isTomorrow) date.setDate(date.getDate() + 1);

  let hours = 9, minutes = 0;
  if (timeMatch) {
    hours = Number(timeMatch[1]);
    minutes = Number(timeMatch[2] || 0);
    const ampm = (timeMatch[3] || '').toLowerCase();
    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;
  }

  date.setHours(hours, minutes, 0, 0);
  const startISO = date.toISOString();
  const endISO = new Date(date.getTime() + 30 * 60 * 1000).toISOString();

  let title = 'New event';
  const titleMatch = text.match(/(?:about|titled|called)\s+([\w\s]+)/i);
  if (titleMatch && titleMatch[1]) title = titleMatch[1].trim();

  return { title, startISO, endISO };
}

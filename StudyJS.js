'use strict';

const chatLog = document.getElementById('chatLog');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');

// Add message to UI
function addMessage(text, sender='user') {
  const msg = document.createElement('div');
  msg.className = `chat-message ${sender}`;
  msg.textContent = text;
  chatLog.appendChild(msg);
  chatLog.scrollTop = chatLog.scrollHeight;
}

// Very basic parser (looks for date + time ranges in text)
function parseEvent(text) {
  const result = {
    title: text, // default fallback
    start: null,
    end: null
  };

  // Example: "Sept 5, 2025, 10am - 10:30am"
  const dateMatch = text.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\\s+\\d{1,2},\\s*\\d{4}/i);
  const timeMatch = text.match(/(\\d{1,2}(?::\\d{2})?\\s*(am|pm))/gi);

  if (dateMatch) {
    const date = dateMatch[0];
    let startTime = timeMatch?.[0] || '9:00 am';
    let endTime = timeMatch?.[1] || null;

    const start = new Date(`${date} ${startTime}`);
    const end = endTime ? new Date(`${date} ${endTime}`) : null;

    result.start = start.toISOString();
    if (end) result.end = end.toISOString();

    // Event title = remove date/time from text
    result.title = text.replace(date, '').replace(startTime, '').replace(endTime || '', '').trim();
  }

  return result;
}

// Handle chat submit
chatForm.addEventListener('submit', e => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;

  // User message
  addMessage(text, 'user');
  chatInput.value = '';

  // Parse and respond
  const event = parseEvent(text);
  if (event.start) {
    addMessage(`✅ Saved: "${event.title}" on ${new Date(event.start).toLocaleString()} ${event.end ? '– ' + new Date(event.end).toLocaleTimeString([], { timeStyle: 'short' }) : ''}`, 'bot');
  } else {
    addMessage("❌ Sorry, I couldn't detect a valid date/time.", 'bot');
  }
});

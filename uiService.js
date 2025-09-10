// uiService.js
export function byId(id) { return document.getElementById(id); }

export function fmtDate(d) {
  const dt = new Date(d);
  if (!(dt instanceof Date) || Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

export function appendChat(role, content) {
  const log = byId('chatLog');
  const message = document.createElement('div');
  message.className = `message ${role.toLowerCase() === 'you' ? 'user' : 'assistant'}`;

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  bubble.textContent = content;
  message.appendChild(bubble);
  log.appendChild(message);

  log.scrollTop = log.scrollHeight;
}

export function setBusy(disabled) {
  byId('chatSend').disabled = disabled;
  byId('chatInput').disabled = disabled;
}

export function setTyping(visible) {
  const t = byId('typing');
  if (t) t.classList.toggle('hidden', !visible);
}

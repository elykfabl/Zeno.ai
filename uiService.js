// uiService.js
'use strict';

// Small UI helpers and unified chat append with error bubble support.

export function byId(id) { return document.getElementById(id); }

export function fmtDate(d) {
  const dt = new Date(d);
  if (!(dt instanceof Date) || Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * appendChat(role, content, isError)
 * role: 'You' or 'Assistant'
 * isError: when true, styles the bubble as an error (red-ish)
 */
export function appendChat(role, content, isError = false) {
  const log = byId('chatLog');
  if (!log) return;
  const message = document.createElement('div');
  message.className = `message ${role.toLowerCase() === 'you' ? 'user' : 'assistant'}`;

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  bubble.textContent = content;

  if (isError) {
    // gentle inline style so we don't require CSS edits
    bubble.style.background = '#fff1f2'; // soft red background
    bubble.style.color = '#9f1239';
    bubble.style.border = '1px solid #fecaca';
  }

  message.appendChild(bubble);
  log.appendChild(message);
  log.scrollTop = log.scrollHeight;
}

export function setBusy(disabled) {
  const send = byId('chatSend');
  const input = byId('chatInput');
  if (send) send.disabled = disabled;
  if (input) input.disabled = disabled;
}

export function setTyping(visible) {
  const t = byId('typing');
  if (!t) return;
  t.classList.toggle('hidden', !visible);
}

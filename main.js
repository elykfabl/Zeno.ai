// main.js
import { byId, setBusy, setTyping, appendChat, fmtDate } from './uiService.js';
import { handleChatTurn } from './convoService.js';
import { loadLocalEvents, saveLocalEvents } from './storageService.js';

const inputEl = byId('chatInput');
const sendBtn = byId('chatSend');

// auto-resize textarea
function autoResize(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
}
inputEl.addEventListener('input', () => autoResize(inputEl));
inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendBtn.click();
  }
});

// send button
sendBtn.addEventListener('click', async () => {
  const text = inputEl.value.trim();
  if (!text) return;

  appendChat('You', text);
  setBusy(true);
  setTyping(true);

  inputEl.value = '';
  autoResize(inputEl);

  try {
    await handleChatTurn(text);
  } finally {
    setBusy(false);
    setTyping(false);
  }
});

inputEl.focus();

// show upcoming events
byId('showEvents').addEventListener('click', async () => {
  const panel = byId('upcomingPanel');
  panel.classList.remove('hidden');
  await renderUpcomingList();
});

// close upcoming events
byId('closeUpcoming').addEventListener('click', () => {
  byId('upcomingPanel').classList.add('hidden');
});

// clear local events
byId('clearLocal').addEventListener('click', async () => {
  if (!confirm('Clear all local events?')) return;
  await saveLocalEvents([]);
  await renderUpcomingList();
});

// render events
async function renderUpcomingList() {
  const list = byId('upcomingList');
  list.innerHTML = '';
  const events = await loadLocalEvents();
  if (!events.length) {
    list.innerHTML = '<div class="event-item empty">No events scheduled yet.</div>';
    return;
  }
  const sorted = [...events].sort((a,b) => new Date(a.start) - new Date(b.start));
  for (const ev of sorted) {
    const item = document.createElement('div');
    item.className = 'event-item';
    item.innerHTML = `<div class="event-time">${fmtDate(ev.start)}</div>
                      <div class="event-title">${ev.title}</div>`;
    list.appendChild(item);
  }
}

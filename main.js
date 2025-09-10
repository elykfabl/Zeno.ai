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
  if (!text) {
    appendChat('Assistant', "⚠️ Please type something for me to schedule 🙂");
    return;
  }

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

// --- show upcoming events (unchanged) ---
byId('showEvents').addEventListener('click', async () => {
  const panel = byId('upcomingPanel');
  panel.classList.remove('hidden');
  panel.style.opacity = '0';
  panel.style.transform = 'translateX(100%)';
  await renderUpcomingList();
  requestAnimationFrame(() => {
    panel.style.transition = 'all 0.25s ease-out';
    panel.style.opacity = '1';
    panel.style.transform = 'translateX(0)';
  });
});

// --- close upcoming events (unchanged) ---
byId('closeUpcoming').addEventListener('click', () => {
  const panel = byId('upcomingPanel');
  panel.style.transition = 'all 0.25s ease-out';
  panel.style.opacity = '0';
  panel.style.transform = 'translateX(100%)';
  setTimeout(() => {
    panel.classList.add('hidden');
    panel.style.transition = '';
    panel.style.opacity = '';
    panel.style.transform = '';
  }, 250);
});

// --- clear local events (unchanged) ---
byId('clearLocal').addEventListener('click', async () => {
  if (!confirm('Clear all local events?')) return;
  await saveLocalEvents([]);
  await renderUpcomingList();
});

// --- Render upcoming list: show delete button and map back to original index ---
async function renderUpcomingList() {
  const list = byId('upcomingList');
  if (!list) return;
  list.innerHTML = '';

  const events = await loadLocalEvents();

  if (!events.length) {
    const empty = document.createElement('div');
    empty.className = 'event-item empty';
    empty.textContent = 'No events scheduled yet.';
    list.appendChild(empty);
    return;
  }

  // Build mapped array so each rendered item knows its original index in `events`
  const mapped = events.map((ev, originalIndex) => ({ ev, originalIndex }));

  // Sort by start time for display (but keep originalIndex for deletions)
  mapped.sort((a, b) => {
    const ta = a.ev.start ? new Date(a.ev.start).getTime() : Number.POSITIVE_INFINITY;
    const tb = b.ev.start ? new Date(b.ev.start).getTime() : Number.POSITIVE_INFINITY;
    return ta - tb;
  });

  // Create DOM nodes safely (no innerHTML for untrusted text)
  for (const { ev, originalIndex } of mapped) {
    const item = document.createElement('div');
    item.className = 'event-item';

    const timeDiv = document.createElement('div');
    timeDiv.className = 'event-time';
    timeDiv.textContent = ev.start ? fmtDate(ev.start) : '—';

    const titleDiv = document.createElement('div');
    titleDiv.className = 'event-title';
    titleDiv.textContent = ev.title || 'Untitled';

    const actions = document.createElement('div');
    actions.className = 'event-actions';

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn-icon';
    delBtn.dataset.action = 'delete-local';
    delBtn.dataset.index = String(originalIndex);
    delBtn.setAttribute('aria-label', 'Delete event');
    // simple SVG icon for delete (keeps markup small)
    delBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;

    actions.appendChild(delBtn);
    item.appendChild(timeDiv);
    item.appendChild(titleDiv);
    item.appendChild(actions);
    list.appendChild(item);
  }
}

// --- Delegated click handler for upcomingList (handles delete) ---
const upcomingListEl = byId('upcomingList');
if (upcomingListEl) {
  upcomingListEl.addEventListener('click', async (e) => {
    const btn = e.target && e.target.closest('button');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'delete-local') {
      const origIndex = Number(btn.dataset.index);
      if (Number.isNaN(origIndex)) return;
      const events = await loadLocalEvents();
      if (origIndex < 0 || origIndex >= events.length) return;
      // confirm delete
      if (!confirm('Delete this event?')) return;
      events.splice(origIndex, 1);
      await saveLocalEvents(events);
      await renderUpcomingList();
      appendChat('Assistant', 'Event deleted.');
    }
  });
}


// NED(Navigate, Edit, Delete).js
'use strict';

import { byId, appendChat, setBusy, setTyping, fmtDate } from './uiService.js';
import { handleChatTurn } from './convoService.js';
import { loadLocalEvents, saveLocalEvents } from './storageService.js';

// Elements
const inputEl = byId('chatInput');
const sendBtn = byId('chatSend');

// Auto-resize helper
function autoResize(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
}

// Send handler with empty-check + error bubble
sendBtn.addEventListener('click', async () => {
  const text = (inputEl.value || '').trim();
  if (!text) {
    appendChat('Assistant', '⚠️ Please type something for me to schedule 🙂', true);
    return;
  }

  appendChat('You', text);
  setBusy(true);
  setTyping(true);
  inputEl.value = '';
  autoResize(inputEl);

  try {
    await handleChatTurn(text);
  } catch (err) {
    console.error(err);
    appendChat('Assistant', '⚠️ Unexpected error during processing. Try again.', true);
  } finally {
    setBusy(false);
    setTyping(false);
  }
});

inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendBtn.click();
  }
});

// --- Upcoming panel logic (render + edit/delete) ---
// Reuse the render and handlers we already added, but add try/catch wrappers to show assistant bubbles on storage errors.

async function renderUpcomingList() {
  const list = byId('upcomingList');
  if (!list) return;
  list.innerHTML = '';
  try {
    const events = await loadLocalEvents();
    if (!events || events.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'event-item empty';
      empty.textContent = 'No events scheduled yet.';
      list.appendChild(empty);
      return;
    }
    const mapped = events.map((ev, idx) => ({ ev, idx }));
    mapped.sort((a, b) => {
      const ta = a.ev.start ? new Date(a.ev.start).getTime() : Infinity;
      const tb = b.ev.start ? new Date(b.ev.start).getTime() : Infinity;
      return ta - tb;
    });

    for (const { ev, idx } of mapped) {
      const item = document.createElement('div');
      item.className = 'event-item';

      const viewDiv = document.createElement('div');
      viewDiv.className = 'event-view';

      const timeDiv = document.createElement('div');
      timeDiv.className = 'event-time';
      timeDiv.textContent = ev.start ? fmtDate(ev.start) : '—';

      const titleDiv = document.createElement('div');
      titleDiv.className = 'event-title';
      titleDiv.textContent = ev.title || 'Untitled';

      const actions = document.createElement('div');
      actions.className = 'event-actions';

      const editBtn = document.createElement('button');
      editBtn.dataset.action = 'edit';
      editBtn.dataset.index = String(idx);
      editBtn.type = 'button';
      editBtn.innerText = '✏️';

      const delBtn = document.createElement('button');
      delBtn.dataset.action = 'delete';
      delBtn.dataset.index = String(idx);
      delBtn.type = 'button';
      delBtn.innerText = '🗑️';

      actions.appendChild(editBtn);
      actions.appendChild(delBtn);

      viewDiv.appendChild(timeDiv);
      viewDiv.appendChild(titleDiv);
      viewDiv.appendChild(actions);

      const editDiv = document.createElement('div');
      editDiv.className = 'event-edit hidden';

      const titleInput = document.createElement('input');
      titleInput.type = 'text';
      titleInput.value = ev.title || '';

      const startInput = document.createElement('input');
      startInput.type = 'datetime-local';
      startInput.value = ev.start ? new Date(ev.start).toISOString().slice(0,16) : '';

      const endInput = document.createElement('input');
      endInput.type = 'datetime-local';
      endInput.value = ev.end ? new Date(ev.end).toISOString().slice(0,16) : '';

      const saveBtn = document.createElement('button');
      saveBtn.textContent = '💾 Save';
      saveBtn.dataset.action = 'save';
      saveBtn.dataset.index = String(idx);

      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = '❌ Cancel';
      cancelBtn.dataset.action = 'cancel';
      cancelBtn.dataset.index = String(idx);

      editDiv.appendChild(titleInput);
      editDiv.appendChild(startInput);
      editDiv.appendChild(endInput);
      editDiv.appendChild(saveBtn);
      editDiv.appendChild(cancelBtn);

      item.appendChild(viewDiv);
      item.appendChild(editDiv);
      list.appendChild(item);
    }
  } catch (err) {
    console.error(err);
    appendChat('Assistant', '⚠️ Could not load upcoming events (storage error).', true);
  }
}

// Delegated click handler (edit/delete/save/cancel)
const upcomingListEl = byId('upcomingList');
if (upcomingListEl) {
  upcomingListEl.addEventListener('click', async (e) => {
    const btn = e.target && e.target.closest('button');
    if (!btn) return;
    const action = btn.dataset.action;
    const idx = Number(btn.dataset.index);
    if (!Number.isInteger(idx)) return;

    try {
      const events = await loadLocalEvents();

      if (action === 'delete') {
        if (!confirm('Delete this event?')) return;
        events.splice(idx, 1);
        await saveLocalEvents(events);
        await renderUpcomingList();
        appendChat('Assistant', 'Event deleted.');
        return;
      }

      const item = btn.closest('.event-item');
      if (action === 'edit') {
        item.querySelector('.event-view').classList.add('hidden');
        item.querySelector('.event-edit').classList.remove('hidden');
        item.querySelector('.event-edit').classList.add('show');
        return;
      }

      if (action === 'cancel') {
        item.querySelector('.event-edit').classList.remove('show');
        item.querySelector('.event-edit').classList.add('hidden');
        item.querySelector('.event-view').classList.remove('hidden');
        return;
      }

      if (action === 'save') {
        // validate and persist
        const title = item.querySelector('input[type="text"]').value.trim();
        const startVal = item.querySelectorAll('input[type="datetime-local"]')[0].value;
        const endVal = item.querySelectorAll('input[type="datetime-local"]')[1].value;

        if (!title) {
          appendChat('Assistant', 'Title is required to save changes.', true);
          return;
        }
        if (!startVal) {
          appendChat('Assistant', 'Start time is required.', true);
          return;
        }
        // update
        events[idx].title = title;
        try {
          events[idx].start = new Date(startVal).toISOString();
          events[idx].end = endVal ? new Date(endVal).toISOString() : events[idx].start;
        } catch (err) {
          appendChat('Assistant', 'Invalid date/time format.', true);
          return;
        }

        await saveLocalEvents(events);
        await renderUpcomingList();
        appendChat('Assistant', 'Event updated.');
        return;
      }
    } catch (err) {
      console.error(err);
      appendChat('Assistant', '⚠️ Storage error while performing the action.', true);
    }
  });
}

// UI toggles for upcoming panel (open/close)
const showEventsBtn = byId('showEvents');
if (showEventsBtn) {
  showEventsBtn.addEventListener('click', async () => {
    const panel = byId('upcomingPanel');
    if (!panel) return;
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
}

const closeUpcoming = byId('closeUpcoming');
if (closeUpcoming) {
  closeUpcoming.addEventListener('click', () => {
    const panel = byId('upcomingPanel');
    if (!panel) return;
    panel.style.transition = 'all 0.25s ease-out';
    panel.style.opacity = '0';
    panel.style.transform = 'translateX(100%)';
    setTimeout(() => panel.classList.add('hidden'), 250);
  });
}

const clearLocal = byId('clearLocal');
if (clearLocal) {
  clearLocal.addEventListener('click', async () => {
    if (!confirm('Clear all local events?')) return;
    try {
      await saveLocalEvents([]);
      await renderUpcomingList();
      appendChat('Assistant', 'All local events cleared.');
    } catch (err) {
      console.error(err);
      appendChat('Assistant', '⚠️ Could not clear events (storage error).', true);
    }
  });
}

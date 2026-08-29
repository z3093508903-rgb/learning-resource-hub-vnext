'use strict';

const ENDPOINT = 'http://127.0.0.1:27124/v1/state';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'go-study-bilibili-state') return;
  const payload = {
    ...(message.payload || {}),
    activeTab: Boolean(sender?.tab?.active),
    tabId: Number.isFinite(Number(sender?.tab?.id)) ? Number(sender.tab.id) : null,
    windowId: Number.isFinite(Number(sender?.tab?.windowId)) ? Number(sender.tab.windowId) : null
  };
  fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then((response) => sendResponse({ ok: response.ok, status: response.status }))
    .catch((error) => sendResponse({ ok: false, error: String(error || '') }));
  return true;
});

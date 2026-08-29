'use strict';

const ENDPOINT = 'http://127.0.0.1:27124/v1/state';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== 'go-study-bilibili-state') return;
  fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message.payload || {})
  })
    .then((response) => sendResponse({ ok: response.ok, status: response.status }))
    .catch((error) => sendResponse({ ok: false, error: String(error || '') }));
  return true;
});

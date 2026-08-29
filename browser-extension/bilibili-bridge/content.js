'use strict';

(() => {
  let lastSignature = '';
  let lastSentAt = 0;

  function videoElement() {
    return document.querySelector('video');
  }

  function cleanTitle() {
    const heading = document.querySelector('h1.video-title, h1[title], .video-title');
    return String(heading?.getAttribute?.('title') || heading?.textContent || document.title || '')
      .replace(/[_\s-]*哔哩哔哩(?:\s*bilibili)?\s*$/i, '')
      .trim()
      .slice(0, 300);
  }

  function statePayload() {
    const video = videoElement();
    if (!video || !Number.isFinite(Number(video.currentTime))) return null;
    return {
      url: location.href,
      title: cleanTitle(),
      currentTime: Number(video.currentTime),
      duration: Number.isFinite(Number(video.duration)) ? Number(video.duration) : null,
      paused: Boolean(video.paused),
      visible: document.visibilityState === 'visible',
      focused: document.hasFocus()
    };
  }

  function report(force = false) {
    const payload = statePayload();
    if (!payload) return;
    const now = Date.now();
    const signature = [
      payload.url,
      Math.round(payload.currentTime * 4) / 4,
      payload.paused,
      payload.visible,
      payload.focused
    ].join('|');
    if (!force && signature === lastSignature && now - lastSentAt < 900) return;
    lastSignature = signature;
    lastSentAt = now;
    try {
      chrome.runtime.sendMessage({ type: 'go-study-bilibili-state', payload }, () => {
        void chrome.runtime.lastError;
      });
    } catch {}
  }

  for (const name of ['focus', 'blur', 'pageshow']) {
    window.addEventListener(name, () => report(true), true);
  }
  document.addEventListener('visibilitychange', () => report(true), true);
  document.addEventListener('play', () => report(true), true);
  document.addEventListener('pause', () => report(true), true);
  document.addEventListener('seeking', () => report(true), true);
  document.addEventListener('seeked', () => report(true), true);
  document.addEventListener('timeupdate', () => report(false), true);

  setInterval(() => report(false), 500);
  report(true);
})();

'use strict';

const CAPTURE_ACTIONS = Object.freeze({
  time: Object.freeze({ id: 'time', label: '仅时间戳', time: true, note: false, image: false }),
  note: Object.freeze({ id: 'note', label: '纯笔记', time: false, note: true, image: false }),
  image: Object.freeze({ id: 'image', label: '仅截图', time: false, note: false, image: true }),
  timeNote: Object.freeze({ id: 'timeNote', label: '评论 + 时间戳', time: true, note: true, image: false }),
  timeImage: Object.freeze({ id: 'timeImage', label: '截图 + 时间戳', time: true, note: false, image: true }),
  imageNote: Object.freeze({ id: 'imageNote', label: '截图 + 评论', time: false, note: true, image: true }),
  all: Object.freeze({ id: 'all', label: '截图 + 评论 + 时间戳', time: true, note: true, image: true })
});

const HUD_SLOT_ORDER = Object.freeze(['left', 'up', 'right', 'down', 'center']);
const HUD_SLOT_LABELS = Object.freeze({
  left: '← 左',
  up: '↑ 上',
  right: '→ 右',
  down: '↓ 下',
  center: 'Enter 中心'
});

const DEFAULT_HUD_SLOTS = Object.freeze({
  left: 'time',
  up: 'timeNote',
  right: 'timeImage',
  down: 'note',
  center: 'all'
});

function normalizeCaptureActionId(value, fallback = 'time') {
  const id = String(value || '').trim();
  return Object.prototype.hasOwnProperty.call(CAPTURE_ACTIONS, id) ? id : fallback;
}

function normalizeHudSlots(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const result = {};
  for (const slot of HUD_SLOT_ORDER) {
    result[slot] = normalizeCaptureActionId(source[slot], DEFAULT_HUD_SLOTS[slot]);
  }
  return result;
}

function actionForSlot(slots, slot) {
  const normalized = normalizeHudSlots(slots);
  return CAPTURE_ACTIONS[normalized[slot] || DEFAULT_HUD_SLOTS[slot]];
}

module.exports = {
  CAPTURE_ACTIONS,
  DEFAULT_HUD_SLOTS,
  HUD_SLOT_LABELS,
  HUD_SLOT_ORDER,
  actionForSlot,
  normalizeCaptureActionId,
  normalizeHudSlots
};

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CAPTURE_ACTIONS,
  DEFAULT_HUD_SLOTS,
  actionForSlot,
  normalizeHudSlots
} = require('../src/capture-actions.cjs');

test('capture actions cover every non-empty combination of time note and image', () => {
  const combos = new Set(Object.values(CAPTURE_ACTIONS).map((action) =>
    [action.time, action.note, action.image].map((value) => value ? '1' : '0').join('')
  ));
  assert.deepEqual([...combos].sort(), ['001','010','011','100','101','110','111']);
});

test('HUD defaults use five memorable recipes and invalid slots fall back safely', () => {
  assert.deepEqual(DEFAULT_HUD_SLOTS, {
    left: 'time',
    up: 'timeNote',
    right: 'timeImage',
    down: 'note',
    center: 'all'
  });
  const slots = normalizeHudSlots({ left: 'imageNote', center: 'unknown' });
  assert.equal(slots.left, 'imageNote');
  assert.equal(slots.center, 'all');
  assert.equal(actionForSlot(slots, 'left').image, true);
  assert.equal(actionForSlot(slots, 'left').note, true);
  assert.equal(actionForSlot(slots, 'left').time, false);
});

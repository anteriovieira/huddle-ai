import assert from 'node:assert/strict';
import test from 'node:test';

import { chatAfterClose, chatsForHuddle, fallbackTitle } from '../src/sidepanel/lib/chats.js';

const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

test('closing the active chat focuses the one before it, or the next one when it was first', () => {
  assert.equal(chatAfterClose(list, 'b', 'b'), 'a');
  assert.equal(chatAfterClose(list, 'c', 'c'), 'b');
  assert.equal(chatAfterClose(list, 'a', 'a'), 'b');
});

test('closing another chat keeps the active one; closing the last chat leaves none', () => {
  assert.equal(chatAfterClose(list, 'a', 'c'), 'c');
  assert.equal(chatAfterClose([{ id: 'a' }], 'a', 'a'), null);
});

test('chatsForHuddle restores a stored set only when it belongs to the shown session', () => {
  const stored = { huddleId: 'h1', list: [{ id: 'a' }] };
  // Same session: restored as-is.
  assert.equal(chatsForHuddle(stored, 'h1'), stored);
  // Another session: ignored, so one session never shows another's chats.
  assert.equal(chatsForHuddle(stored, 'h2'), null);
  // Home screen (no huddle) matches a home-scoped set, not a real session's.
  assert.deepEqual(chatsForHuddle({ huddleId: null, list: [] }, null), { huddleId: null, list: [] });
  assert.equal(chatsForHuddle(stored, null), null);
  // Missing or malformed buckets degrade to null.
  assert.equal(chatsForHuddle(null, 'h1'), null);
  assert.equal(chatsForHuddle({ huddleId: 'h1' }, 'h1'), null);
});

test('fallbackTitle keeps the first words, stripping quotes and trailing punctuation', () => {
  assert.equal(fallbackTitle('como fomos nessa reunião?'), 'como fomos nessa reunião');
  assert.equal(fallbackTitle('  "O que   ficou pendente."  '), 'O que ficou pendente');
  assert.equal(
    fallbackTitle('quais foram as decisões os riscos e os próximos passos do time'),
    'quais foram as decisões os riscos',
  );
});

test('fallbackTitle caps the length at 40 chars', () => {
  assert.ok(fallbackTitle('palavra palavra palavra palavra palavra palavra').length <= 40);
});

test('fallbackTitle returns null for empty or whitespace input', () => {
  assert.equal(fallbackTitle(''), null);
  assert.equal(fallbackTitle('   '), null);
  assert.equal(fallbackTitle(null), null);
  assert.equal(fallbackTitle(undefined), null);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { chatAfterClose } from '../src/sidepanel/lib/chats.js';

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

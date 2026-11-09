import assert from 'node:assert/strict';
import test from 'node:test';

import { formatThread, searchThread, threadStatus } from '../src/sidepanel/lib/thread.js';

const MESSAGES = [
  { id: '1', author: 'Onezino Moreira', time: 'Tuesday at 08:32', text: 'do we need to store any history of email change' },
  { id: '2', author: 'Onezino Moreira', time: 'Tuesday at 08:32', text: '@Leandro Ximenes the mail collection also save the user id in broadcast?' },
  { id: '3', author: 'Paul', time: 'Tuesday at 08:32', text: "If we could, it's ideal to replace and log the old email." },
  { id: '4', author: 'Leandro Ximenes', time: 'Tuesday at 10:14', text: 'Yes, the user id is saved for broadcast recipients.' },
];

test('searchThread returns the messages that match the query, best match first, in thread order on ties', () => {
  const found = searchThread(MESSAGES, 'user id');
  assert.deepEqual(found.map((m) => m.id), ['2', '4']);
});

test('searchThread ignores case and accents and matches by author too', () => {
  assert.deepEqual(searchThread(MESSAGES, 'PAUL').map((m) => m.id), ['3']);
  assert.deepEqual(
    searchThread([{ id: 'a', author: 'Ana', time: '', text: 'Histórico de e-mail' }], 'historico').map((m) => m.id),
    ['a'],
  );
});

test('searchThread with an empty query returns the latest messages, capped by limit', () => {
  assert.deepEqual(searchThread(MESSAGES, '', { limit: 2 }).map((m) => m.id), ['3', '4']);
  assert.deepEqual(searchThread(MESSAGES, 'email', { limit: 1 }).map((m) => m.id), ['1']);
});

test('formatThread renders one line per message with author and Slack time label', () => {
  assert.equal(
    formatThread(MESSAGES.slice(2)),
    "[Paul · Tuesday at 08:32] If we could, it's ideal to replace and log the old email.\n" +
      '[Leandro Ximenes · Tuesday at 10:14] Yes, the user id is saved for broadcast recipients.',
  );
  assert.equal(formatThread([{ id: 'x', author: 'Ana', time: '', text: 'oi' }]), '[Ana] oi');
});

test('threadStatus tells what the side panel can say about the thread', () => {
  const thread = { messages: MESSAGES, visible: true, readAt: 1 };
  assert.equal(threadStatus(thread, { enabled: true }), 'live');
  assert.equal(threadStatus({ ...thread, visible: false }, { enabled: true }), 'stale');
  assert.equal(threadStatus({ ...thread, messages: [] }, { enabled: true }), 'empty');
  assert.equal(threadStatus({ messages: [], visible: false }, { enabled: true }), 'stale');
  assert.equal(threadStatus(null, { enabled: true }), 'none');
  assert.equal(threadStatus(thread, { enabled: false }), 'off');
  assert.equal(threadStatus(null, { enabled: false }), 'none');
});

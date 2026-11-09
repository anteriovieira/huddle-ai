import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { JSDOM } from 'jsdom';

// scanner.js runs in Slack's page world as a classic script; load it the same way into a jsdom window.
function load(html) {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { runScripts: 'outside-only' });
  dom.window.eval(readFileSync('extension/scanner.js', 'utf8'));
  return dom.window;
}

// One Slack message row: sender + timestamp only on the first message of a group.
const row = (ts, text, sender) => `
  <div role="listitem" class="c-virtual_list__item" data-item-key="${ts}">
    <div data-qa="message_container" class="c-message_kit__background">
      ${sender ? `<button data-qa="message_sender_name">${sender}</button>` : ''}
      <a class="c-timestamp" data-ts="${ts}" aria-label="Tuesday at 08:32"><span>8:32 AM</span></a>
      <div class="c-message_kit__blocks"><div data-qa="message-text">${text}</div></div>
      <div class="c-reaction_bar"><button>👍 1</button></div>
    </div>
  </div>`;

const THREAD = `
  <div role="tablist">
    <button role="tab" aria-selected="true" aria-controls="thread-panel">Thread</button>
    <button role="tab" aria-selected="false" aria-controls="cc-panel">Captions</button>
  </div>
  <div id="thread-panel" role="tabpanel">
    ${row('1.1', 'here the open question:', 'Onezino Moreira')}
    ${row('1.2', 'the mail collection also save the user id?', '')}
    ${row('1.3', 'Yes, the user id is saved for broadcast recipients.', 'Leandro Ximenes')}
  </div>`;

test('readThread reads the open Thread tab, carrying the sender into grouped messages', () => {
  const win = load(THREAD);
  const thread = win.__huddleAiReadThread(win.document.body);
  assert.equal(thread.visible, true);
  assert.deepEqual(JSON.parse(JSON.stringify(thread.messages)), [
    { id: '1.1', author: 'Onezino Moreira', time: 'Tuesday at 08:32', text: 'here the open question:' },
    { id: '1.2', author: 'Onezino Moreira', time: 'Tuesday at 08:32', text: 'the mail collection also save the user id?' },
    { id: '1.3', author: 'Leandro Ximenes', time: 'Tuesday at 08:32', text: 'Yes, the user id is saved for broadcast recipients.' },
  ]);
});

test('readThread reports the thread as not visible while another tab is selected', () => {
  const win = load(THREAD.replace('aria-selected="true" aria-controls="thread-panel"', 'aria-selected="false" aria-controls="thread-panel"'));
  assert.deepEqual(JSON.parse(JSON.stringify(win.__huddleAiReadThread(win.document.body))), { visible: false, messages: [] });
});

test('readThread returns null when the huddle has no Thread tab', () => {
  const win = load('<div role="tablist"><button role="tab" aria-selected="true">Captions</button></div>');
  assert.equal(win.__huddleAiReadThread(win.document.body), null);
});

// Slack's huddle window: the Thread tab has an id but no aria-controls; its panel is labelled "Thread".
// Huddle system messages ("You joined the huddle") have no sender and must not inherit the last one.
test('readThread finds the panel by its label and skips huddle system messages', () => {
  const win = load(`
    <div role="tablist">
      <button role="tab" id="threads" aria-selected="true">Thread</button>
      <button role="tab" id="captions" aria-selected="false">Captions</button>
    </div>
    <div role="tabpanel" aria-label="Thread">
      ${row('1793022864.904909', 'Good morning, Onezino.', 'Paul').replace('Tuesday at 08:32', 'Oct 26th at 10:54:24. Open in channel')}
      <div role="listitem" data-item-key="1794234064.349319">
        <div data-qa="message_container" class="c-message_kit__background c-message_kit__background--huddle">
          <span data-qa="huddle_message_user_name">You joined the huddle</span>
          <a class="c-timestamp" data-ts="1794234064.349319" aria-label="Today at 11:21:04"></a>
          <div class="c-message_kit__blocks">Enjoy the tranquility, or invite someone.</div>
        </div>
      </div>
    </div>`);
  const thread = win.__huddleAiReadThread(win.document.body);
  assert.equal(thread.visible, true);
  assert.deepEqual([...thread.messages].map((m) => `${m.author} (${m.time}): ${m.text}`), ['Paul (Oct 26th at 10:54:24): Good morning, Onezino.']);
});

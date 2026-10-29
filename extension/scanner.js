// Reads a Slack huddle's live captions from a window's DOM.
//
// Loaded in the page's own JS world (see page-hook.js), where it can reach the
// about:blank huddle popup that Slack opens and renders into from app.slack.com.
(() => {
  if (globalThis.__huddleAiCreateScanner) return;

  const HUDDLE_ROOT_SELECTOR = '.p-huddle_window';
  const TITLE_SELECTOR = '[data-qa="huddle_window_titlebar_title"]';
  const CAPTIONS_TAB_TEXT = /caption|legenda|subt[ií]tulo/i;
  const CAPTIONS_FALLBACK_SELECTOR = '[data-qa*="caption" i], [class*="caption" i]';
  // The closed-caption overlay Slack draws over the video tiles (bottom-left),
  // read as an alternative source. Stable class/data-qa names, one wrapper per event.
  const OVERLAY_ROOT_SELECTOR = '.p-huddle_closed_captions';
  const OVERLAY_ROW_SELECTOR = '.p-huddle_closed_caption_event__wrapper';
  const OVERLAY_NAME_SELECTOR = '.p-huddle_closed_caption_event__member_name';
  const OVERLAY_TEXT_SELECTOR = '.p-huddle_closed_caption_event__transcription, [data-qa="huddle_closed_caption_event"]';
  const THREAD_TAB_TEXT = /thread|conversa|hilo/i;
  const CAPTIONS_LANGUAGE = /(?:generated in|geradas em|generan en|generadas en)\s+([^.]+?)\./i;
  const CAPTIONS_NOTE = /captions are being generated|legendas (?:estão sendo|são) geradas|subt[ií]tulos se est[aá]n generando/i;
  const MAX_AVATAR_SIZE = 80; // caption avatars are ~36px; the video tile is much larger
  const COMPOSER_SELECTOR = '[contenteditable="true"][role="textbox"], .ql-editor[contenteditable="true"]';
  const TIME_ONLY = /^\d{1,2}:\d{2}(:\d{2})?(\s?[AP]M)?$/i;
  const SCAN_DEBOUNCE_MS = 300;
  const SCAN_INTERVAL_MS = 2000;
  const RECENT_LIMIT = 50;

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Which caption source the user picked in the side panel. Set from content.js via
  // page-hook.js; 'auto' (panel when its tab is open, else the overlay) until config arrives.
  const captionSource = () => globalThis.__huddleAiConfig?.captionSource ?? 'auto';

  function isAvatar(img) {
    if (img.matches('[data-stringify-emoji], [class*="emoji" i]') || img.closest('[class*="emoji" i]')) return false;
    const { width, height } = img.getBoundingClientRect();
    return width <= MAX_AVATAR_SIZE && height <= MAX_AVATAR_SIZE;
  }

  // Deepest element whose own text is the "Captions are being generated in …" note.
  function findCaptionsNote(root) {
    const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (CAPTIONS_NOTE.test(node.data)) return node.parentElement;
    }
    return null;
  }

  // Smallest ancestor of the captions note that holds clearly more text than the note:
  // the captions panel once someone has spoken.
  function findNoteRegion(scope, note) {
    const noteLength = note.textContent.length;
    let el = note;
    for (let i = 0; i < 8 && el.parentElement && el.parentElement !== scope; i++) {
      el = el.parentElement;
      if (el.textContent.length > noteLength + 40) return el;
    }
    return null;
  }

  // Caption rows without avatars: the element whose direct children most look like
  // "Name / what they said" blocks (two or more lines of text each).
  function findTextRows(region, note) {
    let best = [];
    for (const el of region.querySelectorAll('*')) {
      if (el.contains(note) || el.children.length <= best.length) continue;
      const rows = [...el.children].filter((child) => !child.contains(note) && lineCount(child) >= 2);
      if (rows.length > best.length) best = rows;
    }
    return best;
  }

  function lineCount(el) {
    return el.innerText.split('\n').filter((line) => line.trim()).length;
  }

  // Strips styles and icons so the captions markup fits in a diagnostic dump.
  function cleanHtml(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll('style, script, svg').forEach((node) => node.remove());
    return clone.outerHTML.slice(0, 60000);
  }

  function avatarsIn(el) {
    return [...el.querySelectorAll('img')].filter(isAvatar);
  }

  // Each caption row has exactly one avatar: climb from the avatar to the largest
  // ancestor that still holds only that avatar.
  function findRows(root) {
    const rows = new Set();
    for (const img of avatarsIn(root)) {
      let row = img;
      while (row.parentElement && row.parentElement !== root && avatarsIn(row.parentElement).length === 1) {
        row = row.parentElement;
      }
      rows.add(row);
    }
    return [...rows];
  }

  function parseRow(row) {
    const lines = row.innerText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !TIME_ONLY.test(line));
    const alt = avatarsIn(row)[0]?.alt?.trim();
    if (alt && lines[0] !== alt) lines.unshift(alt);
    if (lines.length < 2) return null;
    return { speaker: lines[0], text: lines.slice(1).join(' ') };
  }

  // One overlay event wrapper -> { speaker, text }. Wrappers without a member name
  // are system events ("Captions have been turned on.") and are skipped.
  function parseOverlayRow(row) {
    const speaker = row.querySelector(OVERLAY_NAME_SELECTOR)?.textContent.trim().replace(/[:：]\s*$/, '');
    const text = row.querySelector(OVERLAY_TEXT_SELECTOR)?.textContent.trim();
    if (!speaker || !text) return null;
    return { speaker, text };
  }

  // "Captions are being generated in English (US)." -> "English (US)"
  function findCaptionsLanguage(captionsRoot) {
    return captionsRoot.textContent.slice(0, 400).match(CAPTIONS_LANGUAGE)?.[1].trim() ?? null;
  }

  function findTab(scope, pattern) {
    return [...scope.querySelectorAll('[role="tab"]')].find((tab) => pattern.test(tab.textContent)) ?? null;
  }

  // `win` is the window to read; `emit` receives huddle:status and caption:upsert messages;
  // `log(level, message, data)` records what the scanner sees, for the panel's log view.
  globalThis.__huddleAiCreateScanner = function createScanner(win, emit, log = () => {}, label = 'janela') {
    const huddleId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const rowIds = new WeakMap();
    const sent = new Map(); // utterance id -> { speaker, text }
    const recent = []; // last utterances, to re-attach rows that React re-created
    let seq = 0;
    let lastStatus = '';
    let active = false;
    let stopped = false;
    let observedDoc = null;
    let lastDiagnosis = '';
    let parseFailures = 0;

    const doc = () => win.document;

    function findHuddleRoot() {
      return doc().querySelector(HUDDLE_ROOT_SELECTOR);
    }

    // The Thread/Captions panel sits beside .p-huddle_window, not inside it,
    // so captions are searched in the whole window.
    function panelScope() {
      return doc().body ?? doc().documentElement;
    }

    function findTitle() {
      const text = doc().querySelector(TITLE_SELECTOR)?.textContent.trim();
      return text || doc().title.replace(/\s+-\s+Slack$/, '') || null;
    }

    // In order: the Captions tab's panel; the nearest container around the
    // "Captions are being generated…" note that holds avatars; the caption-looking
    // element holding the most avatars. Returns the root and which strategy found it.
    const overlayRoot = (scope) => {
      const el = scope.querySelector(OVERLAY_ROOT_SELECTOR);
      return el ? { root: el, strategy: 'overlay de legendas', mode: 'overlay' } : null;
    };

    function findCaptionsRoot(scope) {
      const source = captionSource();
      // Overlay forced: read only it, so diagnostics/samples point at the overlay markup.
      if (source === 'overlay') return overlayRoot(scope) ?? { root: null, strategy: null, mode: 'overlay' };

      // Panel: the Captions tab's panel, or avatars/text near the "generated…" note.
      // Only present while the Captions tab is open.
      for (const tab of scope.querySelectorAll('[role="tab"]')) {
        if (tab.getAttribute('aria-selected') !== 'true') continue;
        if (!CAPTIONS_TAB_TEXT.test(tab.textContent)) continue;
        const panelId = tab.getAttribute('aria-controls');
        const panel = panelId && doc().getElementById(panelId);
        if (panel && avatarsIn(panel).length) return { root: panel, strategy: 'aba Captions', mode: 'panel' };
      }
      const note = findCaptionsNote(scope);
      for (let el = note?.parentElement; el && el !== scope; el = el.parentElement) {
        if (avatarsIn(el).length) return { root: el, strategy: 'nota "Captions are being generated"', mode: 'panel' };
      }
      const region = note && findNoteRegion(scope, note);
      if (region) return { root: region, strategy: 'texto perto da nota (sem avatares)', note, mode: 'panel' };
      let best = null;
      let bestCount = 0;
      for (const el of scope.querySelectorAll(CAPTIONS_FALLBACK_SELECTOR)) {
        const count = avatarsIn(el).length;
        if (count > bestCount) {
          best = el;
          bestCount = count;
        }
      }
      // Auto: no panel yet (Captions tab closed) — fall back to the overlay, which is
      // in the footer whenever captions are on, so capture starts without opening the tab.
      if (!best && source === 'auto') {
        const overlay = overlayRoot(scope);
        if (overlay) return overlay;
      }
      return { root: best, strategy: best ? 'classe "caption"' : null, mode: 'panel' };
    }

    // What the scanner sees inside the huddle window, logged whenever it changes.
    function rowsFor(found) {
      if (!found.root) return [];
      if (found.mode === 'overlay') return [...found.root.querySelectorAll(OVERLAY_ROW_SELECTOR)];
      return found.note ? findTextRows(found.root, found.note) : findRows(found.root);
    }

    function parseFor(found, row) {
      return found.mode === 'overlay' ? parseOverlayRow(row) : parseRow(row);
    }

    // The captions markup, when there is text near the note but no rows could be read
    // from it, so the selectors can be fixed from real HTML. Logged again (up to 3 times)
    // as the panel's text grows, so a sample taken before anyone spoke isn't the last one.
    let samples = 0;
    let lastSampleLength = 0;
    function logSample(found, rowCount) {
      if (samples >= 3 || !found.root || rowCount) return;
      const length = found.root.textContent.length;
      if (samples && length < lastSampleLength + 100) return;
      samples += 1;
      lastSampleLength = length;
      log('warn', 'Amostra do HTML do painel de legendas (nenhuma fala lida)', {
        texto: found.root.innerText.slice(-600),
        html: cleanHtml(found.root).slice(-6000),
      });
    }

    function diagnose(scope, found, rowCount) {
      const images = [...scope.querySelectorAll('img')];
      const diagnosis = {
        fonte: found.mode === 'overlay' ? 'overlay' : 'painel',
        estrategia: found.strategy ?? 'nenhuma',
        abas: [...scope.querySelectorAll('[role="tab"]')].map(
          (tab) => `${tab.textContent.trim()}${tab.getAttribute('aria-selected') === 'true' ? ' (selecionada)' : ''}`,
        ),
        notaDeLegendas: !!findCaptionsNote(scope),
        imagens: images.length,
        avatares: images.filter(isAvatar).length,
        falas: rowCount,
      };
      const key = JSON.stringify(diagnosis);
      if (key === lastDiagnosis) return;
      lastDiagnosis = key;
      log(found.root ? 'info' : 'warn', found.root ? 'Painel de legendas encontrado' : 'Painel de legendas não encontrado', diagnosis);
    }

    function idForRow(row, parsed, claimed) {
      const known = rowIds.get(row);
      if (known && sent.get(known)?.speaker === parsed.speaker) return known;
      const match = recent.find((u) => !claimed.has(u.id) && u.speaker === parsed.speaker && u.text === parsed.text);
      const id = match ? match.id : `${huddleId}-${++seq}`;
      rowIds.set(row, id);
      return id;
    }

    function remember(id, parsed) {
      const index = recent.findIndex((u) => u.id === id);
      if (index >= 0) recent.splice(index, 1);
      recent.push({ id, ...parsed });
      if (recent.length > RECENT_LIMIT) recent.shift();
    }

    function scan() {
      if (stopped) return;
      if (win.closed) {
        finish();
        return;
      }
      try {
        observe();
        const huddleRoot = findHuddleRoot();
        const found = huddleRoot ? findCaptionsRoot(panelScope()) : { root: null, strategy: null };
        const captionsRoot = found.root;
        const title = huddleRoot ? findTitle() : null;
        const language = captionsRoot ? findCaptionsLanguage(captionsRoot) : null;
        if (!!huddleRoot !== active) {
          log('info', huddleRoot ? `Janela do huddle encontrada (${label})` : `Janela do huddle sumiu (${label})`, { titulo: title });
        }
        active = !!huddleRoot;

        const status = JSON.stringify({ active, title, captions: !!captionsRoot, language });
        if (status !== lastStatus && (huddleRoot || lastStatus)) {
          lastStatus = status;
          emit({ type: 'huddle:status', huddleId, active, title, captions: !!captionsRoot, language });
        }
        const rows = rowsFor(found);
        if (huddleRoot) diagnose(panelScope(), found, rows.length);
        logSample(found, rows.length);
        if (!captionsRoot) return;

        const claimed = new Set();
        for (const row of rows) {
          const parsed = parseFor(found, row);
          if (!parsed) {
            // Overlay system rows ("Captions have been turned on.") have no name: expected, skip quietly.
            if (found.mode !== 'overlay' && ++parseFailures <= 5)
              log('warn', 'Linha de legenda sem nome ou texto', { texto: row.innerText.slice(0, 200) });
            continue;
          }
          const id = idForRow(row, parsed, claimed);
          claimed.add(id);
          const previous = sent.get(id);
          if (previous && previous.speaker === parsed.speaker && previous.text === parsed.text) continue;
          if (!previous) log('debug', `Nova fala de ${parsed.speaker}`, { texto: parsed.text.slice(0, 120) });
          sent.set(id, parsed);
          remember(id, parsed);
          emit({ type: 'caption:upsert', huddleId, utterance: { id, ...parsed } });
        }
      } catch (error) {
        // The window navigated to another origin (e.g. a link Slack opened): stop reading it.
        if (error?.name === 'SecurityError') {
          log('info', `Parei de ler uma janela de outra origem (${label})`);
          stop();
        } else {
          log('error', `Erro ao ler legendas (${label}): ${error?.message ?? error}`);
        }
      }
    }

    let timer = null;
    function scheduleScan() {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        scan();
      }, SCAN_DEBOUNCE_MS);
    }

    const observer = new MutationObserver(scheduleScan);
    // Slack can replace the popup's document; re-attach when it does.
    function observe() {
      const current = doc();
      if (current === observedDoc) return;
      if (observedDoc) log('info', `Documento da janela foi trocado (${label})`);
      observer.disconnect();
      observer.observe(current, { childList: true, subtree: true, characterData: true });
      observedDoc = current;
    }

    const interval = setInterval(scan, SCAN_INTERVAL_MS);

    function stop() {
      stopped = true;
      active = false;
      observer.disconnect();
      clearInterval(interval);
    }

    function finish() {
      if (!stopped) log('info', `Janela fechada (${label})`);
      if (lastStatus && !stopped) emit({ type: 'huddle:status', huddleId, active: false });
      stop();
    }

    if (win !== globalThis) win.addEventListener('pagehide', finish);

    // Leaves `text` as a draft in the huddle thread composer; the user reviews and sends it.
    async function draftInThread(text) {
      const huddleRoot = findHuddleRoot();
      if (!huddleRoot) return { ok: false, error: 'Janela do huddle não encontrada.' };
      const threadTab = findTab(panelScope(), THREAD_TAB_TEXT);
      if (threadTab && threadTab.getAttribute('aria-selected') !== 'true') {
        threadTab.click();
        await wait(600);
      }
      const composer = panelScope().querySelector(COMPOSER_SELECTOR);
      if (!composer) return { ok: false, error: 'Campo de mensagem do thread não encontrado.' };
      composer.focus();
      const before = composer.innerText;
      // Slack's editor handles pasted text, including line breaks.
      const data = new win.DataTransfer();
      data.setData('text/plain', text);
      composer.dispatchEvent(new win.ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
      await wait(100);
      if (composer.innerText === before) {
        const lines = text.split('\n');
        lines.forEach((line, index) => {
          if (line) doc().execCommand('insertText', false, line);
          if (index < lines.length - 1) doc().execCommand('insertLineBreak');
        });
      }
      return { ok: true };
    }

    function dump() {
      const huddleRoot = findHuddleRoot();
      const scope = panelScope();
      const found = huddleRoot ? findCaptionsRoot(scope) : { root: null };
      const captionsRoot = found.root;
      const rows = rowsFor(found);
      // Without a captions root, dump the area around the captions note instead.
      let region = captionsRoot ?? huddleRoot;
      const note = !captionsRoot && huddleRoot && findCaptionsNote(scope);
      if (note) {
        region = note;
        for (let i = 0; i < 6 && region.parentElement && region !== scope; i++) region = region.parentElement;
      }
      return {
        huddle: !!huddleRoot,
        title: huddleRoot ? findTitle() : null,
        captionsFound: !!captionsRoot,
        noteFound: !!note || !!captionsRoot,
        images: huddleRoot
          ? [...scope.querySelectorAll('img')].slice(0, 20).map((img) => {
              const { width, height } = img.getBoundingClientRect();
              return { className: img.className, alt: img.alt, width: Math.round(width), height: Math.round(height), avatar: isAvatar(img) };
            })
          : [],
        source: found.mode === 'overlay' ? 'overlay' : 'panel',
        rows: rows.length,
        parsed: rows.slice(-5).map((row) => parseFor(found, row)),
        html: region ? cleanHtml(region) : null,
      };
    }

    log('info', `Leitor iniciado (${label})`, { url: win.location.href, estado: doc().readyState });
    scan();

    return {
      isActive: () => active && !stopped,
      draftInThread,
      dump,
    };
  };
})();

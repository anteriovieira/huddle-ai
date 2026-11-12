// Runs in app.slack.com's own JS world, before Slack's scripts.
//
// Slack opens the huddle as an about:blank popup and renders into it from this window.
// Chrome doesn't run content scripts in that popup, so we keep the window.open() result
// and read the popup's DOM from here (same origin). Findings go to content.js through
// window.postMessage, which relays them to the extension.
(() => {
  if (window.top !== window || window.__huddleAiHook) return;
  window.__huddleAiHook = true;

  // Scanner config set by the side panel (caption source). Default until content.js replies.
  window.__huddleAiConfig = window.__huddleAiConfig ?? { captionSource: 'auto' };

  // Sempre a versão mais recente da global (uma re-injeção pode tê-la atualizado), não um valor
  // cacheado — assim popups criados depois de um update usam o código novo.
  const createScanner = (...args) => globalThis.__huddleAiCreateScanner(...args);
  const origin = window.location.origin;
  const popups = new Map(); // window -> scanner
  let popupCount = 0;

  const post = (message) => window.postMessage({ __huddleAi: 'page', message }, origin);
  const log = (level, message, data) => post({ type: 'log', source: 'slack', level, message, data });

  function track(win, url) {
    if (!win) {
      log('warn', 'window.open não devolveu janela (popup bloqueado?)', { url });
      return;
    }
    if (win === window || popups.has(win)) return;
    try {
      void win.document; // throws for cross-origin windows
    } catch {
      log('debug', 'Janela de outra origem ignorada', { url });
      return;
    }
    const label = `popup ${++popupCount}`;
    popups.set(win, createScanner(win, post, log, label));
  }

  const originalOpen = window.open;
  window.open = function open(...args) {
    const win = originalOpen.apply(this, args);
    log('debug', 'Slack abriu uma janela (window.open)', { url: String(args[0] ?? ''), nome: String(args[1] ?? '') });
    try {
      track(win, String(args[0] ?? ''));
    } catch (error) {
      log('error', `Falha ao acompanhar janela: ${error.message}`);
    }
    return win;
  };

  // A huddle shown inside the main window counts only while no popup has one.
  const popupActive = () => [...popups.values()].some((scanner) => scanner.isActive());
  const createMain = () =>
    createScanner(
      window,
      (message) => {
        if (!popupActive()) post(message);
      },
      log,
      'aba principal',
    );
  let mainVersion = globalThis.__huddleAiScannerVersion;
  let main = createMain();

  // Popups always get a fresh scanner on window.open (track() above), but the main-tab
  // scanner is created once here. Uma reinjeção mais nova bumpa __huddleAiScannerVersion
  // sem recriar `main`, então a aba principal ficava presa na versão antiga do scanner.
  // Recria `main` quando a versão mudar, para a aba principal também pegar o código novo.
  function getMain() {
    if (globalThis.__huddleAiScannerVersion !== mainVersion) {
      mainVersion = globalThis.__huddleAiScannerVersion;
      main = createMain();
    }
    return main;
  }

  function activeScanner() {
    const currentMain = getMain();
    return [...popups.values()].find((scanner) => scanner.isActive()) ?? (currentMain.isActive() ? currentMain : null);
  }

  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    if (event.data?.__huddleAi === 'config') {
      window.__huddleAiConfig = event.data.config ?? window.__huddleAiConfig;
      return;
    }
    if (event.data?.__huddleAi !== 'extension') return;
    const { id, request } = event.data;
    const scanner = activeScanner();
    let response;
    if (request.type === 'thread:draft') {
      response = scanner ? await scanner.draftInThread(request.text) : { ok: false, error: 'Janela do huddle não encontrada.' };
    } else if (request.type === 'thread:open') {
      response = scanner ? scanner.openThread() : { ok: false, error: 'Janela do huddle não encontrada.' };
    } else if (request.type === 'debug:dump') {
      response = { ...(scanner ?? getMain()).dump(), popupsTracked: popups.size };
    }
    window.postMessage({ __huddleAi: 'page-response', id, response }, origin);
  });

  // Ask content.js (which can read chrome.storage) for the current config.
  window.postMessage({ __huddleAi: 'config-request' }, origin);

  log('info', 'Extensão carregada na aba do Slack', { url: window.location.href });
})();

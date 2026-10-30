import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fileStamp, formatTranscript } from './lib/format.js';
import { logsAsText } from './lib/logs.js';
import { insightsAsText, minutesAsText, minutesMeta } from './lib/minutes.js';
import { parseTranscript } from './lib/transcript.js';
import * as drive from './drive.js';
import { analyze, askMeeting, generateMinutes, titleChat } from './insights.js';
import { hasKeyForModel } from './lib/models.js';
import { AtaContent, AtaEmpty, AtaFooter, AtaLoading } from './views/Ata.jsx';
import { AtasView, PastAtaView } from './views/Atas.jsx';
import { CaptionsPanel } from './views/Captions.jsx';
import { ChatDock } from './views/Chat.jsx';
import { Header, InfoBar, Tabs } from './views/Header.jsx';
import { IdleView } from './views/Idle.jsx';
import { ImportView } from './views/Import.jsx';
import { InsightsView } from './views/Insights.jsx';
import { RecentTicker } from './views/RecentTicker.jsx';
import { LogsView } from './views/Logs.jsx';
import { SettingsView } from './views/Settings.jsx';
import { toast } from 'sonner';
import { Icon } from './ui/Icon.jsx';
import { Tooltip } from './ui/Tooltip.jsx';

const DEFAULT_SETTINGS = {
  apiKeys: { anthropic: '', openai: '', google: '' },
  model: 'claude-haiku-5-5',
  // Provider usado quando `model` é um ID personalizado (fora da lista MODELS).
  modelProvider: '',
  language: 'Português',
  freq: 30,
  userName: '',
  detect: { actions: true, decisions: true, questions: true, suggestions: false, replies: false, alerts: true, references: true, acronyms: true },
  saveHistory: true,
  autoMinutes: true,
  captionSource: 'auto',
};
// Migração one-time: leva instalações já existentes para o modelo padrão atual
// (Haiku) uma única vez. Depois disso o usuário fica livre para escolher.
// Guardada fora de `settings` porque Settings.submit só persiste campos conhecidos.
const MODEL_MIGRATION = 1;
const MIN_UTTERANCES_FOR_MINUTES = 3;
const EMPTY_STATE = { huddle: null, utterances: [] };

// Abas exibidas quando cabem duas colunas: Captions deixa de ser aba (passa a
// dividir a coluna com Insights) e Copilot vive no ícone do cabeçalho.
const TWO_COL_TABS = [
  ['insights', 'Insights'],
  ['ata', 'Ata'],
];

// Larguras em que o painel passa a mostrar mais de uma coluna lado a lado.
const COLS_2_MIN = 640;
const COLS_3_MIN = 1000;

const chromeApi = typeof chrome !== 'undefined' ? chrome : undefined;
const version = () => chromeApi?.runtime?.getManifest?.().version ?? '0.0.0';

function logEvent(level, message, data) {
  chromeApi?.runtime?.sendMessage({ type: 'log', source: 'painel', level, message, data }).catch?.(() => {});
}

function download(filename, text, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

let chatSeq = 0;
// Creates a chat with a fresh unique id. Call this in event handlers (not inside a setState
// updater, which must stay pure) so StrictMode's double-invoked updaters can't duplicate it.
function newChat(index = 1) {
  return { id: `c${Date.now().toString(36)}${chatSeq++}`, title: `Chat ${index}`, messages: [] };
}

// A deterministic first chat for a huddle. Used inside the reset updater, so the same inputs
// always yield the same chat (pure) — safe under StrictMode's double invocation.
function seedChat(huddleId) {
  return { id: `c-${huddleId ?? 'none'}-1`, title: 'Chat 1', messages: [] };
}

export function App() {
  // --- Extension state (mirrors chrome.storage) ---
  const [extState, setExtState] = useState(EMPTY_STATE);
  const [insights, setInsights] = useState(null);
  const [minutes, setMinutes] = useState(null);
  const [history, setHistory] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [logs, setLogs] = useState([]);
  const [chats, setChats] = useState({ huddleId: null, list: [] });
  const [slackOpen, setSlackOpen] = useState(false);
  const [slackReloadTabId, setSlackReloadTabId] = useState(null);
  const [driveState, setDriveState] = useState({ connected: false, email: null });
  const [now, setNow] = useState(Date.now());

  // --- UI state ---
  const [tab, setTab] = useState('insights');
  const [cols, setCols] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [logsReturnToSettings, setLogsReturnToSettings] = useState(false);
  const [atasOpen, setAtasOpen] = useState(false);
  const [atasQuery, setAtasQuery] = useState('');
  const [atasTag, setAtasTag] = useState(null);
  const [viewingAta, setViewingAta] = useState(null);
  const [notice, setNotice] = useState(null);
  const [topicExpanded, setTopicExpanded] = useState(false);
  const [tickerHidden, setTickerHidden] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatExpanded, setChatExpanded] = useState(false);
  const [activeChatId, setActiveChatId] = useState(null);
  const [chatDrafts, setChatDrafts] = useState({});
  const [chatBusy, setChatBusy] = useState(() => new Set());
  const [chatStream, setChatStream] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importError, setImportError] = useState(null);
  const [driveBusy, setDriveBusy] = useState(null);
  const [driveConnecting, setDriveConnecting] = useState(false);
  const [done, setDone] = useState(() => new Set());
  const [acked, setAcked] = useState(() => new Set());

  // --- Live analysis / minutes control (refs) + their render-visible mirror ---
  const analysisCtl = useRef({ running: false, lastRunAt: 0, lastKey: '' });
  const minutesCtl = useRef({ running: false, startedAt: 0, failedFor: null });
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);
  const [minutesRunning, setMinutesRunning] = useState(false);
  const [minutesStartedAt, setMinutesStartedAt] = useState(0);
  const [minutesError, setMinutesError] = useState(null);
  const booted = useRef(false);

  const huddle = extState.huddle;
  const utterances = extState.utterances;

  const currentInsights = insights?.huddleId === huddle?.id ? insights : null;
  const currentMinutes = minutes?.huddleId === huddle?.id ? minutes : null;

  const allMinutes = useMemo(() => {
    const records = history.map((entry) => entry.minutes).filter(Boolean);
    if (currentMinutes && !records.some((r) => r.huddleId === currentMinutes.huddleId)) records.unshift(currentMinutes);
    return records.sort((a, b) => b.meta.startedAt - a.meta.startedAt);
  }, [history, currentMinutes]);

  const speakerCount = useMemo(() => new Set(utterances.map((u) => u.speaker)).size, [utterances]);

  const flash = useCallback((text) => {
    toast(text);
  }, []);

  // --- Boot: load stored state, subscribe to storage changes ---
  useEffect(() => {
    if (!chromeApi?.storage) return;
    let mounted = true;
    (async () => {
      const session = await chromeApi.storage.session.get(['state', 'insights', 'minutes', 'logs', 'chats']);
      const local = await chromeApi.storage.local.get(['settings', 'history', 'modelMigration']);
      if (!mounted) return;
      if (session.state) setExtState(session.state);
      setInsights(session.insights ?? null);
      setMinutes(session.minutes ?? null);
      setLogs(session.logs ?? []);
      if (session.chats) {
        setChats(session.chats);
        setActiveChatId(session.chats.list[0]?.id ?? null);
      }
      setHistory(local.history ?? []);
      let merged = {
        ...DEFAULT_SETTINGS,
        ...local.settings,
        apiKeys: { ...DEFAULT_SETTINGS.apiKeys, ...local.settings?.apiKeys },
        detect: { ...DEFAULT_SETTINGS.detect, ...local.settings?.detect },
      };
      let migrated = false;
      // Chave antiga (campo único `apiKey`) passa a ser a chave Anthropic.
      if (local.settings?.apiKey && !merged.apiKeys.anthropic) {
        merged = { ...merged, apiKeys: { ...merged.apiKeys, anthropic: local.settings.apiKey } };
        migrated = true;
      }
      delete merged.apiKey;
      if (local.modelMigration !== MODEL_MIGRATION) {
        merged = { ...merged, model: DEFAULT_SETTINGS.model };
        migrated = true;
      }
      if (migrated) {
        await chromeApi.storage.local.set({ settings: merged, modelMigration: MODEL_MIGRATION });
      }
      setSettings(merged);
      booted.current = true;
    })();

    const onChanged = (changes, area) => {
      if (area === 'session') {
        if (changes.state) setExtState(changes.state.newValue ?? EMPTY_STATE);
        if (changes.insights) setInsights(changes.insights.newValue ?? null);
        if (changes.minutes) setMinutes(changes.minutes.newValue ?? null);
        if (changes.logs) setLogs(changes.logs.newValue ?? []);
      }
      if (area === 'local') {
        if (changes.settings) {
          setSettings({
            ...DEFAULT_SETTINGS,
            ...changes.settings.newValue,
            apiKeys: { ...DEFAULT_SETTINGS.apiKeys, ...changes.settings.newValue?.apiKeys },
            detect: { ...DEFAULT_SETTINGS.detect, ...changes.settings.newValue?.detect },
          });
        }
        if (changes.history) setHistory(changes.history.newValue ?? []);
      }
    };
    chromeApi.storage.onChanged.addListener(onChanged);
    return () => {
      mounted = false;
      chromeApi.storage.onChanged.removeListener(onChanged);
    };
  }, []);

  // --- Persist chats to session storage after boot ---
  useEffect(() => {
    if (!booted.current || !chromeApi?.storage) return;
    chromeApi.storage.session.set({ chats }).catch(() => {});
  }, [chats]);

  // --- Reset chat set when the huddle changes; keep one empty tab ready ---
  useEffect(() => {
    const huddleId = huddle?.id ?? null;
    setChats((prev) => {
      if (prev.huddleId === huddleId) return prev.list.length ? prev : { huddleId, list: [seedChat(huddleId)] };
      return { huddleId, list: [seedChat(huddleId)] };
    });
  }, [huddle?.id]);

  useEffect(() => {
    if (!chats.list.some((c) => c.id === activeChatId)) setActiveChatId(chats.list[0]?.id ?? null);
  }, [chats, activeChatId]);

  // --- Drive status ---
  const refreshDriveStatus = useCallback(async () => {
    try {
      setDriveState(await drive.status());
    } catch {
      setDriveState({ connected: false, email: null });
    }
  }, []);

  // --- Slack tab presence ---
  const loadSlackOpen = useCallback(async () => {
    if (!chromeApi?.tabs) return;
    const tabs = await chromeApi.tabs.query({ url: 'https://app.slack.com/*' });
    const next = tabs.length > 0;
    let staleTab = null;
    for (const t of tabs) {
      try {
        const pong = await chromeApi.tabs.sendMessage(t.id, { type: 'huddle:ping' });
        if (!pong?.ok) staleTab = t.id;
      } catch {
        staleTab = t.id;
      }
    }
    const nextStale = extStateRef.current.huddle?.active ? null : staleTab;
    setSlackOpen(next);
    setSlackReloadTabId(nextStale);
  }, []);

  // --- Analysis loop: refs track latest values for the interval callback ---
  const latest = useRef({});
  latest.current = { huddle, utterances, settings, insights, minutes, currentInsights, currentMinutes, tab };
  const extStateRef = useRef(extState);
  extStateRef.current = extState;

  const transcriptKey = useCallback(() => {
    const { huddle: h, utterances: u } = latest.current;
    return `${h?.id}:${u.length}:${u.at(-1)?.text.length ?? 0}`;
  }, []);

  const maybeAnalyze = useCallback(async () => {
    const { huddle: h, utterances: u, settings: s, currentInsights: ci } = latest.current;
    const ctl = analysisCtl.current;
    if (ctl.running || !h?.active || !hasKeyForModel(s) || !u.length) return;
    const key = transcriptKey();
    if (key === ctl.lastKey) return;
    if (Date.now() - ctl.lastRunAt < s.freq * 1000) return;

    ctl.running = true;
    ctl.lastRunAt = Date.now();
    setAnalysisRunning(true);
    logEvent('info', `Analisando ${u.length} falas com ${s.model}`);
    const startedAt = Date.now();
    try {
      const data = await analyze({ settings: s, utterances: u, previous: ci?.data });
      logEvent('info', `Insights atualizados em ${((Date.now() - startedAt) / 1000).toFixed(1)}s`, {
        topico: data.topic.title,
        acoes: data.actions.length,
        decisoes: data.decisions.length,
      });
      ctl.lastKey = key;
      setAnalysisError(null);
      const record = { huddleId: h.id, updatedAt: Date.now(), data };
      setInsights(record);
      await chromeApi?.storage.session.set({ insights: record });
    } catch (error) {
      setAnalysisError(error.message);
      logEvent('error', `Falha na análise: ${error.message}`);
    } finally {
      ctl.running = false;
      setAnalysisRunning(false);
    }
  }, [transcriptKey]);

  // Análise sob demanda: ignora o intervalo e o throttle, e reinicia a contagem
  // a partir de agora (o próximo ciclo automático parte deste momento).
  const analyzeNow = useCallback(async () => {
    const { huddle: h, utterances: u, settings: s, currentInsights: ci } = latest.current;
    const ctl = analysisCtl.current;
    if (ctl.running || !h || !hasKeyForModel(s) || !u.length) return;
    ctl.running = true;
    ctl.lastRunAt = Date.now();
    setAnalysisRunning(true);
    logEvent('info', `Analisando ${u.length} falas agora com ${s.model}`);
    const startedAt = Date.now();
    try {
      const data = await analyze({ settings: s, utterances: u, previous: ci?.data });
      logEvent('info', `Insights atualizados em ${((Date.now() - startedAt) / 1000).toFixed(1)}s`, {
        topico: data.topic.title,
        acoes: data.actions.length,
        decisoes: data.decisions.length,
      });
      ctl.lastKey = transcriptKey();
      ctl.lastRunAt = Date.now(); // reinicia o intervalo a partir de agora
      setAnalysisError(null);
      const record = { huddleId: h.id, updatedAt: Date.now(), data };
      setInsights(record);
      await chromeApi?.storage.session.set({ insights: record });
    } catch (error) {
      setAnalysisError(error.message);
      logEvent('error', `Falha na análise sob demanda: ${error.message}`);
    } finally {
      ctl.running = false;
      setAnalysisRunning(false);
    }
  }, [transcriptKey]);

  const saveMinutesToHistory = useCallback(async (record) => {
    if (!latest.current.settings.saveHistory || !chromeApi?.storage) return;
    const { history: saved = [] } = await chromeApi.storage.local.get('history');
    const index = saved.findIndex((entry) => entry.huddle?.id === record.huddleId);
    if (index < 0) return;
    saved[index] = { ...saved[index], minutes: record };
    await chromeApi.storage.local.set({ history: saved });
  }, []);

  const runMinutes = useCallback(async () => {
    const { huddle: h, utterances: u, settings: s } = latest.current;
    if (minutesCtl.current.running || !h || !hasKeyForModel(s)) return;
    minutesCtl.current.running = true;
    minutesCtl.current.startedAt = Date.now();
    setMinutesRunning(true);
    setMinutesStartedAt(minutesCtl.current.startedAt);
    setMinutesError(null);
    setTab('ata');
    logEvent('info', `Gerando ata de ${u.length} falas com ${s.model}`);
    try {
      const meta = minutesMeta(h, u);
      const data = await generateMinutes({ settings: s, meta, utterances: u });
      const record = { huddleId: h.id, generatedAt: Date.now(), model: s.model, meta, data };
      setMinutes(record);
      await chromeApi?.storage.session.set({ minutes: record });
      await saveMinutesToHistory(record);
      logEvent('info', `Ata gerada em ${((Date.now() - minutesCtl.current.startedAt) / 1000).toFixed(1)}s`, {
        titulo: data.title,
        classificacao: data.classification.category,
        proximosPassos: data.next_steps.length,
      });
    } catch (error) {
      setMinutesError(error.message);
      minutesCtl.current.failedFor = h.id;
      logEvent('error', `Falha na ata: ${error.message}`);
    } finally {
      minutesCtl.current.running = false;
      setMinutesRunning(false);
    }
  }, [saveMinutesToHistory]);

  const maybeGenerateMinutes = useCallback(() => {
    const { huddle: h, utterances: u, settings: s, currentMinutes: cm } = latest.current;
    if (!h || h.active || h.loaded || !s.autoMinutes || !hasKeyForModel(s)) return;
    if (minutesCtl.current.running || cm || minutesCtl.current.failedFor === h.id) return;
    if (u.length < MIN_UTTERANCES_FOR_MINUTES) return;
    runMinutes();
  }, [runMinutes]);

  // --- Clocks + loops ---
  useEffect(() => {
    const tickTimer = setInterval(() => {
      setNow(Date.now());
      maybeAnalyze();
      maybeGenerateMinutes();
    }, 1000);
    const slackTimer = setInterval(loadSlackOpen, 5000);
    loadSlackOpen();
    refreshDriveStatus();
    return () => {
      clearInterval(tickTimer);
      clearInterval(slackTimer);
    };
  }, [maybeAnalyze, maybeGenerateMinutes, loadSlackOpen, refreshDriveStatus]);

  // --- Responsividade: quantas colunas cabem no painel ---
  // Ao expandir, cada aba vira coluna fixa: 1 col = abas; 2 cols = Insights
  // (Insights + Captions) e Ata; 3 cols = Insights + Captions + Ata sem abas.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq2 = window.matchMedia(`(min-width: ${COLS_2_MIN}px)`);
    const mq3 = window.matchMedia(`(min-width: ${COLS_3_MIN}px)`);
    const update = () => setCols(mq3.matches ? 3 : mq2.matches ? 2 : 1);
    update();
    mq2.addEventListener('change', update);
    mq3.addEventListener('change', update);
    return () => {
      mq2.removeEventListener('change', update);
      mq3.removeEventListener('change', update);
    };
  }, []);

  // (Auto-follow das legendas vive no CaptionsPanel, que é dono do próprio scroll.)

  // --- Clipboard ---
  const copyToClipboard = useCallback(
    async (text) => {
      try {
        await navigator.clipboard.writeText(text);
        flash('Copiado.');
      } catch {
        flash('Não consegui copiar.');
      }
    },
    [flash],
  );

  // --- Thread / Slack actions ---
  const postToThread = useCallback(
    async (text) => {
      const tabId = latest.current.huddle?.tabId;
      if (!tabId || !chromeApi?.tabs) return flash('Janela do huddle não encontrada.');
      try {
        const result = await chromeApi.tabs.sendMessage(tabId, { type: 'thread:draft', text });
        if (!result?.ok) throw new Error(result?.error ?? 'sem resposta da janela do huddle');
        flash('Texto colocado no thread do huddle. Revise e envie no Slack, depois volte para a aba Captions.');
      } catch (error) {
        flash(`Não consegui postar no thread: ${error.message}`);
      }
    },
    [flash],
  );

  const goToSlack = useCallback(async () => {
    if (!chromeApi?.tabs) return;
    const [t] = await chromeApi.tabs.query({ url: 'https://app.slack.com/*' });
    if (t) {
      await chromeApi.tabs.update(t.id, { active: true });
      await chromeApi.windows.update(t.windowId, { focused: true });
    } else {
      await chromeApi.tabs.create({ url: 'https://app.slack.com/' });
    }
  }, []);

  const reloadSlackTab = useCallback(async () => {
    if (slackReloadTabId == null) return goToSlack();
    try {
      await chromeApi.tabs.reload(slackReloadTabId);
      await chromeApi.tabs.update(slackReloadTabId, { active: true });
      const t = await chromeApi.tabs.get(slackReloadTabId);
      if (t?.windowId != null) await chromeApi.windows.update(t.windowId, { focused: true });
      flash('Aba do Slack recarregada. Se o huddle estiver numa janela separada, reabra o huddle.');
    } catch (error) {
      flash(`Não consegui recarregar a aba do Slack: ${error.message}`);
    }
  }, [slackReloadTabId, goToSlack, flash]);

  // Conecta à aba do Slack já aberta injetando os scripts de captura, sem recarregar
  // a página. O usuário só precisa reabrir o huddle para o hook capturar.
  const connectSlackTab = useCallback(async () => {
    if (slackReloadTabId == null || !chromeApi?.runtime) return goToSlack();
    try {
      const res = await chromeApi.runtime.sendMessage({ type: 'connect:tab', tabId: slackReloadTabId });
      if (!res?.ok) throw new Error(res?.error ?? 'sem resposta do serviço');
      await chromeApi.tabs.update(slackReloadTabId, { active: true });
      const t = await chromeApi.tabs.get(slackReloadTabId);
      if (t?.windowId != null) await chromeApi.windows.update(t.windowId, { focused: true });
      flash('Conectado a esta aba. Feche e reabra o huddle (sem recarregar a página) para começar a captura.');
    } catch (error) {
      flash(`Não consegui conectar à aba: ${error.message}. Tente recarregar a aba.`);
    }
  }, [slackReloadTabId, goToSlack, flash]);

  // --- Alerts ---
  const acceptAlert = useCallback((alert) => {
    setAcked((prev) => new Set(prev).add(alert.text));
    if (alert.kind === 'action') setDone((prev) => {
      const next = new Set(prev);
      next.delete(alert.text);
      return next;
    });
    flash(alert.kind === 'action' ? 'Ação aceita.' : 'Alerta marcado como visto.');
  }, [flash]);

  const editAlert = useCallback((alert) => {
    setAcked((prev) => new Set(prev).add(alert.text));
    postToThread(alert.text);
  }, [postToThread]);

  const toggleDone = useCallback((key, on) => {
    setDone((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  // --- Downloads ---
  const downloadTranscript = useCallback(() => {
    download(`huddle-${fileStamp(huddle.startedAt)}.txt`, `${huddle.title ?? 'Huddle'}\n\n${formatTranscript(utterances)}\n`);
  }, [huddle, utterances]);

  const downloadMinutes = useCallback((record) => {
    download(`ata-${fileStamp(record.meta.startedAt)}.md`, `${minutesAsText(record)}\n`, 'text/markdown');
  }, []);

  // --- Drive ---
  const persistDrive = useCallback(async (record, info) => {
    if (!chromeApi?.storage) return;
    const { minutes: sessionMinutes } = await chromeApi.storage.session.get('minutes');
    if (sessionMinutes?.huddleId === record.huddleId) {
      await chromeApi.storage.session.set({ minutes: { ...sessionMinutes, drive: info } });
    }
    const { history: saved = [] } = await chromeApi.storage.local.get('history');
    const index = saved.findIndex((entry) => entry.minutes?.huddleId === record.huddleId);
    if (index >= 0 && saved[index].minutes) {
      saved[index] = { ...saved[index], minutes: { ...saved[index].minutes, drive: info } };
      await chromeApi.storage.local.set({ history: saved });
    }
  }, []);

  const uploadToDrive = useCallback(
    async (record) => {
      if (driveBusy) return;
      setDriveBusy(record.huddleId);
      try {
        const name = `ata-${fileStamp(record.meta.startedAt)}.md`;
        const file = await drive.upload({ name, content: `${minutesAsText(record)}\n`, mimeType: 'text/markdown' });
        const info = { fileId: file.id, link: file.webViewLink ?? null, at: Date.now() };
        if (viewingAta?.huddleId === record.huddleId) setViewingAta((v) => ({ ...v, drive: info }));
        setMinutes((m) => (m?.huddleId === record.huddleId ? { ...m, drive: info } : m));
        await persistDrive(record, info);
        if (!driveState.connected) await refreshDriveStatus();
        logEvent('info', 'Ata enviada ao Google Drive', { arquivo: file.name ?? name });
        flash('Ata enviada ao Google Drive.');
      } catch (error) {
        logEvent('error', `Falha ao enviar ao Drive: ${error.message}`);
        flash(`Não consegui enviar ao Drive: ${error.message}`);
      } finally {
        setDriveBusy(null);
      }
    },
    [driveBusy, viewingAta, driveState.connected, persistDrive, refreshDriveStatus, flash],
  );

  const connectDrive = useCallback(async () => {
    setDriveConnecting(true);
    try {
      const next = await drive.connect();
      setDriveState(next);
      setNotice(next.email ? `Conectado como ${next.email}.` : 'Google Drive conectado.');
    } catch (error) {
      setNotice(error.message);
    } finally {
      setDriveConnecting(false);
    }
  }, []);

  const disconnectDrive = useCallback(async () => {
    await drive.disconnect();
    setDriveState({ connected: false, email: null });
    setNotice('Google Drive desconectado.');
  }, []);

  // --- Settings ---
  const saveSettings = useCallback(async (next) => {
    setSettings(next);
    analysisCtl.current.lastKey = '';
    minutesCtl.current.failedFor = null;
    setAnalysisError(null);
    await chromeApi?.storage.local.set({ settings: next });
    setSettingsOpen(false);
  }, []);

  const setAutoMinutes = useCallback(async (value) => {
    setSettings((prev) => {
      const next = { ...prev, autoMinutes: value };
      chromeApi?.storage.local.set({ settings: next }).catch(() => {});
      return next;
    });
  }, []);

  const clearHistory = useCallback(async () => {
    await chromeApi?.storage.local.remove('history');
    setNotice('Histórico e sessões apagados.');
  }, []);

  const clearLogs = useCallback(async () => {
    await chromeApi?.storage.session.remove('logs');
  }, []);

  const runDiagnostics = useCallback(async () => {
    const tabId = latest.current.huddle?.tabId ?? (await chromeApi?.tabs.query({ url: 'https://app.slack.com/*' }))?.[0]?.id;
    if (!tabId) {
      setNotice('Nenhuma aba do Slack aberta.');
      return;
    }
    try {
      const dump = await chromeApi.tabs.sendMessage(tabId, { type: 'debug:dump' });
      if (!dump) throw new Error('sem resposta; recarregue a aba do Slack');
      await navigator.clipboard.writeText(JSON.stringify(dump, null, 2));
      setNotice(
        dump.huddle
          ? `Huddle encontrado, legendas ${dump.captionsFound ? 'encontradas' : 'não encontradas'}, ${dump.rows} falas. O diagnóstico foi copiado para a área de transferência.`
          : `Nenhuma janela de huddle detectada (${dump.popupsTracked} janelas acompanhadas). Recarregue a aba do Slack e abra o huddle de novo.`,
      );
    } catch (error) {
      setNotice(`Não consegui ler o Slack (${error.message}).`);
    }
  }, []);

  // --- Navigation ---
  const openSettings = useCallback(() => {
    setNotice(null);
    setSettingsOpen(true);
  }, []);
  const openLogs = useCallback(() => {
    setLogsReturnToSettings(settingsOpen);
    setSettingsOpen(false);
    setLogsOpen(true);
  }, [settingsOpen]);
  const closeLogs = useCallback(() => {
    setLogsOpen(false);
    setSettingsOpen(logsReturnToSettings);
  }, [logsReturnToSettings]);
  const openAtas = useCallback(() => {
    setAtasOpen(true);
    setViewingAta(null);
    setImportOpen(false);
  }, []);
  const closeAtas = useCallback(() => {
    setAtasOpen(false);
    setAtasQuery('');
    setAtasTag(null);
  }, []);
  const selectTag = useCallback((t) => setAtasTag((prev) => (prev === t ? null : t)), []);
  const openImport = useCallback(() => {
    setImportError(null);
    setImportOpen(true);
    setAtasOpen(false);
    setViewingAta(null);
  }, []);

  // --- Import / load session ---
  const archiveImported = useCallback(async (hud, utt) => {
    if (!latest.current.settings.saveHistory || !chromeApi?.storage) return;
    const { history: saved = [] } = await chromeApi.storage.local.get('history');
    const entry = { huddle: hud, utterances: utt, insights: null, minutes: null };
    await chromeApi.storage.local.set({ history: [entry, ...saved].slice(0, 20) });
  }, []);

  const saveInsightsToHistory = useCallback(async (huddleId, data) => {
    if (!latest.current.settings.saveHistory || !chromeApi?.storage) return;
    const { history: saved = [] } = await chromeApi.storage.local.get('history');
    const index = saved.findIndex((entry) => entry.huddle?.id === huddleId);
    if (index < 0) return;
    saved[index] = { ...saved[index], insights: data };
    await chromeApi.storage.local.set({ history: saved });
  }, []);

  const analyzeOnce = useCallback(
    async (huddleId) => {
      const s = latest.current.settings;
      if (!hasKeyForModel(s) || analysisCtl.current.running) return;
      analysisCtl.current.running = true;
      setAnalysisRunning(true);
      setAnalysisError(null);
      try {
        const data = await analyze({ settings: s, utterances: latest.current.utterances, previous: null });
        if (latest.current.huddle?.id !== huddleId) return;
        const record = { huddleId, updatedAt: Date.now(), data };
        setInsights(record);
        await chromeApi?.storage.session.set({ insights: record });
        await saveInsightsToHistory(huddleId, data);
      } catch (error) {
        setAnalysisError(error.message);
        logEvent('error', `Falha na análise da importação: ${error.message}`);
      } finally {
        analysisCtl.current.running = false;
        setAnalysisRunning(false);
      }
    },
    [saveInsightsToHistory],
  );

  const importSession = useCallback(
    async ({ title, text }) => {
      const utt = parseTranscript(text);
      if (utt.length === 0) {
        setImportError('Cole a transcrição no campo de texto para importar.');
        return;
      }
      const ts = Date.now();
      const span = utt.at(-1).at || (utt.length - 1) * 1000;
      const hud = {
        id: `import-${ts.toString(36)}`,
        title: title || 'Sessão importada',
        captions: true,
        language: null,
        startedAt: ts - span,
        endedAt: ts,
        active: false,
        archived: true,
        loaded: true,
        imported: true,
      };
      const nextState = { huddle: hud, utterances: utt };
      setExtState(nextState);
      setInsights(null);
      setMinutes(null);
      await chromeApi?.storage.session.set({ state: nextState });
      await chromeApi?.storage.session.remove(['insights', 'minutes']);
      await archiveImported(hud, utt);
      analysisCtl.current.lastKey = `${hud.id}:${utt.length}:${utt.at(-1)?.text.length ?? 0}`;
      setAnalysisError(null);
      minutesCtl.current.failedFor = null;
      setMinutesError(null);
      setImportOpen(false);
      setTab('insights');
      logEvent('info', `Transcrição importada: ${utt.length} falas, ${new Set(utt.map((u) => u.speaker)).size} participantes`);
      if (!hasKeyForModel(latest.current.settings)) {
        flash('Transcrição importada. Adicione a chave da API para gerar a ata e os insights.');
        return;
      }
      flash('Transcrição importada. Gerando a ata e os insights…');
      // Give state a tick to settle before the background jobs read latest.current.
      setTimeout(() => {
        analyzeOnce(hud.id);
        runMinutes();
      }, 0);
    },
    [archiveImported, analyzeOnce, runMinutes, flash],
  );

  const loadSession = useCallback(
    async (record) => {
      if (record.huddleId === latest.current.huddle?.id) {
        flash('Esta sessão já está carregada no app.');
        return;
      }
      const entry = history.find((item) => (item.huddle?.id ?? item.minutes?.huddleId) === record.huddleId);
      if (!entry?.huddle) {
        flash('Não encontrei os dados completos desta sessão.');
        return;
      }
      const hud = { ...entry.huddle, active: false, archived: true, loaded: true };
      const nextState = { huddle: hud, utterances: entry.utterances ?? [] };
      const nextInsights = entry.insights
        ? { huddleId: hud.id, updatedAt: entry.minutes?.generatedAt ?? Date.now(), data: entry.insights }
        : null;
      const nextMinutes = entry.minutes ?? null;

      await chromeApi?.storage.session.set({ state: nextState });
      if (nextInsights) await chromeApi?.storage.session.set({ insights: nextInsights });
      else await chromeApi?.storage.session.remove('insights');
      if (nextMinutes) await chromeApi?.storage.session.set({ minutes: nextMinutes });
      else await chromeApi?.storage.session.remove('minutes');

      setExtState(nextState);
      setInsights(nextInsights);
      setMinutes(nextMinutes);
      analysisCtl.current.lastKey = `${hud.id}:${nextState.utterances.length}:${nextState.utterances.at(-1)?.text.length ?? 0}`;
      setAnalysisError(null);
      minutesCtl.current.failedFor = null;
      setMinutesError(null);
      setViewingAta(null);
      setAtasOpen(false);
      setAtasQuery('');
      setTab('insights');
      flash('Sessão carregada. Pergunte sobre ela no chat ou veja as abas.');
    },
    [history, flash],
  );

  // Removes a saved session from the archive. If it is the session currently loaded (and not
  // a live huddle), it is also unloaded from the app. Returns to the list afterwards.
  const deleteSession = useCallback(
    async (record) => {
      const id = record.huddleId;
      if (chromeApi?.storage) {
        const { history: saved = [] } = await chromeApi.storage.local.get('history');
        const next = saved.filter((entry) => (entry.huddle?.id ?? entry.minutes?.huddleId) !== id);
        await chromeApi.storage.local.set({ history: next });
      }
      const cur = latest.current.huddle;
      if (cur?.id === id && !cur.active) {
        setExtState(EMPTY_STATE);
        setInsights(null);
        setMinutes(null);
        await chromeApi?.storage.session.set({ state: EMPTY_STATE });
        await chromeApi?.storage.session.remove(['insights', 'minutes']);
      }
      setViewingAta(null);
      logEvent('info', 'Sessão apagada');
      flash('Sessão apagada.');
    },
    [flash],
  );

  // --- Chat ---
  const activeChat = chats.list.find((c) => c.id === activeChatId) ?? null;

  const toggleChat = useCallback(() => setChatOpen((v) => !v), []);
  const addChat = useCallback(() => {
    const chat = newChat(); // unique id created in the handler, not inside the updater
    setChats((prev) => ({ ...prev, list: [...prev.list, { ...chat, title: `Chat ${prev.list.length + 1}` }] }));
    setActiveChatId(chat.id);
  }, []);
  // The activeChatId effect reselects the first tab when the active one is removed, so the
  // updater here stays pure (no setActiveChatId inside it).
  const closeChat = useCallback((id) => {
    setChatDrafts((d) => {
      const next = { ...d };
      delete next[id];
      return next;
    });
    setChatBusy((b) => {
      const next = new Set(b);
      next.delete(id);
      return next;
    });
    setChats((prev) => {
      const list = prev.list.filter((c) => c.id !== id);
      return { ...prev, list: list.length ? list : [seedChat(prev.huddleId)] };
    });
  }, []);
  const selectChat = useCallback((id) => setActiveChatId(id), []);
  const setDraft = useCallback((id, value) => setChatDrafts((d) => ({ ...d, [id]: value })), []);

  const nameChat = useCallback(async (chatId, question) => {
    let title;
    try {
      title = await titleChat({ settings: latest.current.settings, question });
    } catch (error) {
      logEvent('warn', `Não consegui gerar o título do chat: ${error.message}`);
      return;
    }
    if (!title) return;
    setChats((prev) => {
      const chat = prev.list.find((c) => c.id === chatId);
      if (!chat || !/^Chat \d+$/.test(chat.title)) return prev;
      return { ...prev, list: prev.list.map((c) => (c.id === chatId ? { ...c, title } : c)) };
    });
    logEvent('info', `Chat renomeado para "${title}"`);
  }, []);

  const appendMessage = useCallback((chatId, message) => {
    setChats((prev) => ({
      ...prev,
      list: prev.list.map((c) => (c.id === chatId ? { ...c, messages: [...c.messages, message] } : c)),
    }));
  }, []);

  const sendChat = useCallback(async () => {
    const chat = chats.list.find((c) => c.id === activeChatId);
    if (!chat) return;
    const question = (chatDrafts[chat.id] ?? '').trim();
    if (!question) return;
    if (!hasKeyForModel(settings)) {
      flash('Adicione a chave da API do modelo escolhido nas configurações para conversar com a reunião.');
      return;
    }
    if (chatBusy.has(chat.id)) return;
    const histTurns = chat.messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, text: m.text }));
    const firstQuestion = !chat.messages.some((m) => m.role === 'user');

    appendMessage(chat.id, { role: 'user', text: question });
    setDraft(chat.id, '');
    setChatBusy((b) => new Set(b).add(chat.id));
    setChatStream({ chatId: chat.id, text: '' });

    if (firstQuestion && /^Chat \d+$/.test(chat.title)) nameChat(chat.id, question);
    logEvent('info', `Pergunta ao huddle (${latest.current.utterances.length} falas)`);
    try {
      const answer = await askMeeting({
        settings: latest.current.settings,
        utterances: latest.current.utterances,
        history: histTurns,
        question,
        onText: (delta) => setChatStream((s) => (s?.chatId === chat.id ? { ...s, text: s.text + delta } : s)),
      });
      appendMessage(chat.id, { role: 'assistant', text: answer });
    } catch (error) {
      appendMessage(chat.id, { role: 'error', text: error.message });
      logEvent('error', `Falha no chat: ${error.message}`);
    } finally {
      setChatBusy((b) => {
        const next = new Set(b);
        next.delete(chat.id);
        return next;
      });
      setChatStream(null);
    }
  }, [chats, activeChatId, chatDrafts, settings, chatBusy, appendMessage, setDraft, nameChat, flash]);

  // --- Derived view helpers ---
  const ataProps = (record) => ({
    done,
    onCopy: () => copyToClipboard(minutesAsText(record)),
    onToggleStep: toggleDone,
  });
  const footerProps = (record) => {
    const isCurrent = record.huddleId === huddle?.id;
    return {
      onCopy: () => copyToClipboard(minutesAsText(record)),
      canPost: isCurrent && !!huddle?.active,
      onPost: () => postToThread(minutesAsText(record, 'slack')),
      onDownload: () => downloadMinutes(record),
      uploaded: record.drive ?? null,
      driveBusy: driveBusy === record.huddleId,
      onDrive: () => uploadToDrive(record),
    };
  };

  // --- Screens ---
  // Telas sem huddle ao vivo não têm layout multi-coluna: num painel largo,
  // ficam limitadas à largura de um painel e centralizadas (.screen).
  if (logsOpen) {
    return (
      <LogsView
        logs={logs}
        onBack={closeLogs}
        onCopyAll={() => copyToClipboard(logsAsText(logs))}
        onCopyEntry={(text) => copyToClipboard(text)}
        onClear={clearLogs}
      />
    );
  }
  if (settingsOpen) {
    return (
      <SettingsView
        settings={settings}
        driveState={driveState}
        driveConnecting={driveConnecting}
        notice={notice}
        version={version()}
        onSave={saveSettings}
        onCancel={() => setSettingsOpen(false)}
        onClearHistory={clearHistory}
        onRunDiagnostics={runDiagnostics}
        onOpenLogs={openLogs}
        onConnectDrive={connectDrive}
        onDisconnectDrive={disconnectDrive}
      />
    );
  }
  if (importOpen) {
    return <ImportView error={importError} hasKey={hasKeyForModel(settings)} onSubmit={importSession} onCancel={() => setImportOpen(false)} />;
  }
  if (viewingAta) {
    return (
      <PastAtaView
        record={viewingAta}
        isCurrent={viewingAta.huddleId === huddle?.id}
        now={now}
        onBack={() => setViewingAta(null)}
        onLoad={loadSession}
        onDelete={viewingAta.huddleId === huddle?.id && huddle?.active ? undefined : deleteSession}
        ataProps={ataProps(viewingAta)}
        footerProps={footerProps(viewingAta)}
      />
    );
  }
  if (atasOpen) {
    return (
      <AtasView
        records={allMinutes}
        query={atasQuery}
        tag={atasTag}
        now={now}
        currentHuddleId={huddle?.id}
        onQueryChange={setAtasQuery}
        onSelectTag={selectTag}
        onOpen={setViewingAta}
        onLoad={loadSession}
        onDelete={deleteSession}
        onBack={closeAtas}
        onOpenImport={openImport}
      />
    );
  }
  if (!huddle) {
    return (
      <div className="screen">
        <Header
          huddle={null}
          version={version()}
          chatOpen={false}
          now={now}
          onOpenAtas={openAtas}
          onToggleChat={toggleChat}
          onOpenLogs={openLogs}
          onOpenSettings={openSettings}
        />
        <IdleView
          slackOpen={slackOpen}
          slackReloadTabId={slackReloadTabId}
          savedCount={allMinutes.length}
          onConnectSlackTab={connectSlackTab}
          onReloadSlackTab={reloadSlackTab}
          onGoToSlack={goToSlack}
          onOpenImport={openImport}
          onOpenAtas={openAtas}
        />
      </div>
    );
  }

  // --- Live screen ---
  const recentUtterances = utterances.slice(-3);
  const canCopySummary = !!currentInsights;
  const canPostSummary = !!currentInsights && !!huddle.active;
  const copySummary = () => currentInsights && copyToClipboard(insightsAsText(currentInsights.data, settings.detect));
  const postSummary = () => currentInsights && postToThread(insightsAsText(currentInsights.data, settings.detect));

  // Props da barra de informação — iguais para qualquer seção; a InfoBar usa só
  // o que importa para a aba que recebe.
  const infoBarProps = {
    settings,
    analysis: { running: analysisRunning, error: analysisError },
    huddle,
    utteranceCount: utterances.length,
    currentMinutes,
    minutesRunning,
    canCopySummary,
    canPostSummary,
    onCopySummary: copySummary,
    onPostSummary: postSummary,
    onAnalyzeNow: analyzeNow,
    tickerHidden,
    hasRecent: recentUtterances.length > 0,
    onToggleTicker: () => setTickerHidden((v) => !v),
    onOpenSettings: openSettings,
    onDownloadTranscript: downloadTranscript,
    onRegenerate: runMinutes,
    onOpenAtas: openAtas,
  };

  // Conteúdo de uma seção — os painéis em si não mudam com a largura.
  const panelContent = (section) => {
    if (section === 'insights') {
      return (
        <InsightsView
          current={currentInsights}
          settings={settings}
          huddle={huddle}
          utterances={utterances}
          now={now}
          acked={acked}
          done={done}
          topicExpanded={topicExpanded}
          onToggleTopic={() => setTopicExpanded((v) => !v)}
          onAcceptAlert={acceptAlert}
          onEditAlert={editAlert}
          onToggleDone={toggleDone}
          onOpenSettings={openSettings}
        />
      );
    }
    if (section === 'captions') {
      return <CaptionsPanel utterances={utterances} huddle={huddle} marks={currentInsights?.data.marks ?? []} />;
    }
    return minutesRunning ? (
      <AtaLoading startedAt={minutesStartedAt} utterances={utterances.length} participants={speakerCount} now={now} />
    ) : currentMinutes ? (
      <AtaContent record={currentMinutes} {...ataProps(currentMinutes)} />
    ) : (
      <AtaEmpty
        active={huddle.active}
        error={minutesError}
        autoMinutes={settings.autoMinutes}
        utterances={utterances.length}
        participants={speakerCount}
        hasKey={hasKeyForModel(settings)}
        canGenerate={hasKeyForModel(settings) && utterances.length >= MIN_UTTERANCES_FOR_MINUTES}
        onToggleAuto={setAutoMinutes}
        onGenerate={runMinutes}
        onOpenList={openAtas}
      />
    );
  };

  // Rodapé por seção — só no modo de coluna única; nas colunas lado a lado as
  // ações do resumo seguem na própria InfoBar de cada painel.
  const renderFooter = (section) => {
    if (section === 'ata') {
      return currentMinutes && !minutesRunning ? <AtaFooter record={currentMinutes} {...footerProps(currentMinutes)} /> : null;
    }
    if (section === 'insights') {
      return (
        <footer className="footer footer--insights">
          {!tickerHidden && recentUtterances.length > 0 && (
            <div className="ticker-card">
              <Tooltip label="Fechar últimas falas">
                <button
                  className="ticker-card__close"
                  type="button"
                  aria-label="Fechar últimas falas"
                  onClick={() => setTickerHidden(true)}
                >
                  <Icon name="close" />
                </button>
              </Tooltip>
              <RecentTicker utterances={utterances} />
            </div>
          )}
        </footer>
      );
    }
    return null;
  };

  const onSelectTab = (id) => {
    setTab(id);
  };

  // Uma seção renderizada como coluna: a InfoBar (que faz as vezes de cabeçalho
  // da coluna) seguida do corpo rolável.
  const Pane = (section) => (
    <section className="pane" key={section}>
      <InfoBar tab={section} {...infoBarProps} />
      {section === 'captions' ? (
        <CaptionsPanel utterances={utterances} huddle={huddle} marks={currentInsights?.data.marks ?? []} />
      ) : (
        <div className="pane__body">{panelContent(section)}</div>
      )}
    </section>
  );

  // Captions só é aba com uma coluna; a partir de duas, divide a coluna Insights.
  const effTab = cols >= 2 && tab === 'captions' ? 'insights' : tab;

  let region;
  if (cols === 1) {
    region = (
      <>
        <Tabs tab={tab} onSelect={onSelectTab} />
        <InfoBar tab={tab} {...infoBarProps} />
        {tab === 'captions' ? (
          <CaptionsPanel utterances={utterances} huddle={huddle} marks={currentInsights?.data.marks ?? []} />
        ) : (
          <main className={`main main--${tab}`} id="main">
            {panelContent(tab)}
          </main>
        )}
        {renderFooter(tab)}
      </>
    );
  } else if (cols === 2) {
    region = (
      <>
        <Tabs tab={effTab} items={TWO_COL_TABS} onSelect={onSelectTab} />
        {effTab === 'ata' ? (
          <div className="panes panes--solo">{Pane('ata')}</div>
        ) : (
          <div className="panes panes--2">
            {Pane('insights')}
            {Pane('captions')}
          </div>
        )}
      </>
    );
  } else {
    region = (
      <div className="panes panes--3">
        {Pane('insights')}
        {Pane('captions')}
        {Pane('ata')}
      </div>
    );
  }

  return (
    <>
      <Header
        huddle={huddle}
        version={version()}
        chatOpen={chatOpen}
        now={now}
        onOpenAtas={openAtas}
        onToggleChat={toggleChat}
        onOpenLogs={openLogs}
        onOpenSettings={openSettings}
      />
      {region}
      {chatOpen && (
        <ChatDock
          chats={chats.list}
          activeChatId={activeChatId}
          activeChat={activeChat}
          busy={activeChat ? chatBusy.has(activeChat.id) : false}
          draft={activeChat ? chatDrafts[activeChat.id] ?? '' : ''}
          expanded={chatExpanded}
          floating={cols >= 2}
          streamText={chatStream?.chatId === activeChatId ? chatStream.text : ''}
          onSelectChat={selectChat}
          onCloseChat={closeChat}
          onAddChat={addChat}
          onToggleExpand={() => setChatExpanded((v) => !v)}
          onCloseDock={toggleChat}
          onDraftChange={(value) => activeChat && setDraft(activeChat.id, value)}
          onSubmit={sendChat}
        />
      )}
    </>
  );
}

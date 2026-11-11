import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fileStamp, formatTranscript } from './lib/format.js';
import { logsAsText } from './lib/logs.js';
import { insightsAsText, minutesAsText, minutesMeta, participantsOf, sessionDigests } from './lib/minutes.js';
import { parseTranscript } from './lib/transcript.js';
import * as drive from './drive.js';
import { analyze, askMeeting, generateMinutes, recallContextBatch, scoreMeeting, titleChat } from './insights.js';
import { hasKeyForModel } from './lib/models.js';
import { AtaContent, AtaEmpty, AtaFooter, AtaLoading } from './views/Ata.jsx';
import { AtasView, PastAtaView } from './views/Atas.jsx';
import { CaptionsPanel } from './views/Captions.jsx';
import { ChatDock } from './views/Chat.jsx';
import { ThreadBar } from './views/Thread.jsx';
import { threadStatus } from './lib/thread.js';
import { chatAfterClose } from './lib/chats.js';
import { Header, InfoBar, Tabs } from './views/Header.jsx';
import { IdleView } from './views/Idle.jsx';
import { ImportView } from './views/Import.jsx';
import { InsightsView } from './views/Insights.jsx';
import { AnaliseView, SessionAnalyticsView } from './views/Analise.jsx';
import { RecentTicker } from './views/RecentTicker.jsx';
import { LogsView } from './views/Logs.jsx';
import { SettingsView } from './views/Settings.jsx';
import { MarkDialog } from './ui/ConfirmDialog.jsx';
import { toast } from 'sonner';
import { Icon } from './ui/Icon.jsx';
import { Tooltip } from './ui/Tooltip.jsx';
import { I18nProvider, translate } from './lib/i18n.js';

const DEFAULT_SETTINGS = {
  apiKeys: { anthropic: '', openai: '', google: '', groq: '', openrouter: '', cerebras: '', mistral: '' },
  model: 'claude-haiku-5-5',
  // Provider usado quando `model` é um ID personalizado (fora da lista MODELS).
  modelProvider: '',
  language: 'English',
  // Tamanho das respostas do modelo: 'curto' | 'normal' | 'detalhado' (ver insights.js VERBOSITY).
  verbosity: 'normal',
  freq: 30,
  userName: '',
  detect: { actions: true, decisions: true, questions: true, suggestions: false, replies: false, alerts: true, references: true, acronyms: true, context: true },
  saveHistory: true,
  autoMinutes: true,
  // Pontuar a reunião automaticamente quando a huddle encerra (aba Análise). Opt-in: gera uma
  // chamada de IA extra ao fim de cada reunião, então fica desligado por padrão.
  autoScore: false,
  captionSource: 'auto',
  // Whether the huddle's Slack thread goes into the AI's context (chat lookups).
  threadContext: true,
};
// Migração one-time: leva instalações já existentes para o modelo padrão atual
// (Haiku) uma única vez. Depois disso o usuário fica livre para escolher.
// Guardada fora de `settings` porque Settings.submit só persiste campos conhecidos.
const MODEL_MIGRATION = 1;
const MIN_UTTERANCES_FOR_MINUTES = 3;
// Seções de insight que podem ser empilhadas (deck). Usadas pelo toggle global do info bar.
const DECK_SECTION_KEYS = ['alerts', 'questions', 'points', 'actions', 'decisions', 'references', 'acronyms'];
const EMPTY_STATE = { huddle: null, utterances: [] };

// Abas exibidas quando cabem duas colunas: Captions deixa de ser aba (passa a
// dividir a coluna com Insights) e Copilot vive no ícone do cabeçalho.
const TWO_COL_TABS = ['insights', 'ata', 'analytics'];

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
// "Give me more details about this item" in each language the settings offer, so the chat question
// matches the user's chosen language (the answer language is enforced in the chat prompt too).
const ASK_DETAIL_PROMPT = {
  English: (text) => `Briefly explain this in 1-2 sentences, based on the meeting: "${text}"`,
  Portuguese: (text) => `Explique rapidamente, em 1-2 frases, com base na reunião: "${text}"`,
  Português: (text) => `Explique rapidamente, em 1-2 frases, com base na reunião: "${text}"`,
  Spanish: (text) => `Explica esto brevemente en 1-2 frases, con base en la reunión: "${text}"`,
  Español: (text) => `Explica esto brevemente en 1-2 frases, con base en la reunión: "${text}"`,
};

// Question posted to the chat when the user asks for a summary of the huddle's Slack thread.
const SUMMARIZE_THREAD_PROMPT = {
  English: 'Summarize the Slack thread for this huddle: the main points, decisions and open questions.',
  Portuguese: 'Resuma a thread do Slack desta huddle: os pontos principais, decisões e questões em aberto.',
  Português: 'Resuma a thread do Slack desta huddle: os pontos principais, decisões e questões em aberto.',
  Spanish: 'Resume el hilo de Slack de esta reunión: los puntos principales, decisiones y preguntas abiertas.',
  Español: 'Resume el hilo de Slack de esta reunión: los puntos principales, decisiones y preguntas abiertas.',
};

function newChat(index = 1) {
  return { id: `c${Date.now().toString(36)}${chatSeq++}`, title: `Chat ${index}`, messages: [] };
}

// A deterministic first chat for a huddle. Used inside the reset updater, so the same inputs
// always yield the same chat (pure) — safe under StrictMode's double invocation.
function seedChat(huddleId) {
  return { id: `c-${huddleId ?? 'none'}-1`, title: 'Chat 1', messages: [] };
}

// End timestamp of an imported session. Anchors to the chosen day (yyyy-mm-dd) at the current
// clock time; falls back to now for an empty or invalid date.
function sessionTimestamp(date) {
  const now = new Date();
  const [y, m, d] = (date || '').split('-').map(Number);
  if (!y || !m || !d) return now.getTime();
  return new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds()).getTime();
}

export function App() {
  // --- Extension state (mirrors chrome.storage) ---
  const [extState, setExtState] = useState(EMPTY_STATE);
  const [insights, setInsights] = useState(null);
  const [minutes, setMinutes] = useState(null);
  const [scores, setScores] = useState(null);
  const [history, setHistory] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [logs, setLogs] = useState([]);
  const [chats, setChats] = useState({ huddleId: null, list: [] });
  const [slackOpen, setSlackOpen] = useState(false);
  // A aba em foco na janela é o Slack? Quando não é (e existe uma aba do Slack), o cabeçalho
  // mostra um botão para voltar ao Slack.
  const [onSlackTab, setOnSlackTab] = useState(true);
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
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
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
  // Insight cards the user marked as seen (hidden from the list), and whether to show them anyway.
  const [seen, setSeen] = useState(() => new Set());
  const [showAllSeen, setShowAllSeen] = useState(false);
  // Cards que o usuário removeu de vez (diferente de "visto": não voltam nem com "ver todos").
  const [removed, setRemoved] = useState(() => new Set());
  // Correções de nome dos participantes: { nomeComoVeioNaLegenda: nomeCorrigido }. O usuário conserta
  // a grafia na seção Participantes e isso passa a valer nas próximas análises e na geração da ata.
  // Salvas em storage.local, então valem também nos próximos huddles com a mesma pessoa.
  const [nameOverrides, setNameOverrides] = useState({});
  // Modo "deck" por seção: cada seção de insight pode empilhar seus cards, mostrando um por vez. O
  // Set guarda as chaves das seções empilhadas ('points', 'actions', 'decisions', 'questions'…).
  const [deckSections, setDeckSections] = useState(() => new Set());
  // The insight item shown when a caption badge is clicked (what was decided/asked/assigned).
  const [markDialog, setMarkDialog] = useState(null);
  // Context-recall cards: one per look-back question detected live, with the subagent's answer.
  const [contextCards, setContextCards] = useState([]);
  const [contextDismissed, setContextDismissed] = useState(() => new Set());
  const contextSeen = useRef(new Set());

  // --- Live analysis / minutes control (refs) + their render-visible mirror ---
  const analysisCtl = useRef({ running: false, lastRunAt: 0, lastKey: '' });
  const minutesCtl = useRef({ running: false, startedAt: 0, failedFor: null });
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);
  // Momento da última análise disparada (espelho visível de analysisCtl.lastRunAt), para a InfoBar
  // mostrar a contagem regressiva até a próxima. Pausa do loop automático (análise só sob demanda).
  const [analysisLastRunAt, setAnalysisLastRunAt] = useState(0);
  const [analysisPaused, setAnalysisPaused] = useState(false);
  const [minutesRunning, setMinutesRunning] = useState(false);
  const [minutesStartedAt, setMinutesStartedAt] = useState(0);
  const [minutesError, setMinutesError] = useState(null);
  const scoringCtl = useRef({ running: false });
  const [scoringRunning, setScoringRunning] = useState(false);
  const [scoreError, setScoreError] = useState(null);
  const booted = useRef(false);

  const huddle = extState.huddle;
  const utterances = extState.utterances;
  const thread = extState.thread ?? null;
  const threadState = threadStatus(thread, { enabled: settings.threadContext !== false });
  // What the chat may read from the thread: nothing unless the user keeps it in context.
  const threadForAI = threadState === 'off' ? null : thread?.messages ?? null;

  const currentInsights = insights?.huddleId === huddle?.id ? insights : null;
  const currentMinutes = minutes?.huddleId === huddle?.id ? minutes : null;
  const currentScores = scores?.huddleId === huddle?.id ? scores : null;

  const allMinutes = useMemo(() => {
    const records = history.map((entry) => entry.minutes).filter(Boolean);
    if (currentMinutes && !records.some((r) => r.huddleId === currentMinutes.huddleId)) records.unshift(currentMinutes);
    return records.sort((a, b) => b.meta.startedAt - a.meta.startedAt);
  }, [history, currentMinutes]);

  // Scored sessions feeding the Análise dashboard: every history entry that has scores, plus the
  // live/loaded one when it is already scored, newest first.
  const allScores = useMemo(() => {
    const records = history.map((entry) => entry.scores).filter(Boolean);
    if (currentScores && !records.some((r) => r.huddleId === currentScores.huddleId)) records.unshift(currentScores);
    return records.sort((a, b) => (b.meta?.startedAt ?? 0) - (a.meta?.startedAt ?? 0));
  }, [history, currentScores]);

  // What the context-recall subagent reads: digests of past saved sessions, minus the live one.
  const pastSessions = useMemo(() => sessionDigests(history, huddle?.id), [history, huddle?.id]);

  const speakerCount = useMemo(() => new Set(utterances.map((u) => u.speaker)).size, [utterances]);

  const flash = useCallback((text) => {
    toast(text);
  }, []);

  // Erros da análise aparecem como toast embaixo, não no info bar. O efeito só
  // dispara quando a mensagem muda, então o loop automático não repete o mesmo erro.
  useEffect(() => {
    if (analysisError) flash(analysisError);
  }, [analysisError, flash]);

  // --- Boot: load stored state, subscribe to storage changes ---
  useEffect(() => {
    if (!chromeApi?.storage) return;
    let mounted = true;
    (async () => {
      const session = await chromeApi.storage.session.get(['state', 'insights', 'minutes', 'scores', 'logs', 'chats']);
      const local = await chromeApi.storage.local.get(['settings', 'history', 'modelMigration', 'nameOverrides']);
      if (!mounted) return;
      if (session.state) setExtState(session.state);
      setInsights(session.insights ?? null);
      setMinutes(session.minutes ?? null);
      setScores(session.scores ?? null);
      setLogs(session.logs ?? []);
      if (session.chats) {
        setChats(session.chats);
        setActiveChatId(session.chats.list[0]?.id ?? null);
      }
      setHistory(local.history ?? []);
      setNameOverrides(local.nameOverrides ?? {});
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
        if (changes.scores) setScores(changes.scores.newValue ?? null);
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
        if (changes.nameOverrides) setNameOverrides(changes.nameOverrides.newValue ?? {});
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
    let active = null;
    try {
      [active] = await chromeApi.tabs.query({ active: true, currentWindow: true });
    } catch {
      // no active tab known: treated as off Slack
    }
    const activeIsSlack = active ? /^https:\/\/app\.slack\.com\//.test(active.url ?? '') : false;
    // The tab to connect: the Slack tab being looked at, when it is one; else any Slack tab
    // whose content scripts don't answer (open since before the extension was installed/reloaded).
    const candidates = activeIsSlack ? tabs.filter((t) => t.id === active.id) : tabs;
    let staleTab = null;
    for (const t of candidates) {
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
    setOnSlackTab(activeIsSlack);
  }, []);

  // --- Analysis loop: refs track latest values for the interval callback ---
  const latest = useRef({});
  latest.current = { huddle, utterances, threadForAI, settings, insights, minutes, scores, currentInsights, currentMinutes, currentScores, pastSessions, tab, analysisPaused, nameOverrides };
  const extStateRef = useRef(extState);
  extStateRef.current = extState;

  // Translate a UI string using the current language (read from the live settings ref, so toasts
  // fired from async callbacks use the latest choice without re-creating the callbacks).
  const tr = useCallback((key, vars) => translate(latest.current.settings.language, key, vars), []);

  const transcriptKey = useCallback(() => {
    const { huddle: h, utterances: u } = latest.current;
    return `${h?.id}:${u.length}:${u.at(-1)?.text.length ?? 0}`;
  }, []);

  // Insights parciais (streaming): preenche o painel ao vivo só no PRIMEIRO resultado de um huddle
  // (vazio → cheio). Depois que já há uma análise completa na tela, os parciais são ignorados e a
  // próxima análise troca de uma vez só (atômica) — assim o painel não "recarrega" enquanto o
  // usuário lê. Throttle de 120ms e nunca persiste (o registro final é que persiste).
  const partialAt = useRef(0);
  const completedHuddle = useRef(null);
  const applyPartial = useCallback((huddleId, data) => {
    if (completedHuddle.current === huddleId) return; // refresh: espera o resultado final
    const t = Date.now();
    if (t - partialAt.current < 120) return;
    partialAt.current = t;
    if (latest.current.huddle?.id !== huddleId) return;
    setInsights({ huddleId, updatedAt: t, data });
  }, []);

  const maybeAnalyze = useCallback(async () => {
    const { huddle: h, utterances: u, settings: s, currentInsights: ci, analysisPaused: paused } = latest.current;
    const ctl = analysisCtl.current;
    if (paused || ctl.running || !h?.active || !hasKeyForModel(s) || !u.length) return;
    const key = transcriptKey();
    if (key === ctl.lastKey) return;
    if (Date.now() - ctl.lastRunAt < s.freq * 1000) return;

    ctl.running = true;
    ctl.lastRunAt = Date.now();
    setAnalysisLastRunAt(ctl.lastRunAt);
    setAnalysisRunning(true);
    logEvent('info', `Analisando ${u.length} falas com ${s.model}`);
    const startedAt = Date.now();
    const ctrl = new AbortController();
    ctl.ctrl = ctrl;
    try {
      const data = await analyze({
        settings: s,
        utterances: u,
        previous: ci?.data,
        sinceLine: ctl.lastCount ?? 0,
        nameOverrides: latest.current.nameOverrides,
        abortSignal: ctrl.signal,
        onPartial: (d) => applyPartial(h.id, d),
      });
      logEvent('info', `Insights atualizados em ${((Date.now() - startedAt) / 1000).toFixed(1)}s`, {
        topico: data.topic.title,
        acoes: data.actions.length,
        decisoes: data.decisions.length,
      });
      ctl.lastKey = key;
      ctl.lastCount = u.length; // próxima análise manda só o que vier depois daqui
      setAnalysisError(null);
      const record = { huddleId: h.id, updatedAt: Date.now(), data };
      setInsights(record);
      completedHuddle.current = h.id; // a partir daqui, próximas análises trocam de uma vez só
      await chromeApi?.storage.session.set({ insights: record });
    } catch (error) {
      if (ctrl.signal.aborted) return; // análise descartada (huddle mudou/encerrou)
      setAnalysisError(error.message);
      logEvent('error', `Falha na análise: ${error.message}`);
    } finally {
      if (ctl.ctrl === ctrl) ctl.ctrl = null;
      ctl.running = false;
      setAnalysisRunning(false);
    }
  }, [transcriptKey, applyPartial]);

  // Análise sob demanda: ignora o intervalo e o throttle, e reinicia a contagem
  // a partir de agora (o próximo ciclo automático parte deste momento).
  const analyzeNow = useCallback(async () => {
    const { huddle: h, utterances: u, settings: s, currentInsights: ci } = latest.current;
    const ctl = analysisCtl.current;
    if (ctl.running || !h || !hasKeyForModel(s) || !u.length) return;
    ctl.running = true;
    ctl.lastRunAt = Date.now();
    setAnalysisLastRunAt(ctl.lastRunAt);
    setAnalysisRunning(true);
    logEvent('info', `Analisando ${u.length} falas agora com ${s.model}`);
    const startedAt = Date.now();
    const ctrl = new AbortController();
    ctl.ctrl = ctrl;
    try {
      const data = await analyze({
        settings: s,
        utterances: u,
        previous: ci?.data,
        sinceLine: ctl.lastCount ?? 0,
        nameOverrides: latest.current.nameOverrides,
        abortSignal: ctrl.signal,
        onPartial: (d) => applyPartial(h.id, d),
      });
      logEvent('info', `Insights atualizados em ${((Date.now() - startedAt) / 1000).toFixed(1)}s`, {
        topico: data.topic.title,
        acoes: data.actions.length,
        decisoes: data.decisions.length,
      });
      ctl.lastKey = transcriptKey();
      ctl.lastCount = u.length;
      ctl.lastRunAt = Date.now(); // reinicia o intervalo a partir de agora
      setAnalysisLastRunAt(ctl.lastRunAt);
      setAnalysisError(null);
      const record = { huddleId: h.id, updatedAt: Date.now(), data };
      setInsights(record);
      completedHuddle.current = h.id;
      await chromeApi?.storage.session.set({ insights: record });
    } catch (error) {
      if (ctrl.signal.aborted) return;
      setAnalysisError(error.message);
      logEvent('error', `Falha na análise sob demanda: ${error.message}`);
    } finally {
      if (ctl.ctrl === ctrl) ctl.ctrl = null;
      ctl.running = false;
      setAnalysisRunning(false);
    }
  }, [transcriptKey, applyPartial]);

  // Persiste os insights no histórico local (chrome.storage.local), para a sessão mostrar o último
  // conjunto gerado quando for recarregada. Só atualiza uma sessão já arquivada no histórico.
  const saveInsightsToHistory = useCallback(async (huddleId, data) => {
    if (!latest.current.settings.saveHistory || !chromeApi?.storage) return;
    const { history: saved = [] } = await chromeApi.storage.local.get('history');
    const index = saved.findIndex((entry) => entry.huddle?.id === huddleId);
    if (index < 0) return;
    saved[index] = { ...saved[index], insights: data };
    await chromeApi.storage.local.set({ history: saved });
  }, []);

  // Persiste os chats abertos no histórico local, junto com insights/ata. Para um huddle ao vivo o
  // background grava os chats ao arquivar; aqui cobrimos as edições feitas numa sessão já arquivada
  // (carregada do histórico), para que os chats continuem salvos ao reabrir.
  const saveChatsToHistory = useCallback(async (huddleId, list) => {
    if (!latest.current.settings.saveHistory || !chromeApi?.storage) return;
    const { history: saved = [] } = await chromeApi.storage.local.get('history');
    const index = saved.findIndex((entry) => entry.huddle?.id === huddleId);
    if (index < 0) return;
    saved[index] = { ...saved[index], chats: list };
    await chromeApi.storage.local.set({ history: saved });
  }, []);

  // Numa sessão carregada do histórico (arquivada), salva os chats no histórico quando mudam.
  useEffect(() => {
    if (!booted.current || !huddle?.archived || chats.huddleId !== huddle.id) return;
    saveChatsToHistory(huddle.id, chats.list);
  }, [chats, huddle?.archived, huddle?.id, saveChatsToHistory]);

  // "Refazer": usado quando a reunião não está mais ao vivo. Reanalisa do zero — manda só a
  // transcrição inteira (previous: null, sem reenviar os insights já montados) e substitui o
  // resultado, em vez do envio incremental da análise automática.
  const reanalyze = useCallback(async () => {
    const { huddle: h, utterances: u, settings: s } = latest.current;
    const ctl = analysisCtl.current;
    if (ctl.running || !h || !hasKeyForModel(s) || !u.length) return;
    ctl.running = true;
    setAnalysisRunning(true);
    logEvent('info', `Refazendo os insights de ${u.length} falas com ${s.model}`);
    const startedAt = Date.now();
    const ctrl = new AbortController();
    ctl.ctrl = ctrl;
    try {
      const data = await analyze({
        settings: s,
        utterances: u,
        previous: null,
        sinceLine: 0,
        nameOverrides: latest.current.nameOverrides,
        abortSignal: ctrl.signal,
        onPartial: (d) => applyPartial(h.id, d),
      });
      logEvent('info', `Insights refeitos em ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
      ctl.lastKey = transcriptKey();
      ctl.lastCount = u.length;
      setAnalysisError(null);
      const record = { huddleId: h.id, updatedAt: Date.now(), data };
      setInsights(record);
      completedHuddle.current = h.id;
      await chromeApi?.storage.session.set({ insights: record });
      await saveInsightsToHistory(h.id, data);
    } catch (error) {
      if (ctrl.signal.aborted) return;
      setAnalysisError(error.message);
      logEvent('error', `Falha ao refazer os insights: ${error.message}`);
    } finally {
      if (ctl.ctrl === ctrl) ctl.ctrl = null;
      ctl.running = false;
      setAnalysisRunning(false);
    }
  }, [transcriptKey, applyPartial, saveInsightsToHistory]);

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
      const meta = minutesMeta(h, u, latest.current.nameOverrides);
      const data = await generateMinutes({ settings: s, meta, utterances: u, nameOverrides: latest.current.nameOverrides });
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

  // --- Meeting scoring (Análise) ---
  const saveScoresToHistory = useCallback(async (record) => {
    if (!latest.current.settings.saveHistory || !chromeApi?.storage) return;
    const { history: saved = [] } = await chromeApi.storage.local.get('history');
    const index = saved.findIndex((entry) => entry.huddle?.id === record.huddleId);
    if (index < 0) return;
    saved[index] = { ...saved[index], scores: record };
    await chromeApi.storage.local.set({ history: saved });
  }, []);

  // Scores the current (ended or loaded) meeting on the effectiveness criteria and stores it. Runs
  // on demand (button in the Análise tab) or automatically at the end of a huddle when autoScore is
  // on. Never for a live huddle (needs the full transcript) nor without an API key.
  const runScoring = useCallback(async () => {
    const { huddle: h, utterances: u, settings: s } = latest.current;
    if (scoringCtl.current.running || !h || h.active || !hasKeyForModel(s)) return;
    if (u.length < MIN_UTTERANCES_FOR_MINUTES) return;
    scoringCtl.current.running = true;
    setScoringRunning(true);
    setScoreError(null);
    logEvent('info', `Pontuando reunião de ${u.length} falas com ${s.model}`);
    const startedAt = Date.now();
    try {
      const meta = minutesMeta(h, u, latest.current.nameOverrides);
      const data = await scoreMeeting({ settings: s, meta, utterances: u, nameOverrides: latest.current.nameOverrides });
      const record = { huddleId: h.id, generatedAt: Date.now(), model: s.model, meta, data };
      setScores(record);
      await chromeApi?.storage.session.set({ scores: record });
      await saveScoresToHistory(record);
      logEvent('info', `Reunião pontuada em ${((Date.now() - startedAt) / 1000).toFixed(1)}s`, {
        media: (data.overall.reduce((a, c) => a + c.score, 0) / (data.overall.length || 1)).toFixed(1),
      });
    } catch (error) {
      setScoreError(error.message);
      logEvent('error', `Falha ao pontuar a reunião: ${error.message}`);
    } finally {
      scoringCtl.current.running = false;
      setScoringRunning(false);
    }
  }, [saveScoresToHistory]);

  const maybeScore = useCallback(() => {
    const { huddle: h, utterances: u, settings: s, scores: sc } = latest.current;
    if (!h || h.active || h.loaded || !s.autoScore || !hasKeyForModel(s)) return;
    if (scoringCtl.current.running || sc?.huddleId === h.id) return;
    if (u.length < MIN_UTTERANCES_FOR_MINUTES) return;
    runScoring();
  }, [runScoring]);

  // --- Clocks + loops ---
  useEffect(() => {
    const tickTimer = setInterval(() => {
      setNow(Date.now());
      maybeAnalyze();
      maybeGenerateMinutes();
      maybeScore();
    }, 1000);
    const slackTimer = setInterval(loadSlackOpen, 5000);
    loadSlackOpen();
    refreshDriveStatus();
    return () => {
      clearInterval(tickTimer);
      clearInterval(slackTimer);
    };
  }, [maybeAnalyze, maybeGenerateMinutes, maybeScore, loadSlackOpen, refreshDriveStatus]);

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
        flash(tr('toast.copied'));
      } catch {
        flash(tr('toast.copyFailed'));
      }
    },
    [flash],
  );

  // --- Thread / Slack actions ---
  const postToThread = useCallback(
    async (text) => {
      const tabId = latest.current.huddle?.tabId;
      if (!tabId || !chromeApi?.tabs) return flash(tr('toast.huddleWindowNotFound'));
      try {
        const result = await chromeApi.tabs.sendMessage(tabId, { type: 'thread:draft', text });
        if (!result?.ok) throw new Error(result?.error ?? 'sem resposta da janela do huddle');
        flash(tr('toast.threadDrafted'));
      } catch (error) {
        flash(tr('toast.threadFailed', { error: error.message }));
      }
    },
    [flash],
  );

  // Selects the huddle's Thread tab in Slack so the scanner can read the thread again.
  const openThread = useCallback(async () => {
    const tabId = latest.current.huddle?.tabId;
    if (!tabId || !chromeApi?.tabs) return flash(tr('toast.huddleWindowNotFound'));
    try {
      const result = await chromeApi.tabs.sendMessage(tabId, { type: 'thread:open' });
      if (!result?.ok) throw new Error(result?.error ?? 'sem resposta da janela do huddle');
    } catch (error) {
      flash(tr('toast.threadOpenFailed', { error: error.message }));
    }
  }, [flash]);

  const setThreadContext = useCallback((value) => {
    setSettings((prev) => {
      const next = { ...prev, threadContext: value };
      chromeApi?.storage.local.set({ settings: next }).catch(() => {});
      return next;
    });
  }, []);

  // Injects the capture scripts into a Slack tab that was open before the extension, so it
  // connects without a reload. `quiet` skips the success toast (used when going to Slack).
  const connectTab = useCallback(
    async (tabId, { quiet = false } = {}) => {
      try {
        const res = await chromeApi.runtime.sendMessage({ type: 'connect:tab', tabId });
        if (!res?.ok) throw new Error(res?.error ?? 'sem resposta do serviço');
        if (!quiet) flash(tr('toast.tabConnected'));
        loadSlackOpen();
        return true;
      } catch (error) {
        flash(tr('toast.tabConnectFailed', { error: error.message }));
        return false;
      }
    },
    [flash, loadSlackOpen],
  );

  // Brings a Slack tab forward (the one not connected yet, if any) and always leaves it connected:
  // a tab opened here gets the content scripts from the manifest; an existing one that doesn't
  // answer the ping gets them injected.
  const goToSlack = useCallback(async () => {
    if (!chromeApi?.tabs) return;
    const tabs = await chromeApi.tabs.query({ url: 'https://app.slack.com/*' });
    const t = tabs.find((tab) => tab.id === slackReloadTabId) ?? tabs[0];
    if (!t) {
      await chromeApi.tabs.create({ url: 'https://app.slack.com/' });
      return;
    }
    await chromeApi.tabs.update(t.id, { active: true });
    await chromeApi.windows.update(t.windowId, { focused: true });
    const pong = await chromeApi.tabs.sendMessage(t.id, { type: 'huddle:ping' }).catch(() => null);
    if (!pong?.ok && chromeApi.runtime) await connectTab(t.id, { quiet: true });
  }, [slackReloadTabId, connectTab]);

  const reloadSlackTab = useCallback(async () => {
    if (slackReloadTabId == null) return goToSlack();
    try {
      await chromeApi.tabs.reload(slackReloadTabId);
      await chromeApi.tabs.update(slackReloadTabId, { active: true });
      const t = await chromeApi.tabs.get(slackReloadTabId);
      if (t?.windowId != null) await chromeApi.windows.update(t.windowId, { focused: true });
      flash(tr('toast.slackReloaded'));
    } catch (error) {
      flash(tr('toast.slackReloadFailed', { error: error.message }));
    }
  }, [slackReloadTabId, goToSlack, flash]);

  // Conecta à aba do Slack já aberta injetando os scripts de captura, sem recarregar
  // a página. O usuário só precisa reabrir o huddle para o hook capturar.
  const connectSlackTab = useCallback(async () => {
    if (slackReloadTabId == null || !chromeApi?.runtime) return goToSlack();
    await connectTab(slackReloadTabId);
  }, [slackReloadTabId, goToSlack, connectTab]);

  // --- Alerts ---
  const acceptAlert = useCallback((alert) => {
    setAcked((prev) => new Set(prev).add(alert.text));
    if (alert.kind === 'action') setDone((prev) => {
      const next = new Set(prev);
      next.delete(alert.text);
      return next;
    });
    flash(alert.kind === 'action' ? tr('toast.actionAccepted') : tr('toast.alertSeen'));
  }, [flash]);

  // Live: a toast for each alert the analysis brings in, so it is noticed even on another tab or
  // with the list scrolled. Alerts already there when a huddle loads (or the panel reopens) stay quiet.
  const alertsKnown = useRef({ huddleId: null, texts: new Set() });
  useEffect(() => {
    const list = currentInsights?.data.alerts ?? [];
    const huddleId = huddle?.id ?? null;
    if (alertsKnown.current.huddleId !== huddleId) {
      alertsKnown.current = { huddleId, texts: new Set(list.map((a) => a.text)) };
      return;
    }
    const fresh = list.filter((a) => !alertsKnown.current.texts.has(a.text));
    for (const a of fresh) alertsKnown.current.texts.add(a.text);
    if (!fresh.length || !huddle?.active || !settings.detect.alerts) return;
    flash(
      fresh.length === 1
        ? `${tr(`alert.${fresh[0].kind}.title`)}: ${fresh[0].text}`
        : tr('toast.newAlerts', { n: fresh.length }),
    );
  }, [currentInsights, huddle?.id, huddle?.active, settings.detect.alerts, flash]);

  const acceptAllAlerts = useCallback((alerts) => {
    setAcked((prev) => {
      const next = new Set(prev);
      for (const alert of alerts) next.add(alert.text);
      return next;
    });
    flash(tr('toast.alertSeen'));
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

  const markSeen = useCallback(
    (key) =>
      setSeen((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      }),
    [],
  );
  // Mark every key of a section as seen at once (additive — never unmarks), so "marcar todos"
  // also covers cards not currently visible.
  const markAllSeen = useCallback(
    (keys) =>
      setSeen((prev) => {
        const next = new Set(prev);
        for (const k of keys) next.add(k);
        return next;
      }),
    [],
  );
  const toggleShowAllSeen = useCallback(() => setShowAllSeen((v) => !v), []);

  // Remove um card de vez (o usuário decidiu que não precisa dele). Guardado por chave de texto, como
  // o "visto", mas sem volta.
  const removeItem = useCallback(
    (key) =>
      setRemoved((prev) => {
        const next = new Set(prev);
        next.add(key);
        return next;
      }),
    [],
  );

  // Corrige (ou limpa) o nome de um participante. Corrigido vazio ou igual ao original remove a
  // correção.
  const renamePerson = useCallback(
    (original, corrected) =>
      setNameOverrides((prev) => {
        const next = { ...prev };
        if (!corrected || corrected === original) delete next[original];
        else next[original] = corrected;
        chromeApi?.storage.local.set({ nameOverrides: next }).catch(() => {});
        return next;
      }),
    [],
  );

  // A name fixed after the minutes were generated also fixes their participant list (the minutes'
  // text keeps the old spelling until they are regenerated).
  useEffect(() => {
    const { minutes: record, huddle: h, utterances: u } = latest.current;
    if (!record || record.huddleId !== h?.id || !u.length) return;
    const participants = participantsOf(u, nameOverrides);
    if (JSON.stringify(participants) === JSON.stringify(record.meta.participants)) return;
    const next = { ...record, meta: { ...record.meta, participants } };
    setMinutes(next);
    chromeApi?.storage.session.set({ minutes: next }).catch(() => {});
    saveMinutesToHistory(next).catch(() => {});
  }, [nameOverrides, saveMinutesToHistory]);

  // Liga/desliga o empilhamento (deck) de uma seção de insight.
  const toggleDeckSection = useCallback(
    (key) =>
      setDeckSections((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      }),
    [],
  );
  // Toggle global do info bar: se há qualquer seção empilhada, desfaz todos os decks; senão, empilha
  // todas as seções de uma vez.
  const toggleAllDecks = useCallback(
    () => setDeckSections((prev) => (prev.size > 0 ? new Set() : new Set(DECK_SECTION_KEYS))),
    [],
  );

  // Resolve a caption badge (transcript line + kind) to the matching insight item and open it in a
  // dialog. Decisions/actions/questions carry their line; falls back to the caption text if none.
  const onMarkClick = useCallback((line, kind) => {
    const data = latest.current.currentInsights?.data;
    // Prefer the AI-generated insight item of this kind: the one on the exact line, else the one on
    // the nearest line, else the first of its kind — so the dialog shows the insight text, not the
    // raw caption. Only when no item of this kind exists do we fall back to the spoken line.
    const pick = (items) => {
      if (!items.length) return null;
      const withLine = items.filter((x) => x.line > 0);
      if (!withLine.length) return items[0];
      return (
        withLine.find((x) => x.line === line) ??
        withLine.reduce((best, x) => (Math.abs(x.line - line) < Math.abs(best.line - line) ? x : best))
      );
    };
    let item = null;
    if (data && kind === 'question') {
      const q = pick(data.open_questions ?? []);
      if (q) item = { label: tr('mark.label.question'), icon: 'question', tone: 'yellow', text: q.answer ? `${q.text}\n\n${q.answer}` : q.text, key: q.text };
    } else if (data && kind === 'decision') {
      const d = pick((data.decisions ?? []).map((x) => (typeof x === 'string' ? { text: x, line: 0 } : x)));
      if (d) item = { label: tr('mark.label.decision'), icon: 'check', tone: 'green', text: d.text, key: d.text };
    } else if (data && kind === 'action') {
      const a = pick(data.actions ?? []);
      if (a) item = { label: tr('mark.label.action'), icon: 'bolt', tone: 'green', text: a.text, owner: a.owner || '', key: a.text };
    }
    if (!item) {
      const labels = { action: tr('mark.label.action'), decision: tr('mark.label.decision'), question: tr('mark.label.question') };
      const icons = { action: 'bolt', decision: 'check', question: 'question' };
      const tones = { action: 'green', decision: 'green', question: 'yellow' };
      const text = latest.current.utterances[line - 1]?.text ?? '';
      item = { label: labels[kind] ?? tr('mark.label.detected'), icon: icons[kind] ?? 'bulb', tone: tones[kind] ?? 'blue', text, key: text };
    }
    setMarkDialog(item);
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
        flash(tr('toast.driveUploaded'));
      } catch (error) {
        logEvent('error', `Falha ao enviar ao Drive: ${error.message}`);
        flash(tr('toast.driveUploadFailed', { error: error.message }));
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
      setNotice(next.email ? tr('toast.driveConnectedEmail', { email: next.email }) : tr('toast.driveConnected'));
    } catch (error) {
      setNotice(error.message);
    } finally {
      setDriveConnecting(false);
    }
  }, []);

  const disconnectDrive = useCallback(async () => {
    await drive.disconnect();
    setDriveState({ connected: false, email: null });
    setNotice(tr('toast.driveDisconnected'));
  }, []);

  // --- Settings ---
  const saveSettings = useCallback(async (next) => {
    setSettings(next);
    analysisCtl.current.lastKey = '';
    analysisCtl.current.lastCount = 0; // settings mudaram: reanalisa a transcrição inteira
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
    setNotice(tr('toast.historyCleared'));
  }, []);

  const clearLogs = useCallback(async () => {
    await chromeApi?.storage.session.remove('logs');
  }, []);

  const runDiagnostics = useCallback(async () => {
    const tabId = latest.current.huddle?.tabId ?? (await chromeApi?.tabs.query({ url: 'https://app.slack.com/*' }))?.[0]?.id;
    if (!tabId) {
      setNotice(tr('toast.noSlackTab'));
      return;
    }
    try {
      const dump = await chromeApi.tabs.sendMessage(tabId, { type: 'debug:dump' });
      if (!dump) throw new Error('sem resposta; recarregue a aba do Slack');
      await navigator.clipboard.writeText(JSON.stringify(dump, null, 2));
      setNotice(
        dump.huddle
          ? tr('toast.diagHuddle', {
              captions: dump.captionsFound ? tr('toast.diagFound') : tr('toast.diagNotFound'),
              rows: dump.rows,
            })
          : tr('toast.diagNoHuddle', { popups: dump.popupsTracked }),
      );
    } catch (error) {
      setNotice(tr('toast.diagReadFailed', { error: error.message }));
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

  const analyzeOnce = useCallback(
    async (huddleId) => {
      const s = latest.current.settings;
      if (!hasKeyForModel(s) || analysisCtl.current.running) return;
      analysisCtl.current.running = true;
      setAnalysisRunning(true);
      setAnalysisError(null);
      const ctrl = new AbortController();
      analysisCtl.current.ctrl = ctrl;
      try {
        const data = await analyze({
          settings: s,
          utterances: latest.current.utterances,
          previous: null,
          nameOverrides: latest.current.nameOverrides,
          abortSignal: ctrl.signal,
          onPartial: (d) => applyPartial(huddleId, d),
        });
        if (latest.current.huddle?.id !== huddleId) return;
        const record = { huddleId, updatedAt: Date.now(), data };
        setInsights(record);
        completedHuddle.current = huddleId;
        analysisCtl.current.lastCount = latest.current.utterances.length;
        await chromeApi?.storage.session.set({ insights: record });
        await saveInsightsToHistory(huddleId, data);
      } catch (error) {
        if (ctrl.signal.aborted) return;
        setAnalysisError(error.message);
        logEvent('error', `Falha na análise da importação: ${error.message}`);
      } finally {
        if (analysisCtl.current.ctrl === ctrl) analysisCtl.current.ctrl = null;
        analysisCtl.current.running = false;
        setAnalysisRunning(false);
      }
    },
    [saveInsightsToHistory, applyPartial],
  );

  const importSession = useCallback(
    async ({ title, date, text }) => {
      const utt = parseTranscript(text);
      if (utt.length === 0) {
        setImportError(tr('toast.importEmpty'));
        return;
      }
      const ts = sessionTimestamp(date);
      const span = utt.at(-1).at || (utt.length - 1) * 1000;
      const hud = {
        id: `import-${ts.toString(36)}`,
        title: title || tr('session.importedTitle'),
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
      setScores(null);
      await chromeApi?.storage.session.set({ state: nextState });
      await chromeApi?.storage.session.remove(['insights', 'minutes', 'scores']);
      await archiveImported(hud, utt);
      analysisCtl.current.lastKey = `${hud.id}:${utt.length}:${utt.at(-1)?.text.length ?? 0}`;
      setAnalysisError(null);
      minutesCtl.current.failedFor = null;
      setMinutesError(null);
      setImportOpen(false);
      setTab('insights');
      logEvent('info', `Transcrição importada: ${utt.length} falas, ${new Set(utt.map((u) => u.speaker)).size} participantes`);
      if (!hasKeyForModel(latest.current.settings)) {
        flash(tr('toast.importedNeedKey'));
        return;
      }
      flash(tr('toast.importedGenerating'));
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
        flash(tr('toast.sessionAlreadyLoaded'));
        return;
      }
      const entry = history.find((item) => (item.huddle?.id ?? item.minutes?.huddleId) === record.huddleId);
      if (!entry?.huddle) {
        flash(tr('toast.sessionDataMissing'));
        return;
      }
      const hud = { ...entry.huddle, active: false, archived: true, loaded: true };
      const nextState = { huddle: hud, utterances: entry.utterances ?? [], thread: entry.thread ?? null };
      const nextInsights = entry.insights
        ? { huddleId: hud.id, updatedAt: entry.minutes?.generatedAt ?? Date.now(), data: entry.insights }
        : null;
      const nextMinutes = entry.minutes ?? null;
      const nextScores = entry.scores ?? null;
      const nextChats = { huddleId: hud.id, list: entry.chats ?? [] };

      await chromeApi?.storage.session.set({ state: nextState });
      if (nextInsights) await chromeApi?.storage.session.set({ insights: nextInsights });
      else await chromeApi?.storage.session.remove('insights');
      if (nextMinutes) await chromeApi?.storage.session.set({ minutes: nextMinutes });
      else await chromeApi?.storage.session.remove('minutes');
      if (nextScores) await chromeApi?.storage.session.set({ scores: nextScores });
      else await chromeApi?.storage.session.remove('scores');
      await chromeApi?.storage.session.set({ chats: nextChats });

      setExtState(nextState);
      setInsights(nextInsights);
      setMinutes(nextMinutes);
      setScores(nextScores);
      setChats(nextChats);
      setActiveChatId(nextChats.list[0]?.id ?? null);
      analysisCtl.current.lastKey = `${hud.id}:${nextState.utterances.length}:${nextState.utterances.at(-1)?.text.length ?? 0}`;
      setAnalysisError(null);
      minutesCtl.current.failedFor = null;
      setMinutesError(null);
      setViewingAta(null);
      setAtasOpen(false);
      setAtasQuery('');
      setTab('insights');
      flash(tr('toast.sessionLoaded'));
    },
    [history, flash, tr],
  );

  // --- Análise geral (overlay pelo botão do cabeçalho) ---
  const openAnalytics = useCallback(() => {
    setAnalyticsOpen(true);
    setAtasOpen(false);
    setViewingAta(null);
    setImportOpen(false);
  }, []);
  const closeAnalytics = useCallback(() => setAnalyticsOpen(false), []);
  // Clicar numa sessão na Análise geral: carrega a sessão e abre a aba Análise dela.
  const openSessionAnalytics = useCallback(
    async (huddleId) => {
      setAnalyticsOpen(false);
      await loadSession({ huddleId });
      setTab('analytics');
    },
    [loadSession],
  );

  // Volta para a página principal (o estado em que a extensão abre): descarrega a sessão que estava
  // sendo vista e fecha os overlays. Um huddle ao vivo volta a se preencher sozinho na próxima fala.
  const goHome = useCallback(async () => {
    setChatOpen(false);
    setViewingAta(null);
    setAtasOpen(false);
    setImportOpen(false);
    setExtState(EMPTY_STATE);
    setInsights(null);
    setMinutes(null);
    setScores(null);
    await chromeApi?.storage.session.set({ state: EMPTY_STATE });
    await chromeApi?.storage.session.remove(['insights', 'minutes', 'scores']);
    setTab('insights');
  }, []);

  // --- Context recall: a look-back question in the live transcript ("o que decidimos na reunião
  // passada sobre X?") triggers the recall subagent over past session summaries; the answer shows
  // as a context suggestion in Insights. Cards reset when the huddle changes. ---
  useEffect(() => {
    analysisCtl.current.ctrl?.abort(); // descarta análise em voo da sessão anterior
    completedHuddle.current = null; // novo huddle volta a usar streaming no primeiro preenchimento
    analysisCtl.current.lastCount = 0; // novo huddle: próxima análise manda a transcrição inteira
    contextSeen.current = new Set();
    setContextCards([]);
    setContextDismissed(new Set());
  }, [huddle?.id]);

  // Aborta qualquer análise em andamento ao desmontar o painel.
  useEffect(() => () => analysisCtl.current.ctrl?.abort(), []);

  useEffect(() => {
    if (!settings.detect.context || !hasKeyForModel(settings) || !pastSessions.length) return;
    const queries = currentInsights?.data?.context_queries ?? [];
    // All look-back questions new this cycle. They are answered in ONE recallContextBatch call
    // instead of one recallContext call per question, so a cycle that surfaces several of them
    // pays a single round-trip. contextSeen/contextDismissed still gate each key to fire once.
    const fresh = [];
    for (const q of queries) {
      const key = q.text.trim().toLowerCase();
      if (!key || contextSeen.current.has(key) || contextDismissed.has(key)) continue;
      contextSeen.current.add(key);
      fresh.push({ key, query: q.text, about: q.about, line: q.line });
    }
    if (!fresh.length) return;
    setContextCards((prev) => [...prev, ...fresh.map((f) => ({ ...f, status: 'loading', at: Date.now() }))]);
    const sessions = pastSessions;
    logEvent('info', `Buscando contexto em ${sessions.length} sessões: ${fresh.length} pergunta(s)`);
    recallContextBatch({ settings, sessions, queries: fresh.map((f) => f.query) })
      .then((results) => {
        const hits = results.filter((r) => r.found).length;
        logEvent('info', `Contexto: ${hits} de ${fresh.length} pergunta(s) respondida(s)`);
        setContextCards((prev) =>
          prev.map((c) => {
            const i = fresh.findIndex((f) => f.key === c.key);
            if (i < 0 || c.status !== 'loading') return c;
            const r = results[i] ?? { found: false, answer: '', sources: [] };
            if (r.error) return { ...c, status: 'error', error: r.error };
            return { ...c, status: r.found ? 'done' : 'empty', result: r };
          }),
        );
      })
      .catch((error) => {
        logEvent('error', `Falha na busca de contexto: ${error.message}`);
        const keys = new Set(fresh.map((f) => f.key));
        setContextCards((prev) => prev.map((c) => (keys.has(c.key) && c.status === 'loading' ? { ...c, status: 'error', error: error.message } : c)));
      });
  }, [currentInsights, pastSessions, settings, contextDismissed]);

  const dismissContext = useCallback((key) => {
    setContextDismissed((prev) => new Set(prev).add(key));
    setContextCards((prev) => prev.filter((c) => c.key !== key));
  }, []);

  const openContextSource = useCallback((id) => loadSession({ huddleId: id }), [loadSession]);

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
      flash(tr('toast.sessionDeleted'));
    },
    [flash, tr],
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
  // Closing a tab moves to the chat before it (or the next one); with none left, a fresh chat.
  const closeChat = useCallback((id) => {
    const nextId = chatAfterClose(chats.list, id, activeChatId);
    if (nextId !== activeChatId) setActiveChatId(nextId);
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
  }, [chats.list, activeChatId]);
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
      flash(tr('toast.chatNeedKey'));
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
    setChatStream({ chatId: chat.id, text: '', steps: [] });

    if (firstQuestion && /^Chat \d+$/.test(chat.title)) nameChat(chat.id, question);
    logEvent('info', `Pergunta ao huddle (${latest.current.utterances.length} falas)`);
    const steps = [];
    try {
      const answer = await askMeeting({
        settings: latest.current.settings,
        utterances: latest.current.utterances,
        history: histTurns,
        question,
        sessions: latest.current.pastSessions,
        thread: latest.current.threadForAI,
        onText: (delta) => setChatStream((s) => (s?.chatId === chat.id ? { ...s, text: s.text + delta } : s)),
        onStep: (step) => {
          steps.push(step);
          setChatStream((s) => (s?.chatId === chat.id ? { ...s, steps: [...steps] } : s));
        },
        log: logEvent,
      });
      appendMessage(chat.id, { role: 'assistant', text: answer, ...(steps.length && { steps }) });
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

  // Opens the chat on a fresh thread asking the model to expand on one insight item (a point,
  // decision, action, question, reference…). Posts the question and streams the answer right away.
  const askInChat = useCallback(
    async (question) => {
      if (!question) return;
      setChatOpen(true);
      if (!hasKeyForModel(latest.current.settings)) {
        flash(tr('toast.chatNeedKey'));
        return;
      }
      const chat = newChat();
      setChats((prev) => ({
        ...prev,
        list: [...prev.list, { ...chat, title: `Chat ${prev.list.length + 1}`, messages: [{ role: 'user', text: question }] }],
      }));
      setActiveChatId(chat.id);
      setChatBusy((b) => new Set(b).add(chat.id));
      setChatStream({ chatId: chat.id, text: '', steps: [] });
      nameChat(chat.id, question);
      logEvent('info', `Pergunta no chat (${latest.current.utterances.length} falas)`);
      const steps = [];
      try {
        const answer = await askMeeting({
          settings: latest.current.settings,
          utterances: latest.current.utterances,
          history: [],
          question,
          sessions: latest.current.pastSessions,
          thread: latest.current.threadForAI,
          onText: (delta) => setChatStream((s) => (s?.chatId === chat.id ? { ...s, text: s.text + delta } : s)),
          onStep: (step) => {
            steps.push(step);
            setChatStream((s) => (s?.chatId === chat.id ? { ...s, steps: [...steps] } : s));
          },
          log: logEvent,
        });
        appendMessage(chat.id, { role: 'assistant', text: answer, ...(steps.length && { steps }) });
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
    },
    [appendMessage, nameChat, flash],
  );

  // Expand one insight item (point, decision, action, question…) in a fresh chat.
  const askAboutInsight = useCallback(
    (topic) => {
      const text = String(topic ?? '').trim();
      if (!text) return;
      const build = ASK_DETAIL_PROMPT[latest.current.settings.language] ?? ASK_DETAIL_PROMPT.English;
      askInChat(build(text));
    },
    [askInChat],
  );

  // Ask the chat for a summary of the huddle's Slack thread.
  const summarizeThread = useCallback(() => {
    const q = SUMMARIZE_THREAD_PROMPT[latest.current.settings.language] ?? SUMMARIZE_THREAD_PROMPT.English;
    askInChat(q);
  }, [askInChat]);

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
  // Every screen is wrapped so the whole UI renders in the language chosen in Settings; components
  // read it via useT()/context. The model-output language is unchanged (handled in insights.js).
  const screen = (node) => <I18nProvider lang={settings.language}>{node}</I18nProvider>;
  // Telas sem huddle ao vivo não têm layout multi-coluna: num painel largo,
  // ficam limitadas à largura de um painel e centralizadas (.screen).
  if (logsOpen) {
    return screen(
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
    return screen(
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
    return screen(<ImportView error={importError} hasKey={hasKeyForModel(settings)} onSubmit={importSession} onCancel={() => setImportOpen(false)} />);
  }
  if (viewingAta) {
    return screen(
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
    return screen(
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
  if (analyticsOpen) {
    return screen(
      <div className="screen">
        <main className="main main--analytics" id="main">
          <AnaliseView
            records={allScores}
            hasKey={hasKeyForModel(settings)}
            onOpenSettings={openSettings}
            onOpenSession={openSessionAnalytics}
            onClose={closeAnalytics}
          />
        </main>
      </div>,
    );
  }
  if (!huddle) {
    return screen(
      <div className="screen">
        <Header
          huddle={null}
          version={version()}
          chatOpen={false}
          now={now}
          onReturnToSlack={!onSlackTab && slackOpen ? goToSlack : undefined}
          onOpenAtas={openAtas}
          onOpenAnalytics={openAnalytics}
          onToggleChat={toggleChat}
          onOpenLogs={openLogs}
          onOpenSettings={openSettings}
        />
        <IdleView
          onSlackTab={onSlackTab}
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
  // How many of the insight cards currently shown have been marked as seen (so the "ver todos"
  // toggle can show a count of what is hidden). Plain compute — this runs below the early returns,
  // so it must not be a hook.
  const seenKeys = currentInsights
    ? [
        ...(currentInsights.data.points ?? []).map((p) => (typeof p === 'string' ? p : p.text)),
        ...(currentInsights.data.decisions ?? []).map((d) => (typeof d === 'string' ? d : d.text)),
        ...(currentInsights.data.open_questions ?? []).map((q) => q.text),
        ...(currentInsights.data.actions ?? []).map((a) => a.text),
        ...(currentInsights.data.replies ?? []).map((r) => r.text),
        ...(currentInsights.data.suggestions ?? []),
        ...(currentInsights.data.references ?? []).map((r) => r.title),
        ...(currentInsights.data.acronyms ?? []).map((a) => a.term),
      ]
    : [];
  const hiddenSeen = seenKeys.filter((k) => seen.has(k) && !removed.has(k)).length;
  // Participantes: os falantes das legendas (verdade do Slack, sem repetir). É o que a seção
  // Participantes mostra para o usuário corrigir a grafia do nome.
  const peopleList = [...new Set(utterances.map((u) => u.speaker).filter(Boolean))];
  const copySummary = () => currentInsights && copyToClipboard(insightsAsText(currentInsights.data, settings.detect));
  const postSummary = () => currentInsights && postToThread(insightsAsText(currentInsights.data, settings.detect));

  // Props da barra de informação — iguais para qualquer seção; a InfoBar usa só
  // o que importa para a aba que recebe.
  const infoBarProps = {
    settings,
    analysis: { running: analysisRunning, error: analysisError },
    analysisPaused,
    analysisLastRunAt,
    onTogglePause: () => setAnalysisPaused((v) => !v),
    huddle,
    now,
    utteranceCount: utterances.length,
    currentMinutes,
    minutesRunning,
    canCopySummary,
    canPostSummary,
    onCopySummary: copySummary,
    onPostSummary: postSummary,
    canPostMinutes: !!currentMinutes && !!huddle?.active,
    onPostMinutes: () => currentMinutes && postToThread(minutesAsText(currentMinutes, 'slack')),
    onAnalyzeNow: analyzeNow,
    onReanalyze: reanalyze,
    tickerHidden,
    hasRecent: recentUtterances.length > 0,
    onToggleTicker: () => setTickerHidden((v) => !v),
    showAllSeen,
    hiddenSeen,
    onToggleShowAll: toggleShowAllSeen,
    anyDecked: deckSections.size > 0,
    onToggleAllDecks: toggleAllDecks,
    onOpenSettings: openSettings,
    onDownloadTranscript: downloadTranscript,
    onCopyCaptions: () => copyToClipboard(formatTranscript(utterances)),
    onRegenerate: runMinutes,
    onOpenAtas: openAtas,
    onCopyMinutes: () => currentMinutes && copyToClipboard(minutesAsText(currentMinutes)),
    onDriveMinutes: currentMinutes ? () => uploadToDrive(currentMinutes) : undefined,
    minutesUploaded: currentMinutes?.drive ?? null,
    minutesDriveBusy: !!currentMinutes && driveBusy === currentMinutes.huddleId,
  };

  // Aba Análise: pontua a reunião só quando encerrada, com transcrição e chave disponíveis.
  const canScore = !!huddle && !huddle.active && hasKeyForModel(settings) && utterances.length >= MIN_UTTERANCES_FOR_MINUTES;
  const analyticsProps = {
    scores: currentScores,
    records: allScores,
    canScore,
    scoring: scoringRunning,
    scoreError,
    hasKey: hasKeyForModel(settings),
    onScore: runScoring,
    onOpenSettings: openSettings,
  };

  // Conteúdo de uma seção — os painéis em si não mudam com a largura.
  const panelContent = (section) => {
    if (section === 'analytics') {
      return <SessionAnalyticsView {...analyticsProps} />;
    }
    if (section === 'insights') {
      return (
        <>
          {huddle?.active && threadState !== 'none' && (
            <ThreadBar
              status={threadState}
              count={thread?.messages.length ?? 0}
              readAt={thread?.readAt}
              now={now}
              onOpen={openThread}
              onToggleContext={setThreadContext}
              onSummarize={summarizeThread}
            />
          )}
        <InsightsView
          current={currentInsights}
          settings={settings}
          huddle={huddle}
          utterances={utterances}
          now={now}
          acked={acked}
          done={done}
          contextCards={contextCards}
          topicExpanded={topicExpanded}
          onToggleTopic={() => setTopicExpanded((v) => !v)}
          onAcceptAlert={acceptAlert}
          onAcceptAllAlerts={acceptAllAlerts}
          onEditAlert={editAlert}
          onToggleDone={toggleDone}
          onDismissContext={dismissContext}
          onOpenContextSource={openContextSource}
          onOpenSettings={openSettings}
          onAskAI={askAboutInsight}
          seen={seen}
          showAllSeen={showAllSeen}
          onMarkSeen={markSeen}
          onMarkAllSeen={markAllSeen}
          removed={removed}
          onRemove={removeItem}
          people={peopleList}
          nameOverrides={nameOverrides}
          onRenamePerson={renamePerson}
          deckSections={deckSections}
          onToggleDeckSection={toggleDeckSection}
          threadState={huddle?.active ? threadState : 'none'}
          threadCount={thread?.messages.length ?? 0}
          onOpenThread={openThread}
        />
        </>
      );
    }
    if (section === 'captions') {
      return <CaptionsPanel utterances={utterances} huddle={huddle} marks={currentInsights?.data.marks ?? []} onMarkClick={onMarkClick} onAskAI={askAboutInsight} />;
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
      return currentMinutes && !minutesRunning ? (
        <AtaFooter record={currentMinutes} {...footerProps(currentMinutes)} showCopy={false} showDrive={false} />
      ) : null;
    }
    if (section === 'insights') {
      return (
        <footer className="footer footer--insights">
          {huddle?.active && !tickerHidden && recentUtterances.length > 0 && (
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
        <CaptionsPanel utterances={utterances} huddle={huddle} marks={currentInsights?.data.marks ?? []} onMarkClick={onMarkClick} onAskAI={askAboutInsight} />
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
          <CaptionsPanel utterances={utterances} huddle={huddle} marks={currentInsights?.data.marks ?? []} onMarkClick={onMarkClick} onAskAI={askAboutInsight} />
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
        {effTab === 'analytics' ? (
          <div className="panes panes--solo">{Pane('analytics')}</div>
        ) : effTab === 'ata' ? (
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

  return screen(
    <>
      <Header
        huddle={huddle}
        version={version()}
        chatOpen={chatOpen}
        now={now}
        onHome={huddle?.loaded ? goHome : undefined}
        onReturnToSlack={!onSlackTab && slackOpen ? goToSlack : undefined}
        onOpenAtas={openAtas}
        onOpenAnalytics={openAnalytics}
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
          streamSteps={chatStream?.chatId === activeChatId ? chatStream.steps : undefined}
          onSelectChat={selectChat}
          onCloseChat={closeChat}
          onAddChat={addChat}
          onToggleExpand={() => setChatExpanded((v) => !v)}
          onCloseDock={toggleChat}
          onDraftChange={(value) => activeChat && setDraft(activeChat.id, value)}
          onSubmit={sendChat}
        />
      )}
      {markDialog && (
        <MarkDialog
          label={markDialog.label}
          icon={markDialog.icon}
          tone={markDialog.tone}
          text={markDialog.text}
          owner={markDialog.owner}
          seenOn={seen.has(markDialog.key)}
          onAsk={() => {
            askAboutInsight(markDialog.key);
            setMarkDialog(null);
          }}
          onCopy={() => copyToClipboard(markDialog.text)}
          onSeen={() => markSeen(markDialog.key)}
          onClose={() => setMarkDialog(null)}
        />
      )}
    </>
  );
}

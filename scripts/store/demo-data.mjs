// Demo session used to render the Chrome Web Store screenshots in English.
// A fictional huddle about a billing gateway migration — no real meeting data. The shapes mirror
// what the extension stores in chrome.storage (see App.jsx boot): session.state / insights / minutes
// and local.settings. `makeState(now)` stamps every timestamp relative to a single "now" so the live
// clock, the "x min ago" labels and the countdown all line up when the panel is captured.

const MIN = 60 * 1000;
const HUDDLE_ID = 'demo-huddle';

// Elapsed seconds (mm:ss) -> ms, for utterance timestamps (huddle-relative).
const t = (mmss) => {
  const [m, s] = mmss.split(':').map(Number);
  return (m * 60 + s) * 1000;
};

const UTTERANCES = [
  { id: 'u1', speaker: 'Ana', text: "Okay, let's use this huddle to lock the billing gateway migration.", at: t('00:08') },
  { id: 'u2', speaker: 'Caio', text: 'Agreed — the main risk is the refund and compliance backlog.', at: t('00:52') },
  { id: 'u3', speaker: 'Ana', text: 'Great. So we decided to migrate to the new gateway this month.', at: t('01:42') },
  { id: 'u4', speaker: 'Bia', text: 'What about refunds? Who owns that?', at: t('02:37') },
  { id: 'u5', speaker: 'Lucas', text: 'I’ll take refunds. I can deliver by Friday.', at: t('03:17') },
  { id: 'u6', speaker: 'Caio', text: 'I need the provider SLA before we promise a production date.', at: t('04:07') },
  { id: 'u7', speaker: 'Ana', text: 'Note it: the SLA blocker is release-blocking for the final date.', at: t('04:47') },
  { id: 'u8', speaker: 'Bia', text: 'I’ll also loop in the PO about PCI compliance.', at: t('22:55') },
];

// The insights object (already in the normalized shape the UI renders).
const INSIGHTS_DATA = {
  topic: {
    title: 'Billing scope and gateway migration',
    summary:
      'The team aligns on migrating to the new payment gateway and splits the pending refund, SLA and compliance items.',
  },
  topics: [{ title: 'Billing scope', note: 'gateway migration', line: 1 }],
  points: [
    { text: 'The new gateway already passed the sandbox tests.', line: 2 },
    { text: 'Refunds still depend on the finance team’s sign-off.', line: 4 },
    { text: 'PCI compliance needs the PO’s review before go-live.', line: 8 },
  ],
  actions: [
    { text: 'Take over the refund flow and deliver by Friday.', owner: 'Lucas', line: 5 },
    { text: 'Confirm the provider SLA before promising a production date.', owner: 'Caio', line: 6 },
    { text: 'Loop in the PO about PCI compliance.', owner: 'Bia', line: 8 },
  ],
  decisions: [{ text: 'Migrate to the new payment gateway this month.', line: 3 }],
  open_questions: [{ text: 'What’s the provider’s SLA for the production date?', line: 6, answer: '' }],
  suggestions: ['Confirm the deploy window with the infra team before promising the date.'],
  replies: [],
  alerts: [{ kind: 'mention', text: 'The SLA blocker was flagged as release-blocking.', from: 'Ana', line: 7 }],
  references: [],
  acronyms: [
    { term: 'SLA', meaning: 'Service-level agreement' },
    { term: 'PCI', meaning: 'Payment Card Industry data security standard' },
  ],
  agenda: { items: [], current: -1 },
  focus: { on_agenda: true, since_line: 0 },
  marks: [
    { line: 3, kind: 'action' },
    { line: 5, kind: 'action' },
    { line: 7, kind: 'action' },
  ],
  context_queries: [],
};

const MINUTES_DATA = {
  classification: {
    category: 'Planning',
    confidence: 82,
    description:
      'Most of the conversation sets scope and sequencing for the gateway migration rather than reviewing delivery or metrics.',
  },
  signals: ['“let’s use this huddle to lock the migration”', '“we decided to migrate this month”'],
  tags: ['billing', 'payments', 'q4'],
  title: 'Billing gateway migration',
  summary:
    'Alignment on migrating to the new payment gateway. The team confirmed the decision to migrate this month, split the refund and compliance backlog, and flagged the provider SLA as release-blocking for the production date.',
  key_points: [
    'New gateway approved in the sandbox tests.',
    'Migration decided for this month.',
    'SLA blocker flagged as release-blocking for the final date.',
  ],
  decisions: ['Migrate to the new payment gateway this month.'],
  next_steps: [
    { text: 'Take over the refund flow and deliver by Friday.', owner: 'Lucas', due: 'Friday' },
    { text: 'Confirm the provider SLA before promising a production date.', owner: 'Caio', due: 'This week' },
    { text: 'Loop in the PO about PCI compliance.', owner: 'Bia', due: '' },
  ],
  open_questions: ['What’s the provider’s SLA for the production date?'],
  risks: ['The SLA blocker can push the production date.', 'PCI compliance still pending the PO’s review.'],
};

// Scored-meeting demo for the Analytics tab (lib/scoring.js shape; 0..3 per criterion).
const crit = (o) => Object.entries(o).map(([id, score]) => ({ id, score }));
const SCORES_DATA = {
  overall: crit({
    direcao: 2.6,
    decisoes: 2.4,
    execucao: 2.1,
    eficiencia: 2.3,
    diagnostico: 2.5,
    alinhamento: 2.7,
    proximos_passos: 2.2,
    engajamento: 2.0,
  }),
  summary:
    'A focused planning huddle with clear direction and strong alignment; execution and engagement have the most room to grow.',
  strengths: ['alinhamento', 'direcao'],
  improvements: [
    {
      criterion: 'engajamento',
      analysis: 'Ana and Caio drove most of the discussion while others mostly reacted.',
      action: 'Invite the quieter participants to weigh in before each decision is locked.',
    },
    {
      criterion: 'proximos_passos',
      analysis: 'One of the next steps was left without a clear due date.',
      action: 'Set an owner and a date for every action item before closing the huddle.',
    },
  ],
  participants: [
    {
      name: 'Ana',
      score: 2.7,
      criteria: crit({ direcao: 2.9, decisoes: 2.7, execucao: 2.4, eficiencia: 2.6, diagnostico: 2.6, alinhamento: 2.9, proximos_passos: 2.4, engajamento: 2.5 }),
      focus: 'proximos_passos',
      tip: 'Close each topic by naming the owner and the date out loud.',
      strengths: ['direcao', 'alinhamento'],
      improvements: [{ criterion: 'proximos_passos', analysis: 'Steered well but left one action undated.', action: 'Confirm dates before moving on.' }],
      prep: ['Bring a one-line goal for the huddle.', 'Keep a running list of decisions to recap at the end.'],
    },
    {
      name: 'Lucas',
      score: 2.2,
      criteria: crit({ direcao: 2.0, decisoes: 2.2, execucao: 2.5, eficiencia: 2.2, diagnostico: 2.1, alinhamento: 2.3, proximos_passos: 2.4, engajamento: 1.8 }),
      focus: 'engajamento',
      tip: 'Speak up on topics beyond your own area too.',
      strengths: ['execucao'],
      improvements: [{ criterion: 'engajamento', analysis: 'Engaged mainly on refunds.', action: 'Weigh in on the SLA and compliance items as well.' }],
      prep: ['Skim the agenda and note where you can contribute.'],
    },
    {
      name: 'Bia',
      score: 2.3,
      criteria: crit({ direcao: 2.2, decisoes: 2.3, execucao: 2.1, eficiencia: 2.4, diagnostico: 2.5, alinhamento: 2.4, proximos_passos: 2.2, engajamento: 2.3 }),
      focus: 'execucao',
      tip: 'Turn the compliance concern into a tracked task.',
      strengths: ['diagnostico'],
      improvements: [{ criterion: 'execucao', analysis: 'Raised PCI compliance but without a concrete next step.', action: 'Open a ticket and assign it.' }],
      prep: ['List open risks before the huddle.'],
    },
    {
      name: 'Caio',
      score: 2.4,
      criteria: crit({ direcao: 2.3, decisoes: 2.5, execucao: 2.2, eficiencia: 2.3, diagnostico: 2.7, alinhamento: 2.5, proximos_passos: 2.3, engajamento: 2.1 }),
      focus: 'eficiencia',
      tip: 'Timebox the deep-dives so the huddle keeps moving.',
      strengths: ['diagnostico', 'decisoes'],
      improvements: [{ criterion: 'eficiencia', analysis: 'Thorough on risks but spent long on the SLA detail.', action: 'Park deep-dives into a follow-up when they run long.' }],
      prep: ['Bring the provider SLA numbers ready to share.'],
    },
  ],
};

const PARTICIPANTS = ['Ana', 'Lucas', 'Bia', 'Caio'];

const SETTINGS = {
  apiKeys: { anthropic: 'sk-ant-demo', openai: '', google: '', groq: '', openrouter: '', cerebras: '', mistral: '' },
  model: 'claude-haiku-5-5',
  modelProvider: '',
  language: 'English',
  verbosity: 'normal',
  freq: 30,
  userName: 'You',
  detect: {
    actions: true,
    decisions: true,
    questions: true,
    suggestions: true,
    replies: false,
    alerts: true,
    references: true,
    acronyms: true,
    context: true,
  },
  saveHistory: true,
  autoMinutes: true,
  captionSource: 'auto',
};

// Builds the full stored state, with every timestamp anchored to `now` so the live clock reads ~23:00,
// the topic card reads "0s ago", the open question reads "19 min ago" and the minutes read
// "generated 2 min ago" at capture time.
export function makeState(now = Date.now()) {
  const startedAt = now - 23 * MIN;
  return {
    session: {
      state: {
        huddle: {
          id: HUDDLE_ID,
          active: true,
          startedAt,
          captions: true,
          language: 'English',
          title: 'Huddle in product-billing',
          tabId: 1,
        },
        utterances: UTTERANCES,
      },
      insights: { huddleId: HUDDLE_ID, updatedAt: now, data: INSIGHTS_DATA },
      minutes: {
        huddleId: HUDDLE_ID,
        generatedAt: now - 2 * MIN,
        model: '',
        meta: {
          title: 'Huddle in product-billing',
          startedAt,
          endedAt: now - 3000,
          source: 'Slack · #product-billing',
          participants: PARTICIPANTS,
          utterances: UTTERANCES.length,
        },
        data: MINUTES_DATA,
      },
      scores: {
        huddleId: HUDDLE_ID,
        generatedAt: now - 2 * MIN,
        model: '',
        meta: {
          title: 'Huddle in product-billing',
          startedAt,
          endedAt: now - 3000,
          source: 'Slack · #product-billing',
          participants: PARTICIPANTS,
          utterances: UTTERANCES.length,
        },
        data: SCORES_DATA,
      },
      logs: [],
      chats: { huddleId: HUDDLE_ID, list: [{ id: 'c-demo-1', title: 'Chat 1', messages: [] }] },
    },
    local: {
      settings: SETTINGS,
      history: [],
      modelMigration: 1,
    },
  };
}

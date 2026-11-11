// UI internationalization. The language the user picks in Settings (`settings.language`, stored as
// the English name, e.g. 'Portuguese') drives the whole interface, not only the language the model
// writes in. English is the source and the fallback: any key missing from a locale (or a locale we
// have no table for) renders in English, so a partial translation is always safe.
//
// Keys are stable dot-strings grouped by area. `translate(lang, key, vars)` resolves the string and
// interpolates `{name}` placeholders. React components read the current language from context via
// `useT()`; App.jsx (which owns the language) uses `translate()` directly for toasts.

import { createContext, useCallback, useContext, createElement } from 'react';
import { TRANSLATIONS } from './locales/index.js';

// The languages offered in Settings: [English name stored in settings.language, native label shown
// to the user]. The English name is what `settings.language` holds and what keys the translation
// tables below. Kept here (not in Settings.jsx) so i18n owns the single source of truth and can map
// legacy installs that saved the native label back to the English name.
export const LANGUAGES = [
  ['English', 'English'],
  ['Portuguese', 'Português'],
  ['Spanish', 'Español'],
  ['French', 'Français'],
  ['German', 'Deutsch'],
  ['Italian', 'Italiano'],
  ['Dutch', 'Nederlands'],
  ['Portuguese (Portugal)', 'Português (Portugal)'],
  ['Catalan', 'Català'],
  ['Galician', 'Galego'],
  ['Polish', 'Polski'],
  ['Czech', 'Čeština'],
  ['Slovak', 'Slovenčina'],
  ['Hungarian', 'Magyar'],
  ['Romanian', 'Română'],
  ['Swedish', 'Svenska'],
  ['Norwegian', 'Norsk'],
  ['Danish', 'Dansk'],
  ['Finnish', 'Suomi'],
  ['Greek', 'Ελληνικά'],
  ['Russian', 'Русский'],
  ['Ukrainian', 'Українська'],
  ['Turkish', 'Türkçe'],
  ['Arabic', 'العربية'],
  ['Hebrew', 'עברית'],
  ['Hindi', 'हिन्दी'],
  ['Bengali', 'বাংলা'],
  ['Indonesian', 'Bahasa Indonesia'],
  ['Malay', 'Bahasa Melayu'],
  ['Vietnamese', 'Tiếng Việt'],
  ['Thai', 'ไทย'],
  ['Filipino', 'Filipino'],
  ['Chinese (Simplified)', '简体中文'],
  ['Chinese (Traditional)', '繁體中文'],
  ['Japanese', '日本語'],
  ['Korean', '한국어'],
];

export const DEFAULT_LANGUAGE = 'English';

// English source strings. The keys here are the full set the UI can render; every locale table is a
// subset of these keys. `{name}` tokens are interpolated by `translate`.
export const STRINGS = {
  // Shared
  'common.back': 'Back',
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.close': 'Close',
  'common.clear': 'Clear',
  'common.copy': 'Copy',
  'common.send': 'Send',
  'common.collapse': 'Collapse',
  'common.expand': 'Expand',

  // Units (for pluralized counts)
  'unit.caption.one': 'caption',
  'unit.caption.other': 'captions',
  'unit.participant.one': 'participant',
  'unit.participant.other': 'participants',
  'unit.session.one': 'session',
  'unit.session.other': 'sessions',
  'unit.event.one': 'event',
  'unit.event.other': 'events',

  // Header
  'header.ended': 'Ended',
  'header.backToSlack': 'Back to Slack',
  'header.home': 'Home',
  'header.sessions': 'Previous sessions',
  'header.askMeeting': 'Ask the meeting',
  'header.chatAria': 'Chat with the meeting',
  'header.logs': 'Logs',
  'header.settings': 'Settings',

  // Tabs
  'tabs.aria': 'Sections',
  'tabs.insights': 'Insights',
  'tabs.captions': 'Captions',
  'tabs.ata': 'Minutes',

  // Info bar / summary actions
  'info.unstackAll': 'Unstack all decks',
  'info.stackAll': 'Stack all sections',
  'info.stackAllAria': 'Stack all sections into a deck',
  'info.resumeAuto': 'Resume automatic analysis',
  'info.pauseAuto': 'Pause automatic analysis',
  'info.hideSeen': 'Hide the seen ones',
  'info.showAll': 'Show all ({n} seen)',
  'info.hideSeenAria': 'Hide the seen cards',
  'info.showAllAria': 'Show all cards, including the seen ones',
  'info.analyzing': 'Analyzing…',
  'info.analyzeNow': 'Analyze now',
  'info.redoing': 'Redoing…',
  'info.redo': 'Redo this session’s insights',
  'info.redoAria': 'Redo the insights',
  'info.copySummary': 'Copy summary',
  'info.showRecent': 'Show latest captions',
  'info.hideRecent': 'Hide latest captions',
  'infobar.needKey': 'Add the API key for the chosen model to generate insights.',
  'infobar.configure': 'Configure',
  'infobar.sessionInsights': 'Insights for this session.',
  'infobar.paused': 'Analysis paused.',
  'infobar.analyzingEvery': 'Analyzing every {n}s.',
  'infobar.nextIn': 'Next analysis in {n}s.',
  'infobar.onNextUtterance': 'Analyzing on the next caption…',

  // Captions info bar
  'captions.enablePre': 'Captions not showing? Turn them on in the huddle (captions button) or in your ',
  'captions.slackPrefs': 'Slack preferences',
  'captions.enablePost': '.',
  'captions.readingLang': 'Reading {lang} captions from the huddle · {n} {unit}.',
  'captions.reading': 'Reading captions from the huddle · {n} {unit}.',
  'captions.copy': 'Copy captions',
  'captions.download': 'Download transcript',

  // Captions panel
  'mark.action': 'Action',
  'mark.decision': 'Decision',
  'mark.question': 'Question',
  'caption.now': 'now',
  'caption.viewMark': 'View {label}',
  'caption.markDetected': '{label} detected',
  'caption.askContext': 'Ask the AI for more context',
  'caption.askContextAria': 'Ask the AI for more context about this caption',
  'captions.ariaLabel': 'Captions',
  'captions.emptyTitle': 'No captions yet. They appear here as people speak.',
  'captions.emptyHintPre': 'Nothing showing even with the huddle open? Check that captions are enabled in the huddle or in your ',
  'captions.emptyHintPost': ' (Preferences › Audio & video).',
  'captions.followingLive': 'Following live',
  'captions.backToLive': 'Back to live',

  // Insights
  'insights.deckView': 'View as list',
  'insights.deckStack': 'Stack the cards',
  'insights.deckViewAria': 'View cards as a list',
  'insights.remove': 'Remove',
  'alert.mention.title': 'You were mentioned',
  'alert.mention.tag': 'mention',
  'alert.action.title': 'Action assigned to you',
  'alert.action.tag': 'action',
  'alert.question.title': 'Open question',
  'alert.question.tag': 'question',
  'alerts.title': 'Alerts for you',
  'toast.newAlerts': '{n} new alerts for you',
  'alert.edit': 'Edit',
  'alert.accept': 'Accept',
  'alert.ok': 'Ok',
  'copy.default': 'Copy',
  'copy.done': 'Copied',
  'ask.detail': 'Ask the AI for details',
  'seen.markAria': 'Mark as seen',
  'seen.unmark': 'Seen — click to unmark',
  'seen.unmarkAria': 'Seen, click to unmark',
  'seen.mark': 'Mark as seen',
  'seen.seen': 'Seen',
  'markAll.label': 'Mark all',
  'markAll.tip': 'Mark all as seen',
  'memory.searching': 'Searching the previous minutes…',
  'memory.failed': 'Could not search: {error}',
  'memory.none': 'No past meeting recorded this.',
  'memory.fromPast': 'from a previous meeting',
  'memory.fromPastMeetings': 'From past meetings',
  'qstate.reply': 'You can reply',
  'qstate.answered': 'Answered in the call',
  'qstate.memory': 'Maybe already decided',
  'qstate.open': 'Open',
  'q.answerInCall': 'answer said in the call',
  'q.readyReply': 'reply ready to paste',
  'copy.reply': 'Copy reply',
  'q.dismiss': 'Dismiss',
  'reply.suggested': 'Suggested reply',
  'suggestion.couldRaise': 'You could raise',
  'copy.question': 'Copy question',
  'section.questions': 'Questions',
  'action.label': 'Action',
  'action.done': 'Done',
  'action.markDone': 'Mark as done',
  'action.markNotDone': 'Mark as not done',
  'topic.timeline': 'What happened so far',
  'topic.now': 'Now: {title}',
  'topic.currentAria': 'Current topic',
  'topic.speakingNow': 'Speaking now',
  'topic.lastTopic': 'Last topic',
  'topic.hideTopics': 'Hide discussed topics',
  'topic.seeTopics': 'See discussed topics',
  'topic.drift': 'Off-topic for {n} min — away from the agenda',
  'person.correctNameOf': 'Correct {name}’s name',
  'person.clickToCorrect': 'Click to correct the name',
  'person.was': ' (was "{name}")',
  'person.correctName': 'Correct name',
  'section.people': 'Participants',
  'insights.needKeyEmpty': 'Set the API key for the chosen model to generate the insights.',
  'insights.configureKey': 'Configure key',
  'insights.generatingFirst': 'Generating the first insights…',
  'insights.appearAfter': 'Insights appear after the first captions.',
  'section.points': 'Points raised',
  'copy.point': 'Copy point',
  'section.actions': 'Actions',
  'section.decisions': 'Decisions',
  'copy.decision': 'Copy decision',
  'section.references': 'References mentioned',
  'section.acronyms': 'Acronyms',

  // Minutes (Ata)
  'ata.step.task': 'Task',
  'ata.meetingInfo': 'Meeting info',
  'ata.copy': 'Copy minutes',
  'ata.dateTime': 'Date and time',
  'ata.duration': 'Duration',
  'ata.ended': 'Ended',
  'ata.source': 'Source',
  'ata.classification': 'Classification',
  'ata.confidence': 'Confidence',
  'ata.confidenceAria': 'Confidence {n}%',
  'ata.signalsAria': 'Classification signals',
  'ata.signals': 'Classification signals',
  'ata.signalsIntro': 'Transcript excerpts that classify the meeting:',
  'ata.hideDetails': 'Hide details',
  'ata.whyClassified': 'See what led to this classification',
  'ata.tags': 'Tags',
  'ata.summary': 'Meeting summary',
  'ata.keyPoints': 'Key points',
  'ata.decisions': 'Decisions',
  'ata.nextSteps': 'Next steps',
  'ata.openQuestions': 'Open questions',
  'ata.risks': 'Risks and blockers',
  'ata.infoAria': 'Meeting info',
  'ata.classificationAria': 'Classification',
  'ata.tagsAria': 'Tags',
  'ata.summaryAria': 'Meeting summary',
  'ata.info.generating': 'Generating the minutes…',
  'ata.info.generated': 'Minutes generated {ago}.',
  'ata.info.generatedModel': 'Minutes generated {ago} · {model}.',
  'ata.info.auto': 'The minutes are generated automatically when the huddle ends.',
  'ata.info.manual': 'Generate the huddle minutes whenever you want.',
  'ata.generatingTip': 'Generating…',
  'ata.generate': 'Generate minutes',
  'ata.postThread': 'Post to thread',
  'ata.previous': 'Previous minutes',
  'drive.sendingAria': 'Sending to Google Drive',
  'drive.sentResend': 'Sent to Drive · resend',
  'drive.send': 'Send to Google Drive',
  'drive.resendAria': 'Resend to Google Drive',
  'ata.downloadMd': 'Download minutes as Markdown (.md)',
  'ata.downloadMdAria': 'Download minutes as Markdown',
  'drive.viewIn': 'View in Google Drive',
  'ata.empty.titleActive': 'The minutes come when the huddle ends',
  'ata.empty.titleEnded': 'The minutes for this huddle have not been generated yet',
  'ata.empty.desc': 'With date, duration, meeting classification, tags, summary, key points and next steps with owners.',
  'ata.empty.optionsAria': 'Minutes options',
  'ata.empty.genOnEnd': 'Generate on end',
  'ata.empty.genOnEndHint': 'As soon as the huddle window closes',
  'ata.empty.soFar': 'So far',
  'ata.empty.thisHuddle': 'In this huddle',
  'ata.empty.counts': '{n} {unit} · {m} {punit}',
  'ata.empty.needKey': 'Add your API key in settings to generate the minutes.',
  'ata.empty.generateNow': 'Generate minutes now',
  'ata.empty.seePrevious': 'See previous sessions',
  'ata.loading.reading': 'Reading {n} {uunit} from {m} {punit}',
  'ata.loading.classifying': 'Classifying the meeting',
  'ata.loading.writing': 'Writing summary and next steps',
  'ata.loading.progressAria': 'Progress',
  'ata.loading.title': 'Writing the huddle minutes',
  'ata.loading.note': 'It usually takes under a minute. Keep the panel open until it finishes; the minutes are saved.',

  // Previous sessions (Atas)
  'atas.title': 'Previous sessions',
  'atas.count': '{n} {unit}',
  'atas.import': 'Import transcript',
  'atas.searchPlaceholder': 'Search by tag, person or subject',
  'atas.searchAria': 'Search sessions',
  'atas.filterByTag': 'Filter by tag',
  'atas.deleteMessage': 'This session’s transcript, insights and minutes will be removed from this browser. This cannot be undone.',
  'atas.deleteTitle': 'Delete “{title}”?',
  'atas.deleteConfirm': 'Delete session',
  'atas.footerNote': 'Sessions stay only in this browser. Delete them in Settings › Privacy.',
  'atas.emptyNone': 'No sessions yet. They appear here at the end of each huddle.',
  'atas.emptyFilter': 'No sessions found for that filter.',
  'atas.menu.open': 'Open',
  'atas.menu.inApp': 'Already in the app',
  'atas.menu.load': 'Load',
  'atas.menu.delete': 'Delete',
  'atas.inApp': 'In app',
  'atas.groupLabelAria': 'Sessions',
  'session.title': 'Session',
  'session.load': 'Load session',
  'session.delete': 'Delete session',
  'session.deleteTitle': 'Delete this session?',

  // Chat
  'chat.thinking': 'Thinking',
  'chat.stepThreadSearch': 'Searched the thread for {query}',
  'chat.stepThreadLatest': 'Read the latest thread messages',
  'chat.stepMessage': '1 message',
  'chat.stepMessages': '{count} messages',
  'chat.withMeeting': 'Chat with the meeting',
  'chat.closeConversation': 'Close this conversation',
  'chat.closeNamed': 'Close {title}',
  'chat.new': 'New conversation',
  'chat.newAria': 'New chat',
  'chat.collapse': 'Collapse the chat',
  'chat.expand': 'Expand the chat',
  'chat.closeChat': 'Close the chat',
  'chat.closeChatAria': 'Close chat',
  'chat.emptyTitle': 'No messages yet',
  'chat.emptyHint': 'Ask about what has been said in the huddle so far.',
  'chat.placeholder': 'Ask a quick question',
  'chat.inputAria': 'Question for the meeting',
  'chat.send': 'Send question',

  // Idle
  'idle.noHuddle': 'No active huddle',
  'idle.enterHuddle': 'Join a huddle in Slack in the browser and open the {tab} tab. Insights show up here.',
  'idle.reloadHint': 'Already have a huddle going? Connect this tab and reopen the huddle — without reloading the page.',
  'idle.connectTab': 'Connect to this tab',
  'idle.orReload': 'or reload the tab',
  'idle.alreadyOpen': 'Huddle already open and nothing here? Reload the Slack tab (the huddle must be opened after the extension) and join again.',
  'idle.goToSlack': 'Go to Slack',
  'idle.import': 'Import transcript',
  'idle.previousCount': 'Previous sessions ({n})',
  'idle.privacy': 'Captions stay in your browser. Only the analyzed text is sent to the Anthropic API to generate the insights.',

  // Import
  'import.title': 'Import transcript',
  'import.intro': 'Paste here the transcript of a meeting that did not go through the extension. It becomes a session loaded in the app, with minutes and insights generated. Lines in the {fmt} format are split by person.',
  'import.introFmt': 'Name: caption',
  'import.titleLabel': 'Title (optional)',
  'import.titlePlaceholder': 'E.g.: Q4 planning',
  'import.dateLabel': 'Session date',
  'import.transcriptLabel': 'Transcript',
  'import.textPlaceholder': 'Ana: I think Lucas can handle billing.\nLucas: I can deliver by Friday.\n…',
  'import.willGenerate': 'Generates the minutes and insights.',
  'import.needKey': 'Add the API key to generate.',
  'import.submit': 'Import',

  // Logs
  'logs.title': 'Logs',
  'logs.count': '{n} {unit}',
  'logs.copyAll': 'Copy all logs',
  'logs.eventsAria': 'Events',
  'logs.copyEntry': 'Copy this event',
  'logs.empty': 'No events yet. Reload the Slack tab after reloading the extension for logs to start.',
  'logs.copy': 'Copy logs',

  // Recent ticker
  'ticker.aria': 'Latest captions',

  // Menu
  'menu.actions': 'Actions',

  // Settings
  'settings.title': 'Settings',
  'settings.intelligence': 'Intelligence',
  'settings.model': 'Model',
  'settings.modelHint': 'Anthropic, OpenAI, Google and providers with a free tier. The key used follows the provider.',
  'settings.custom': 'Custom…',
  'settings.provider': 'Provider',
  'settings.modelId': 'Model ID',
  'settings.modelIdPlaceholder': 'e.g.: gpt-5.5',
  'settings.apiKeys': 'API keys',
  'settings.keyCount': '{n} of {m}',
  'settings.keysHint': 'They stay only in this browser. Fill in the one for the chosen model’s provider.',
  'settings.keyConfigured': 'Configured',
  'settings.keyEmpty': 'Empty',
  'settings.language': 'Language',
  'settings.analyzeEvery': 'Analyze every',
  'settings.responseSize': 'Response length',
  'settings.responseSizeHint': 'Short keeps insights and answers lean, for quick reading during the meeting. Detailed allows more context.',
  'verbosity.short': 'Short',
  'verbosity.normal': 'Normal',
  'verbosity.detailed': 'Detailed',
  'settings.yourName': 'Your name in the huddle',
  'settings.yourNameHint': 'Used to single out the “Alerts for you” — mentions, actions and questions directed at you.',
  'settings.yourNamePlaceholder': 'How you appear in the captions',
  'settings.captions': 'Captions',
  'settings.captureHow': 'How to capture',
  'settings.captureHint': 'Automatic starts capturing as soon as captions turn on, without opening the Captions tab: it uses the panel when the tab is open (full transcript) and the captions over the videos when not. Applies when you reload the Slack tab.',
  'captionSource.auto': 'Automatic (recommended)',
  'captionSource.panel': 'Captions panel (Captions tab)',
  'captionSource.overlay': 'Captions over the videos',
  'settings.insights': 'Insights',
  'detect.alerts': 'Alerts for you (mentions, actions, questions)',
  'detect.actions': 'Actions and owners',
  'detect.decisions': 'Decisions',
  'detect.questions': 'Open questions',
  'detect.context': 'Context from past meetings',
  'detect.suggestions': 'Suggestions of what to say',
  'detect.replies': 'Suggested replies',
  'detect.references': 'References (books, apps, links)',
  'detect.acronyms': 'Acronyms mentioned',
  'settings.ata': 'Minutes',
  'settings.autoMinutes': 'Generate the minutes when the huddle ends',
  'settings.drive': 'Google Drive',
  'settings.driveConnectedEmail': 'Connected as {email}. ',
  'settings.driveConnectedNoEmail': 'Connected. ',
  'settings.driveConnectedSuffix': 'Send any huddle’s minutes to Drive from the cloud button on the Minutes tab.',
  'settings.driveDisconnected': 'Connect to send minutes to your Drive. The extension only accesses the files it creates itself (drive.file scope).',
  'settings.disconnect': 'Disconnect',
  'settings.driveOpening': 'Opening the Google window…',
  'settings.connectDrive': 'Connect Google Drive',
  'settings.privacy': 'Privacy',
  'settings.saveHistory': 'Save huddle and session history',
  'settings.clearHistory': 'Delete history',
  'settings.diagnostics': 'Diagnostics',
  'settings.viewLogs': 'View logs',

  // App toasts / notices
  'toast.copied': 'Copied.',
  'toast.copyFailed': 'Could not copy.',
  'toast.huddleWindowNotFound': 'Huddle window not found.',
  'toast.threadDrafted': 'Text placed in the huddle thread. Review and send it in Slack, then come back to the Captions tab.',
  'toast.threadFailed': 'Could not post to the thread: {error}',
  'toast.threadOpenFailed': 'Could not open the thread: {error}',
  'thread.title': 'Thread',
  'thread.live': '{count} messages · {ago}',
  'thread.stale': 'panel closed · copy {ago}',
  'thread.staleEmpty': 'open the Thread tab in Slack',
  'thread.empty': 'no messages',
  'thread.off': 'left out of the AI context',
  'thread.inContext': 'in AI context',
  'thread.summarize': 'Summarize the thread',
  'thread.open': 'Open thread',
  'thread.include': 'Include in AI context',
  'thread.exclude': 'Leave out of AI context',
  'toast.slackReloaded': 'Slack tab reloaded. If the huddle is in a separate window, reopen the huddle.',
  'toast.slackReloadFailed': 'Could not reload the Slack tab: {error}',
  'toast.tabConnected': 'Connected to this tab. Close and reopen the huddle (without reloading the page) to start capturing.',
  'toast.tabConnectFailed': 'Could not connect to the tab: {error}. Try reloading the tab.',
  'toast.actionAccepted': 'Action accepted.',
  'toast.alertSeen': 'Alert marked as seen.',
  'toast.driveUploaded': 'Minutes sent to Google Drive.',
  'toast.driveUploadFailed': 'Could not send to Drive: {error}',
  'toast.driveConnectedEmail': 'Connected as {email}.',
  'toast.driveConnected': 'Google Drive connected.',
  'toast.driveDisconnected': 'Google Drive disconnected.',
  'toast.historyCleared': 'History and sessions deleted.',
  'toast.noSlackTab': 'No Slack tab open.',
  'toast.diagHuddle': 'Huddle found, captions {captions}, {rows} captions. The diagnostics were copied to the clipboard.',
  'toast.diagFound': 'found',
  'toast.diagNotFound': 'not found',
  'toast.diagNoHuddle': 'No huddle window detected ({popups} windows tracked). Reload the Slack tab and open the huddle again.',
  'toast.diagReadFailed': 'Could not read Slack ({error}).',
  'toast.importEmpty': 'Paste the transcript into the text field to import.',
  'toast.importedNeedKey': 'Transcript imported. Add the API key to generate the minutes and insights.',
  'toast.importedGenerating': 'Transcript imported. Generating the minutes and insights…',
  'toast.sessionAlreadyLoaded': 'This session is already loaded in the app.',
  'toast.sessionDataMissing': 'Could not find the full data for this session.',
  'toast.sessionLoaded': 'Session loaded. Ask about it in the chat or check the tabs.',
  'toast.sessionDeleted': 'Session deleted.',
  'toast.chatNeedKey': 'Add the API key for the chosen model in settings to chat with the meeting.',

  // Mark dialog (built in App)
  'mark.label.question': 'Question',
  'mark.label.decision': 'Decision',
  'mark.label.action': 'Action',
  'mark.label.detected': 'Detected',

  // Imported session default title
  'session.importedTitle': 'Imported session',
};

// Per-locale translation tables live in ./locales/*.json, assembled in ./locales/index.js and
// re-exported here. English is the source (STRINGS above) and needs no table; missing keys fall
// back to English (see translate()).
export { TRANSLATIONS };

// settings.language stores the English language name (e.g. 'Portuguese'). Legacy installs may have
// saved the native label (e.g. 'Português'); map it back. Anything unknown falls to English.
const NATIVE_TO_ENGLISH = Object.fromEntries(LANGUAGES.map(([en, native]) => [native, en]));

export function resolveLocale(lang) {
  if (!lang) return DEFAULT_LANGUAGE;
  if (lang === DEFAULT_LANGUAGE || TRANSLATIONS[lang]) return lang;
  const mapped = NATIVE_TO_ENGLISH[lang];
  if (mapped && (mapped === DEFAULT_LANGUAGE || TRANSLATIONS[mapped])) return mapped;
  return DEFAULT_LANGUAGE;
}

function interpolate(template, vars) {
  return template.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
}

// Resolves a key for a language, falling back to English then to the key itself; interpolates
// {name} placeholders from `vars`.
export function translate(lang, key, vars) {
  const locale = resolveLocale(lang);
  const table = locale === DEFAULT_LANGUAGE ? STRINGS : TRANSLATIONS[locale] ?? {};
  let value = table[key];
  if (value == null) value = STRINGS[key];
  if (value == null) return key;
  return vars ? interpolate(value, vars) : value;
}

const I18nContext = createContext(DEFAULT_LANGUAGE);

export function I18nProvider({ lang, children }) {
  return createElement(I18nContext.Provider, { value: lang || DEFAULT_LANGUAGE }, children);
}

// Returns a bound `t(key, vars)` for the language currently in context (English when no provider).
export function useT() {
  const lang = useContext(I18nContext);
  return useCallback((key, vars) => translate(lang, key, vars), [lang]);
}

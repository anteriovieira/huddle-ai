import { useState } from 'react';
import { MODELS, PROVIDERS, PROVIDER_IDS, providerOf, hasKeyForModel } from '../lib/models.js';
import { LANGUAGES, useT } from '../lib/i18n.js';
import { Icon } from '../ui/Icon.jsx';
import { Select } from '../ui/primitives.jsx';
import { ConfirmDialog } from '../ui/ConfirmDialog.jsx';

const FREQUENCIES = [15, 30, 60];

// Section wrapper: a small uppercase label (icon + text, optional action) sitting ABOVE a rounded
// group of rows — the flat, grouped settings layout. The card head no longer lives inside the card.
function SettingsSection({ icon, title, action, children }) {
  return (
    <section className="set-section">
      <div className="set-label">
        <span className="set-label__main">
          <Icon name={icon} />
          <span className="set-label__text">{title}</span>
        </span>
        {action}
      </div>
      <div className="set-group">{children}</div>
    </section>
  );
}

// One row: title (+ optional description) on the left, a control on the right. `stack` drops the
// control to its own full-width line below the text (selects, segmented, inputs).
function SettingRow({ title, desc, control, aside, stack, titleFor, children }) {
  // When `titleFor` is set the title renders as a <label> bound to that control id, so clicking the
  // title toggles the control and the control gets an accessible name (used by the toggle rows).
  const titleNode = title
    ? titleFor
      ? (
          <label className="set-row__title" htmlFor={titleFor}>
            {title}
          </label>
        )
      : <div className="set-row__title">{title}</div>
    : null;
  return (
    <div className={stack ? 'set-row set-row--stack' : 'set-row'}>
      {(title || desc) && (
        <div className="set-row__main">
          {aside ? (
            <div className="set-row__head">
              {titleNode}
              {aside}
            </div>
          ) : (
            titleNode
          )}
          {desc && <div className="set-row__desc">{desc}</div>}
        </div>
      )}
      {control && <div className="set-row__control">{control}</div>}
      {children}
    </div>
  );
}

// A toggle row in the grouped style: title (+ desc) left, switch right.
function ToggleRow({ id, title, desc, checked, onChange }) {
  return (
    <SettingRow
      title={title}
      titleFor={id}
      desc={desc}
      control={
        <label className="switch">
          <input type="checkbox" id={id} checked={checked} onChange={(e) => onChange(e.target.checked)} />
          <span className="switch__track" aria-hidden="true">
            <span className="switch__knob" />
          </span>
        </label>
      }
    />
  );
}

export function SettingsView({
  settings,
  driveState,
  driveConnecting,
  notice,
  version,
  historyCount = 0,
  onSave,
  onCancel,
  onClearHistory,
  onRunDiagnostics,
  onOpenLogs,
  onConnectDrive,
  onDisconnectDrive,
}) {
  const t = useT();
  const makeDraft = () => ({
    ...settings,
    detect: { ...settings.detect },
  });
  const [draft, setDraft] = useState(makeDraft);
  // Snapshot taken once, at mount, from the same shape as `draft` — compared against it to tell
  // whether the user has unsaved changes (back arrow / Cancelar should warn before discarding).
  const [initialDraft] = useState(() => JSON.stringify(makeDraft()));
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);
  const isDirty = () => JSON.stringify(draft) !== initialDraft;
  const requestCancel = () => {
    if (isDirty()) setConfirmDiscard(true);
    else onCancel();
  };
  const set = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  const setDetect = (key, value) => setDraft((d) => ({ ...d, detect: { ...d.detect, [key]: value } }));
  const setKey = (provider, value) => setDraft((d) => ({ ...d, apiKeys: { ...d.apiKeys, [provider]: value } }));

  const CAPTION_SOURCES = [
    ['auto', t('captionSource.auto')],
    ['panel', t('captionSource.panel')],
    ['overlay', t('captionSource.overlay')],
  ];
  const VERBOSITY_OPTS = [
    ['curto', t('verbosity.short')],
    ['normal', t('verbosity.normal')],
    ['detalhado', t('verbosity.detailed')],
  ];

  const CUSTOM_MODEL = '__custom__';
  const modelIsKnown = MODELS.some((m) => m.id === draft.model);
  const needProvider = providerOf(draft);
  const missingKey = !hasKeyForModel(draft);
  const configuredCount = PROVIDER_IDS.filter((p) => draft.apiKeys[p]?.trim()).length;
  // Abre a seção de chaves só na montagem se faltar a chave do modelo atual; prop constante
  // depois, para o usuário poder recolher/expandir sem o painel fechar enquanto digita.
  const [keysOpen] = useState(missingKey);
  const onModelChange = (value) => {
    if (value === CUSTOM_MODEL) {
      setDraft((d) => ({ ...d, model: '', modelProvider: d.modelProvider || PROVIDER_IDS[0] }));
    } else {
      setDraft((d) => ({ ...d, model: value, modelProvider: '' }));
    }
  };

  const submit = (e) => {
    e.preventDefault();
    onSave({
      apiKeys: Object.fromEntries(PROVIDER_IDS.map((p) => [p, (draft.apiKeys[p] ?? '').trim()])),
      cloudflareAccountId: (draft.cloudflareAccountId ?? '').trim(),
      model: draft.model.trim(),
      modelProvider: draft.modelProvider,
      language: draft.language,
      verbosity: draft.verbosity,
      freq: Number(draft.freq),
      userName: draft.userName.trim(),
      captionSource: draft.captionSource,
      threadContext: draft.threadContext,
      detect: { ...draft.detect },
      autoMinutes: draft.autoMinutes,
      autoScore: draft.autoScore,
      saveHistory: draft.saveHistory,
    });
  };

  return (
    <>
      <header className="header">
        <button className="icon-button" type="button" aria-label={t('common.back')} onClick={requestCancel}>
          <Icon name="back" />
        </button>
        <h1 className="header__app">{t('settings.title')}</h1>
      </header>
      {confirmDiscard && (
        <ConfirmDialog
          title={t('settings.discardTitle')}
          message={t('settings.discardMessage')}
          confirmLabel={t('settings.discardConfirm')}
          cancelLabel={t('settings.keepEditing')}
          onCancel={() => setConfirmDiscard(false)}
          onConfirm={() => {
            setConfirmDiscard(false);
            onCancel();
          }}
        />
      )}
      {confirmClearHistory && (
        <ConfirmDialog
          title={t('settings.clearHistoryTitle')}
          message={t('settings.clearHistoryMessage', {
            n: historyCount,
            unit: t(historyCount === 1 ? 'unit.session.one' : 'unit.session.other'),
          })}
          confirmLabel={t('settings.clearHistory')}
          onCancel={() => setConfirmClearHistory(false)}
          onConfirm={() => {
            setConfirmClearHistory(false);
            onClearHistory();
          }}
        />
      )}
      <main className="main" id="settings-main">
        <form className="settings" id="settings-form" onSubmit={submit}>
          <div className="set-intro">
            <span className="set-intro__for">
              <span className="set-intro__mark" aria-hidden="true">
                <Icon name="sparkles" />
              </span>
              huddle-ai · {t('settings.tagline')}
            </span>
            <p className="set-intro__sub">{t('settings.subtitle')}</p>
          </div>

          {/* INTELIGÊNCIA */}
          <SettingsSection icon="sparkles" title={t('settings.intelligence')}>
            <SettingRow
              stack
              title={t('settings.model')}
              desc={t('settings.modelHint')}
              aside={<span className="provider-pill">{PROVIDERS[needProvider].label}</span>}
            >
              <div className="set-row__field">
                <label className="sr-only" htmlFor="model">
                  {t('settings.model')}
                </label>
                <select id="model" value={modelIsKnown ? draft.model : CUSTOM_MODEL} onChange={(e) => onModelChange(e.target.value)}>
                  {PROVIDER_IDS.map((p) => (
                    <optgroup key={p} label={PROVIDERS[p].label}>
                      {MODELS.filter((m) => m.provider === p).map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                  <option value={CUSTOM_MODEL}>{t('settings.custom')}</option>
                </select>
                {!modelIsKnown && (
                  <div className="field-row">
                    <div className="set-field">
                      <label htmlFor="modelProvider">{t('settings.provider')}</label>
                      <Select
                        id="modelProvider"
                        options={PROVIDER_IDS.map((p) => [p, PROVIDERS[p].label])}
                        value={draft.modelProvider || PROVIDER_IDS[0]}
                        onChange={(v) => set('modelProvider', v)}
                      />
                    </div>
                    <div className="set-field">
                      <label htmlFor="customModel">{t('settings.modelId')}</label>
                      <input
                        id="customModel"
                        type="text"
                        value={draft.model}
                        autoComplete="off"
                        placeholder={t('settings.modelIdPlaceholder')}
                        onChange={(e) => set('model', e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>
            </SettingRow>

            <div className="set-row set-row--block">
              <details className="provider-keys" open={keysOpen}>
                <summary>
                  <span className="provider-keys__icon">
                    <Icon name="key" />
                  </span>
                  <span className="provider-keys__label">{t('settings.apiKeys')}</span>
                  <span className={`key-count${missingKey ? ' key-count--warn' : ''}`}>
                    {t('settings.keyCount', { n: configuredCount, m: PROVIDER_IDS.length })}
                  </span>
                  <span className="provider-keys__chevron" aria-hidden="true">
                    <Icon name="back" />
                  </span>
                </summary>
                <div className="provider-keys__body">
                  <p className="muted small">{t('settings.keysHint')}</p>
                  {PROVIDER_IDS.map((p) => {
                    const filled = Boolean(draft.apiKeys[p]?.trim());
                    return (
                      <div className="set-field" key={p}>
                        <div className="set-field__head">
                          <label htmlFor={`key-${p}`}>{PROVIDERS[p].label}</label>
                          <span
                            className={`key-dot${filled ? ' key-dot--on' : ''}`}
                            title={filled ? t('settings.keyConfigured') : t('settings.keyEmpty')}
                            aria-label={filled ? t('settings.keyConfigured') : t('settings.keyEmpty')}
                            role="img"
                          />
                        </div>
                        {/* Cloudflare precisa do account ID (vai na URL) além do token: campo próprio acima. */}
                        {p === 'cloudflare' && (
                          <input
                            id="cloudflare-account-id"
                            type="text"
                            style={{ marginBottom: '6px' }}
                            value={draft.cloudflareAccountId ?? ''}
                            autoComplete="off"
                            placeholder={t('settings.cloudflareAccountId')}
                            aria-label={t('settings.cloudflareAccountId')}
                            onChange={(e) => set('cloudflareAccountId', e.target.value)}
                          />
                        )}
                        <input
                          id={`key-${p}`}
                          type="password"
                          value={draft.apiKeys[p]}
                          autoComplete="off"
                          placeholder={PROVIDERS[p].keyPlaceholder}
                          onChange={(e) => setKey(p, e.target.value)}
                        />
                      </div>
                    );
                  })}
                </div>
              </details>
            </div>

            <SettingRow
              title={t('settings.language')}
              control={
                <div className="set-inline-select">
                  <label className="sr-only" htmlFor="language">
                    {t('settings.language')}
                  </label>
                  <Select id="language" options={LANGUAGES} value={draft.language} onChange={(v) => set('language', v)} />
                </div>
              }
            />

            <SettingRow
              title={t('settings.analyzeEvery')}
              control={
                <div className="segmented" role="radiogroup" aria-label={t('settings.analyzeEvery')}>
                  {FREQUENCIES.map((f) => (
                    <label key={f} className="segmented__opt">
                      <input type="radio" name="freq" value={f} checked={Number(draft.freq) === f} onChange={() => set('freq', f)} />
                      <span>{f}s</span>
                    </label>
                  ))}
                </div>
              }
            />

            <SettingRow stack title={t('settings.responseSize')} desc={t('settings.responseSizeHint')}>
              <div className="segmented segmented--full" role="radiogroup" aria-label={t('settings.responseSize')}>
                {VERBOSITY_OPTS.map(([value, label]) => (
                  <label key={value} className="segmented__opt">
                    <input type="radio" name="verbosity" value={value} checked={draft.verbosity === value} onChange={() => set('verbosity', value)} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </SettingRow>

            <SettingRow stack title={t('settings.yourName')} desc={t('settings.yourNameHint')}>
              <label className="sr-only" htmlFor="userName">
                {t('settings.yourName')}
              </label>
              <input
                id="userName"
                type="text"
                value={draft.userName}
                autoComplete="off"
                placeholder={t('settings.yourNamePlaceholder')}
                onChange={(e) => set('userName', e.target.value)}
              />
            </SettingRow>
          </SettingsSection>

          {/* LEGENDAS */}
          <SettingsSection icon="headphones" title={t('settings.captions')}>
            <SettingRow stack title={t('settings.captureHow')} desc={t('settings.captureHint')}>
              <label className="sr-only" htmlFor="captionSource">
                {t('settings.captureHow')}
              </label>
              <Select id="captionSource" options={CAPTION_SOURCES} value={draft.captionSource} onChange={(v) => set('captionSource', v)} />
            </SettingRow>
          </SettingsSection>

          {/* INSIGHTS */}
          <SettingsSection icon="bulb" title={t('settings.insights')}>
            <ToggleRow id="detect-alerts" title={t('detect.alerts')} checked={draft.detect.alerts} onChange={(v) => setDetect('alerts', v)} />
            <ToggleRow id="detect-actions" title={t('detect.actions')} checked={draft.detect.actions} onChange={(v) => setDetect('actions', v)} />
            <ToggleRow id="detect-decisions" title={t('detect.decisions')} checked={draft.detect.decisions} onChange={(v) => setDetect('decisions', v)} />
            <ToggleRow id="detect-questions" title={t('detect.questions')} checked={draft.detect.questions} onChange={(v) => setDetect('questions', v)} />
            <ToggleRow id="detect-context" title={t('detect.context')} checked={draft.detect.context} onChange={(v) => setDetect('context', v)} />
            <ToggleRow id="detect-suggestions" title={t('detect.suggestions')} checked={draft.detect.suggestions} onChange={(v) => setDetect('suggestions', v)} />
            <ToggleRow id="detect-replies" title={t('detect.replies')} checked={draft.detect.replies} onChange={(v) => setDetect('replies', v)} />
            <ToggleRow id="detect-references" title={t('detect.references')} checked={draft.detect.references} onChange={(v) => setDetect('references', v)} />
            <ToggleRow id="detect-acronyms" title={t('detect.acronyms')} checked={draft.detect.acronyms} onChange={(v) => setDetect('acronyms', v)} />
          </SettingsSection>

          {/* ATA & ANÁLISE */}
          <SettingsSection icon="doc" title={t('settings.ataAnalise')}>
            <ToggleRow id="autoMinutes" title={t('settings.autoMinutes')} checked={draft.autoMinutes} onChange={(v) => set('autoMinutes', v)} />
            <ToggleRow
              id="autoScore"
              title={t('settings.autoScore')}
              desc={t('settings.autoScoreHint')}
              checked={draft.autoScore}
              onChange={(v) => set('autoScore', v)}
            />
          </SettingsSection>

          {/* GOOGLE DRIVE */}
          <SettingsSection icon="cloud" title={t('settings.drive')}>
            <SettingRow
              stack
              desc={
                driveState.connected
                  ? `${driveState.email ? t('settings.driveConnectedEmail', { email: driveState.email }) : t('settings.driveConnectedNoEmail')}${t('settings.driveConnectedSuffix')}`
                  : t('settings.driveDisconnected')
              }
            >
              <div className="buttons buttons--start">
                {driveState.connected ? (
                  <button id="drive-connect-btn" className="button" type="button" onClick={onDisconnectDrive}>
                    {t('settings.disconnect')}
                  </button>
                ) : driveConnecting ? (
                  <button id="drive-connect-btn" className="button button--primary" type="button" disabled>
                    <span className="spinner" aria-hidden="true" />
                    {t('settings.driveOpening')}
                  </button>
                ) : (
                  <button id="drive-connect-btn" className="button button--primary" type="button" onClick={onConnectDrive}>
                    {t('settings.connectDrive')}
                  </button>
                )}
              </div>
            </SettingRow>
          </SettingsSection>

          {/* PRIVACIDADE */}
          <SettingsSection icon="shield" title={t('settings.privacy')}>
            <ToggleRow id="saveHistory" title={t('settings.saveHistory')} checked={draft.saveHistory} onChange={(v) => set('saveHistory', v)} />
            <div className="set-row set-row--block">
              <div className="buttons buttons--start">
                <button className="button button--danger" type="button" onClick={() => setConfirmClearHistory(true)}>
                  {t('settings.clearHistory')}
                </button>
                <button className="button" type="button" onClick={onRunDiagnostics}>
                  {t('settings.diagnostics')}
                </button>
                <button className="button" type="button" onClick={onOpenLogs}>
                  {t('settings.viewLogs')}
                </button>
              </div>
              {notice && (
                <p className="muted small" role="status">
                  {notice}
                </p>
              )}
            </div>
          </SettingsSection>
        </form>
      </main>
      <footer className="footer footer--row">
        <span className="muted small">v{version}</span>
        <button className="button" type="button" onClick={requestCancel}>
          {t('common.cancel')}
        </button>
        <button className="button button--primary" type="submit" form="settings-form">
          {t('common.save')}
        </button>
      </footer>
    </>
  );
}

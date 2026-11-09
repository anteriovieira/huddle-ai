import { useState } from 'react';
import { MODELS, PROVIDERS, PROVIDER_IDS, providerOf, hasKeyForModel } from '../lib/models.js';
import { LANGUAGES, useT } from '../lib/i18n.js';
import { Icon } from '../ui/Icon.jsx';
import { Field, Select, Toggle } from '../ui/primitives.jsx';

const FREQUENCIES = [15, 30, 60];

export function SettingsView({
  settings,
  driveState,
  driveConnecting,
  notice,
  version,
  onSave,
  onCancel,
  onClearHistory,
  onRunDiagnostics,
  onOpenLogs,
  onConnectDrive,
  onDisconnectDrive,
}) {
  const t = useT();
  const [draft, setDraft] = useState(() => ({
    ...settings,
    detect: { ...settings.detect },
  }));
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
      saveHistory: draft.saveHistory,
    });
  };

  return (
    <>
      <header className="header">
        <button className="icon-button" type="button" aria-label={t('common.back')} onClick={onCancel}>
          <Icon name="back" />
        </button>
        <h1 className="header__app">{t('settings.title')}</h1>
      </header>
      <main className="main" id="settings-main">
        <form className="settings" id="settings-form" onSubmit={submit}>
          <section className="settings-card">
            <div className="card-head">
              <span className="card-icon card-icon--purple">
                <Icon name="sparkles" />
              </span>
              <h2 className="section__title">{t('settings.intelligence')}</h2>
            </div>
            <Field
              label={t('settings.model')}
              htmlFor="model"
              headAside={<span className="provider-pill">{PROVIDERS[needProvider].label}</span>}
              hint={t('settings.modelHint')}
            >
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
            </Field>
            {!modelIsKnown && (
              <div className="field-row">
                <Field label={t('settings.provider')} htmlFor="modelProvider">
                  <Select
                    id="modelProvider"
                    options={PROVIDER_IDS.map((p) => [p, PROVIDERS[p].label])}
                    value={draft.modelProvider || PROVIDER_IDS[0]}
                    onChange={(v) => set('modelProvider', v)}
                  />
                </Field>
                <Field label={t('settings.modelId')} htmlFor="customModel">
                  <input
                    id="customModel"
                    type="text"
                    value={draft.model}
                    autoComplete="off"
                    placeholder={t('settings.modelIdPlaceholder')}
                    onChange={(e) => set('model', e.target.value)}
                  />
                </Field>
              </div>
            )}
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
                    <Field
                      key={p}
                      label={PROVIDERS[p].label}
                      htmlFor={`key-${p}`}
                      headAside={
                        <span
                          className={`key-dot${filled ? ' key-dot--on' : ''}`}
                          title={filled ? t('settings.keyConfigured') : t('settings.keyEmpty')}
                          aria-label={filled ? t('settings.keyConfigured') : t('settings.keyEmpty')}
                          role="img"
                        />
                      }
                    >
                      <input
                        id={`key-${p}`}
                        type="password"
                        value={draft.apiKeys[p]}
                        autoComplete="off"
                        placeholder={PROVIDERS[p].keyPlaceholder}
                        onChange={(e) => setKey(p, e.target.value)}
                      />
                    </Field>
                  );
                })}
              </div>
            </details>
            <div className="field-row">
              <Field label={t('settings.language')} htmlFor="language">
                <Select id="language" options={LANGUAGES} value={draft.language} onChange={(v) => set('language', v)} />
              </Field>
              <Field label={t('settings.analyzeEvery')} htmlFor="freq">
                <div className="segmented" role="radiogroup" aria-label={t('settings.analyzeEvery')}>
                  {FREQUENCIES.map((f) => (
                    <label key={f} className="segmented__opt">
                      <input
                        type="radio"
                        name="freq"
                        value={f}
                        checked={Number(draft.freq) === f}
                        onChange={() => set('freq', f)}
                      />
                      <span>{f}s</span>
                    </label>
                  ))}
                </div>
              </Field>
            </div>
            <Field
              label={t('settings.responseSize')}
              htmlFor="verbosity"
              hint={t('settings.responseSizeHint')}
            >
              <div className="segmented" role="radiogroup" aria-label={t('settings.responseSize')}>
                {VERBOSITY_OPTS.map(([value, label]) => (
                  <label key={value} className="segmented__opt">
                    <input
                      type="radio"
                      name="verbosity"
                      value={value}
                      checked={draft.verbosity === value}
                      onChange={() => set('verbosity', value)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </Field>
            <Field
              label={t('settings.yourName')}
              htmlFor="userName"
              hint={t('settings.yourNameHint')}
            >
              <input
                id="userName"
                type="text"
                value={draft.userName}
                autoComplete="off"
                placeholder={t('settings.yourNamePlaceholder')}
                onChange={(e) => set('userName', e.target.value)}
              />
            </Field>
          </section>
          <section className="settings-card">
            <div className="card-head">
              <span className="card-icon card-icon--blue">
                <Icon name="headphones" />
              </span>
              <h2 className="section__title">{t('settings.captions')}</h2>
            </div>
            <Field
              label={t('settings.captureHow')}
              htmlFor="captionSource"
              hint={t('settings.captureHint')}
            >
              <Select id="captionSource" options={CAPTION_SOURCES} value={draft.captionSource} onChange={(v) => set('captionSource', v)} />
            </Field>
          </section>
          <section className="settings-card">
            <div className="card-head">
              <span className="card-icon card-icon--yellow">
                <Icon name="bulb" />
              </span>
              <h2 className="section__title">{t('settings.insights')}</h2>
            </div>
            <Toggle id="detect-alerts" label={t('detect.alerts')} checked={draft.detect.alerts} onChange={(v) => setDetect('alerts', v)} />
            <Toggle id="detect-actions" label={t('detect.actions')} checked={draft.detect.actions} onChange={(v) => setDetect('actions', v)} />
            <Toggle id="detect-decisions" label={t('detect.decisions')} checked={draft.detect.decisions} onChange={(v) => setDetect('decisions', v)} />
            <Toggle id="detect-questions" label={t('detect.questions')} checked={draft.detect.questions} onChange={(v) => setDetect('questions', v)} />
            <Toggle id="detect-context" label={t('detect.context')} checked={draft.detect.context} onChange={(v) => setDetect('context', v)} />
            <Toggle id="detect-suggestions" label={t('detect.suggestions')} checked={draft.detect.suggestions} onChange={(v) => setDetect('suggestions', v)} />
            <Toggle id="detect-replies" label={t('detect.replies')} checked={draft.detect.replies} onChange={(v) => setDetect('replies', v)} />
            <Toggle id="detect-references" label={t('detect.references')} checked={draft.detect.references} onChange={(v) => setDetect('references', v)} />
            <Toggle id="detect-acronyms" label={t('detect.acronyms')} checked={draft.detect.acronyms} onChange={(v) => setDetect('acronyms', v)} />
          </section>
          <section className="settings-card settings-card--tight">
            <div className="card-head">
              <span className="card-icon card-icon--green">
                <Icon name="doc" />
              </span>
              <h2 className="section__title">{t('settings.ata')}</h2>
            </div>
            <Toggle id="autoMinutes" label={t('settings.autoMinutes')} checked={draft.autoMinutes} onChange={(v) => set('autoMinutes', v)} />
          </section>
          <section className="settings-card settings-card--tight">
            <div className="card-head">
              <span className="card-icon card-icon--muted">
                <Icon name="cloud" />
              </span>
              <h2 className="section__title">{t('settings.drive')}</h2>
            </div>
            {driveState.connected ? (
              <p className="muted small">
                {driveState.email ? t('settings.driveConnectedEmail', { email: driveState.email }) : t('settings.driveConnectedNoEmail')}
                {t('settings.driveConnectedSuffix')}
              </p>
            ) : (
              <p className="muted small">{t('settings.driveDisconnected')}</p>
            )}
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
          </section>
          <section className="settings-card settings-card--tight">
            <div className="card-head">
              <span className="card-icon card-icon--muted">
                <Icon name="shield" />
              </span>
              <h2 className="section__title">{t('settings.privacy')}</h2>
            </div>
            <Toggle id="saveHistory" label={t('settings.saveHistory')} checked={draft.saveHistory} onChange={(v) => set('saveHistory', v)} />
            <div className="buttons buttons--start">
              <button className="button button--danger" type="button" onClick={onClearHistory}>
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
          </section>
        </form>
      </main>
      <footer className="footer footer--row">
        <span className="muted small">v{version}</span>
        <button className="button" type="button" onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button className="button button--primary" type="submit" form="settings-form">
          {t('common.save')}
        </button>
      </footer>
    </>
  );
}

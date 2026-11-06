import { useState } from 'react';
import { MODELS, PROVIDERS, PROVIDER_IDS, providerOf, hasKeyForModel } from '../lib/models.js';
import { Icon } from '../ui/Icon.jsx';
import { Field, Select, Toggle } from '../ui/primitives.jsx';

// A linguagem escolhida vale para o app todo: o modelo escreve insights, chat e ata nela. O valor é
// usado direto no prompt ("Write every field in <idioma>"), então guardamos o nome em inglês, que o
// modelo entende sem ambiguidade, e mostramos o nome nativo pro usuário. Padrão: English.
const LANGUAGES = [
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
const CAPTION_SOURCES = [
  ['auto', 'Automático (recomendado)'],
  ['panel', 'Painel de legendas (aba Captions)'],
  ['overlay', 'Legendas sobre os vídeos'],
];
const FREQUENCIES = [15, 30, 60];
const VERBOSITY_OPTS = [
  ['curto', 'Curto'],
  ['normal', 'Normal'],
  ['detalhado', 'Detalhado'],
];

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
  const [draft, setDraft] = useState(() => ({
    ...settings,
    detect: { ...settings.detect },
  }));
  const set = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  const setDetect = (key, value) => setDraft((d) => ({ ...d, detect: { ...d.detect, [key]: value } }));
  const setKey = (provider, value) => setDraft((d) => ({ ...d, apiKeys: { ...d.apiKeys, [provider]: value } }));

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
      detect: { ...draft.detect },
      autoMinutes: draft.autoMinutes,
      saveHistory: draft.saveHistory,
    });
  };

  return (
    <>
      <header className="header">
        <button className="icon-button" type="button" aria-label="Voltar" onClick={onCancel}>
          <Icon name="back" />
        </button>
        <h1 className="header__app">Configurações</h1>
      </header>
      <main className="main" id="settings-main">
        <form className="settings" id="settings-form" onSubmit={submit}>
          <section className="settings-card">
            <div className="card-head">
              <span className="card-icon card-icon--purple">
                <Icon name="sparkles" />
              </span>
              <h2 className="section__title">Inteligência</h2>
            </div>
            <Field
              label="Modelo"
              htmlFor="model"
              headAside={<span className="provider-pill">{PROVIDERS[needProvider].label}</span>}
              hint="Anthropic, OpenAI, Google e provedores com camada gratuita. A chave usada acompanha o provedor."
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
                <option value={CUSTOM_MODEL}>Personalizado…</option>
              </select>
            </Field>
            {!modelIsKnown && (
              <div className="field-row">
                <Field label="Provider" htmlFor="modelProvider">
                  <Select
                    id="modelProvider"
                    options={PROVIDER_IDS.map((p) => [p, PROVIDERS[p].label])}
                    value={draft.modelProvider || PROVIDER_IDS[0]}
                    onChange={(v) => set('modelProvider', v)}
                  />
                </Field>
                <Field label="ID do modelo" htmlFor="customModel">
                  <input
                    id="customModel"
                    type="text"
                    value={draft.model}
                    autoComplete="off"
                    placeholder="ex.: gpt-5.5"
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
                <span className="provider-keys__label">Chaves de API</span>
                <span className={`key-count${missingKey ? ' key-count--warn' : ''}`}>
                  {configuredCount} de {PROVIDER_IDS.length}
                </span>
                <span className="provider-keys__chevron" aria-hidden="true">
                  <Icon name="back" />
                </span>
              </summary>
              <div className="provider-keys__body">
                <p className="muted small">Ficam só neste navegador. Preencha a do provedor do modelo escolhido.</p>
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
                          title={filled ? 'Configurada' : 'Vazia'}
                          aria-label={filled ? 'Configurada' : 'Vazia'}
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
              <Field label="Idioma" htmlFor="language">
                <Select id="language" options={LANGUAGES} value={draft.language} onChange={(v) => set('language', v)} />
              </Field>
              <Field label="Analisar a cada" htmlFor="freq">
                <div className="segmented" role="radiogroup" aria-label="Analisar a cada">
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
              label="Tamanho das respostas"
              htmlFor="verbosity"
              hint="Curto deixa insights e respostas enxutos, pra ler rápido na reunião. Detalhado permite mais contexto."
            >
              <div className="segmented" role="radiogroup" aria-label="Tamanho das respostas">
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
              label="Seu nome no huddle"
              htmlFor="userName"
              hint='Usado para separar os "Alertas pra você" — menções, ações e perguntas dirigidas a você.'
            >
              <input
                id="userName"
                type="text"
                value={draft.userName}
                autoComplete="off"
                placeholder="Como você aparece nas legendas"
                onChange={(e) => set('userName', e.target.value)}
              />
            </Field>
          </section>
          <section className="settings-card">
            <div className="card-head">
              <span className="card-icon card-icon--blue">
                <Icon name="headphones" />
              </span>
              <h2 className="section__title">Legendas</h2>
            </div>
            <Field
              label="Como capturar"
              htmlFor="captionSource"
              hint="Automático começa a capturar assim que a legenda liga, sem precisar abrir a aba Captions: usa o painel quando a aba está aberta (transcrição completa) e as legendas sobre os vídeos quando não. Vale ao reler a aba do Slack."
            >
              <Select id="captionSource" options={CAPTION_SOURCES} value={draft.captionSource} onChange={(v) => set('captionSource', v)} />
            </Field>
          </section>
          <section className="settings-card">
            <div className="card-head">
              <span className="card-icon card-icon--yellow">
                <Icon name="bulb" />
              </span>
              <h2 className="section__title">Insights</h2>
            </div>
            <Toggle id="detect-alerts" label="Alertas pra você (menções, ações, perguntas)" checked={draft.detect.alerts} onChange={(v) => setDetect('alerts', v)} />
            <Toggle id="detect-actions" label="Ações e responsáveis" checked={draft.detect.actions} onChange={(v) => setDetect('actions', v)} />
            <Toggle id="detect-decisions" label="Decisões" checked={draft.detect.decisions} onChange={(v) => setDetect('decisions', v)} />
            <Toggle id="detect-questions" label="Perguntas em aberto" checked={draft.detect.questions} onChange={(v) => setDetect('questions', v)} />
            <Toggle id="detect-context" label="Contexto de reuniões passadas" checked={draft.detect.context} onChange={(v) => setDetect('context', v)} />
            <Toggle id="detect-suggestions" label="Sugestões do que falar" checked={draft.detect.suggestions} onChange={(v) => setDetect('suggestions', v)} />
            <Toggle id="detect-replies" label="Respostas sugeridas" checked={draft.detect.replies} onChange={(v) => setDetect('replies', v)} />
            <Toggle id="detect-references" label="Referências (livros, apps, links)" checked={draft.detect.references} onChange={(v) => setDetect('references', v)} />
            <Toggle id="detect-acronyms" label="Siglas citadas" checked={draft.detect.acronyms} onChange={(v) => setDetect('acronyms', v)} />
          </section>
          <section className="settings-card settings-card--tight">
            <div className="card-head">
              <span className="card-icon card-icon--green">
                <Icon name="doc" />
              </span>
              <h2 className="section__title">Ata</h2>
            </div>
            <Toggle id="autoMinutes" label="Gerar a ata ao encerrar o huddle" checked={draft.autoMinutes} onChange={(v) => set('autoMinutes', v)} />
          </section>
          <section className="settings-card settings-card--tight">
            <div className="card-head">
              <span className="card-icon card-icon--muted">
                <Icon name="cloud" />
              </span>
              <h2 className="section__title">Google Drive</h2>
            </div>
            {driveState.connected ? (
              <p className="muted small">
                {driveState.email ? `Conectado como ${driveState.email}. ` : 'Conectado. '}
                Envie a ata de qualquer huddle ao Drive pelo botão de nuvem na aba Ata.
              </p>
            ) : (
              <p className="muted small">
                Conecte para enviar as atas ao seu Drive. A extensão só acessa os arquivos que ela mesma cria (escopo
                drive.file).
              </p>
            )}
            <div className="buttons buttons--start">
              {driveState.connected ? (
                <button id="drive-connect-btn" className="button" type="button" onClick={onDisconnectDrive}>
                  Desconectar
                </button>
              ) : driveConnecting ? (
                <button id="drive-connect-btn" className="button button--primary" type="button" disabled>
                  <span className="spinner" aria-hidden="true" />
                  Abrindo janela do Google…
                </button>
              ) : (
                <button id="drive-connect-btn" className="button button--primary" type="button" onClick={onConnectDrive}>
                  Conectar Google Drive
                </button>
              )}
            </div>
          </section>
          <section className="settings-card settings-card--tight">
            <div className="card-head">
              <span className="card-icon card-icon--muted">
                <Icon name="shield" />
              </span>
              <h2 className="section__title">Privacidade</h2>
            </div>
            <Toggle id="saveHistory" label="Salvar histórico de huddles e sessões" checked={draft.saveHistory} onChange={(v) => set('saveHistory', v)} />
            <div className="buttons buttons--start">
              <button className="button button--danger" type="button" onClick={onClearHistory}>
                Apagar histórico
              </button>
              <button className="button" type="button" onClick={onRunDiagnostics}>
                Diagnóstico
              </button>
              <button className="button" type="button" onClick={onOpenLogs}>
                Ver logs
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
          Cancelar
        </button>
        <button className="button button--primary" type="submit" form="settings-form">
          Salvar
        </button>
      </footer>
    </>
  );
}

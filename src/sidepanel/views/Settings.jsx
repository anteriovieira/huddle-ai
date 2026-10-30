import { useState } from 'react';
import { MODELS, PROVIDERS, PROVIDER_IDS, providerOf, hasKeyForModel } from '../lib/models.js';
import { Icon } from '../ui/Icon.jsx';
import { Field, Select, Toggle } from '../ui/primitives.jsx';

const LANGUAGES = ['Português', 'English', 'Español'];
const CAPTION_SOURCES = [
  ['auto', 'Automático (recomendado)'],
  ['panel', 'Painel de legendas (aba Captions)'],
  ['overlay', 'Legendas sobre os vídeos'],
];
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
          <section className="stack">
            <h2 className="section__title">Inteligência</h2>
            <details className="provider-keys" open={keysOpen}>
              <summary>
                Chaves de API por provider
                {missingKey && <span className="muted small"> — falta a de {PROVIDERS[needProvider].label}</span>}
              </summary>
              <p className="muted small">
                As chaves ficam só neste navegador (chrome.storage.local). Preencha a do provider do modelo escolhido.
              </p>
              {PROVIDER_IDS.map((p) => (
                <Field key={p} label={`Chave da API ${PROVIDERS[p].label}`} htmlFor={`key-${p}`}>
                  <input
                    id={`key-${p}`}
                    type="password"
                    value={draft.apiKeys[p]}
                    autoComplete="off"
                    placeholder={PROVIDERS[p].keyPlaceholder}
                    onChange={(e) => setKey(p, e.target.value)}
                  />
                </Field>
              ))}
            </details>
            <Field
              label="Modelo"
              htmlFor="model"
              hint={missingKey ? `Falta a chave da API ${PROVIDERS[needProvider].label} para este modelo.` : undefined}
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
            <div className="field-row">
              <Field label="Idioma" htmlFor="language">
                <Select id="language" options={LANGUAGES.map((l) => [l, l])} value={draft.language} onChange={(v) => set('language', v)} />
              </Field>
              <Field label="Analisar a cada" htmlFor="freq">
                <Select id="freq" options={FREQUENCIES.map((f) => [f, `${f} s`])} value={draft.freq} onChange={(v) => set('freq', v)} />
              </Field>
            </div>
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
          <hr />
          <section className="stack">
            <h2 className="section__title">Legendas</h2>
            <Field
              label="Como capturar"
              htmlFor="captionSource"
              hint="Automático começa a capturar assim que a legenda liga, sem precisar abrir a aba Captions: usa o painel quando a aba está aberta (transcrição completa) e as legendas sobre os vídeos quando não. Vale ao reler a aba do Slack."
            >
              <Select id="captionSource" options={CAPTION_SOURCES} value={draft.captionSource} onChange={(v) => set('captionSource', v)} />
            </Field>
          </section>
          <hr />
          <section className="stack stack--tight">
            <h2 className="section__title">Insights</h2>
            <Toggle id="detect-alerts" label="Alertas pra você (menções, ações, perguntas)" checked={draft.detect.alerts} onChange={(v) => setDetect('alerts', v)} />
            <Toggle id="detect-actions" label="Ações e responsáveis" checked={draft.detect.actions} onChange={(v) => setDetect('actions', v)} />
            <Toggle id="detect-decisions" label="Decisões" checked={draft.detect.decisions} onChange={(v) => setDetect('decisions', v)} />
            <Toggle id="detect-questions" label="Perguntas em aberto" checked={draft.detect.questions} onChange={(v) => setDetect('questions', v)} />
            <Toggle id="detect-suggestions" label="Sugestões do que falar" checked={draft.detect.suggestions} onChange={(v) => setDetect('suggestions', v)} />
            <Toggle id="detect-replies" label="Respostas sugeridas" checked={draft.detect.replies} onChange={(v) => setDetect('replies', v)} />
            <Toggle id="detect-references" label="Referências (livros, apps, links)" checked={draft.detect.references} onChange={(v) => setDetect('references', v)} />
            <Toggle id="detect-acronyms" label="Siglas citadas" checked={draft.detect.acronyms} onChange={(v) => setDetect('acronyms', v)} />
          </section>
          <hr />
          <section className="stack stack--tight">
            <h2 className="section__title">Ata</h2>
            <Toggle id="autoMinutes" label="Gerar a ata ao encerrar o huddle" checked={draft.autoMinutes} onChange={(v) => set('autoMinutes', v)} />
          </section>
          <hr />
          <section className="stack stack--tight">
            <h2 className="section__title">Google Drive</h2>
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
          <hr />
          <section className="stack stack--tight">
            <h2 className="section__title">Privacidade</h2>
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

import { useState } from 'react';
import { MODELS } from '../lib/models.js';
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

  const submit = (e) => {
    e.preventDefault();
    onSave({
      apiKey: draft.apiKey.trim(),
      model: draft.model,
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
            <Field
              label="Chave da API Anthropic"
              htmlFor="apiKey"
              hint="Fica só neste navegador (chrome.storage.local)."
            >
              <input
                id="apiKey"
                type="password"
                value={draft.apiKey}
                autoComplete="off"
                placeholder="sk-ant-…"
                onChange={(e) => set('apiKey', e.target.value)}
              />
            </Field>
            <Field label="Modelo" htmlFor="model">
              <Select id="model" options={MODELS.map((m) => [m.id, m.label])} value={draft.model} onChange={(v) => set('model', v)} />
            </Field>
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

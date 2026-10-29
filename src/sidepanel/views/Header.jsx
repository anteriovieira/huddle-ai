import { formatClock } from '../lib/format.js';
import { Icon } from '../ui/Icon.jsx';
import { AtaInfo } from './Ata.jsx';

export function Header({ huddle, version, chatOpen, onToggleChat, onOpenLogs, onOpenSettings, now }) {
  return (
    <header className="header">
      <Icon name="headphones" className="icon icon--title" />
      <div className="header__titles">
        <span className="header__app">Huddle AI</span>
        <span className="header__sub">v{version}</span>
      </div>
      {huddle &&
        (huddle.active ? (
          <span className="pill pill--live">
            <span className="dot" />
            <span id="clock">{formatClock(now - huddle.startedAt)}</span>
          </span>
        ) : (
          <span className="pill">Encerrado</span>
        ))}
      {huddle && (
        <button
          className={chatOpen ? 'icon-button icon-button--on' : 'icon-button'}
          type="button"
          aria-label="Chat com a reunião"
          aria-pressed={String(chatOpen)}
          title="Perguntar à reunião"
          onClick={onToggleChat}
        >
          <Icon name="chat" />
        </button>
      )}
      <button className="icon-button" type="button" aria-label="Logs" title="Logs" onClick={onOpenLogs}>
        <Icon name="logs" />
      </button>
      <button className="icon-button" type="button" aria-label="Configurações" title="Configurações" onClick={onOpenSettings}>
        <Icon name="settings" />
      </button>
    </header>
  );
}

const TAB_ITEMS = [
  ['insights', 'Insights'],
  ['captions', 'Captions'],
  ['ata', 'Ata'],
];

export function Tabs({ tab, onSelect }) {
  return (
    <nav className="tabs" role="tablist" aria-label="Seções">
      {TAB_ITEMS.map(([id, label]) => (
        <button
          key={id}
          className="tab"
          type="button"
          role="tab"
          aria-selected={String(tab === id)}
          onClick={() => onSelect(id)}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}

export function InfoBar({
  tab,
  settings,
  analysis,
  huddle,
  utteranceCount,
  currentMinutes,
  minutesRunning,
  onOpenSettings,
  onDownloadTranscript,
  onRegenerate,
  onOpenAtas,
}) {
  if (tab === 'insights') {
    if (!settings.apiKey) {
      return (
        <div className="info">
          Adicione sua chave da API para gerar insights.{' '}
          <button className="link" type="button" onClick={onOpenSettings}>
            Configurar
          </button>
        </div>
      );
    }
    if (analysis.error) {
      return (
        <div className="info info--error" role="status">
          {analysis.error}
        </div>
      );
    }
    if (analysis.running) {
      return (
        <div className="info" role="status">
          Analisando as últimas falas…
        </div>
      );
    }
    return (
      <div className="info">
        {`Analisando legendas a cada ${settings.freq} s. `}
        <button className="link" type="button" onClick={onOpenSettings}>
          Alterar
        </button>
      </div>
    );
  }
  if (tab === 'captions') {
    const count = utteranceCount;
    return (
      <div className="info info--row">
        <span>
          {!huddle.captions
            ? 'Abra a aba Captions na janela do huddle para começar.'
            : huddle.language
              ? `Lendo legendas em ${huddle.language} do huddle · ${count} ${count === 1 ? 'fala' : 'falas'}.`
              : `Lendo legendas do huddle · ${count} ${count === 1 ? 'fala' : 'falas'}.`}
        </span>
        <button className="icon-button" type="button" aria-label="Baixar transcrição" onClick={onDownloadTranscript}>
          <Icon name="download" />
        </button>
      </div>
    );
  }
  if (currentMinutes && !minutesRunning) {
    return <AtaInfo record={currentMinutes} onRegenerate={onRegenerate} onOpenList={onOpenAtas} />;
  }
  return null;
}

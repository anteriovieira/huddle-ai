import { formatClock } from '../lib/format.js';
import { hasKeyForModel } from '../lib/models.js';
import { Icon } from '../ui/Icon.jsx';
import { Tooltip } from '../ui/Tooltip.jsx';
import { AtaInfo } from './Ata.jsx';

export function Header({
  huddle,
  version,
  chatOpen,
  onToggleChat,
  onOpenLogs,
  onOpenSettings,
  now,
  onOpenAtas,
}) {
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
      {onOpenAtas && (
        <Tooltip label="Sessões anteriores" side="bottom">
          <button className="icon-button" type="button" aria-label="Sessões anteriores" onClick={onOpenAtas}>
            <Icon name="history" />
          </button>
        </Tooltip>
      )}
      {huddle && (
        <Tooltip label="Perguntar à reunião" side="bottom">
          <button
            className={chatOpen ? 'icon-button icon-button--on' : 'icon-button'}
            type="button"
            aria-label="Chat com a reunião"
            aria-pressed={String(chatOpen)}
            onClick={onToggleChat}
          >
            <Icon name="chat" />
          </button>
        </Tooltip>
      )}
      <Tooltip label="Logs" side="bottom">
        <button className="icon-button" type="button" aria-label="Logs" onClick={onOpenLogs}>
          <Icon name="logs" />
        </button>
      </Tooltip>
      <Tooltip label="Configurações" side="bottom">
        <button className="icon-button" type="button" aria-label="Configurações" onClick={onOpenSettings}>
          <Icon name="settings" />
        </button>
      </Tooltip>
    </header>
  );
}

const TAB_ITEMS = [
  ['insights', 'Insights'],
  ['captions', 'Captions'],
  ['ata', 'Ata'],
];

export function Tabs({ tab, onSelect, items = TAB_ITEMS }) {
  return (
    <nav className="tabs" role="tablist" aria-label="Seções">
      {items.map(([id, label]) => (
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

function SummaryActions({
  canCopySummary,
  canPostSummary,
  onCopySummary,
  onPostSummary,
  onAnalyzeNow,
  analyzing,
  tickerHidden,
  hasRecent,
  onToggleTicker,
}) {
  return (
    <div className="info__actions">
      {onAnalyzeNow && (
        <Tooltip label={analyzing ? 'Analisando…' : 'Analisar agora'}>
          <button className="icon-button" type="button" aria-label="Analisar agora" disabled={analyzing} onClick={onAnalyzeNow}>
            <Icon name="sparkles" />
          </button>
        </Tooltip>
      )}
      <Tooltip label="Copiar resumo">
        <button className="icon-button" type="button" aria-label="Copiar resumo" disabled={!canCopySummary} onClick={onCopySummary}>
          <Icon name="copy" />
        </button>
      </Tooltip>
      <Tooltip label="Postar no thread">
        <button className="icon-button" type="button" aria-label="Postar no thread" disabled={!canPostSummary} onClick={onPostSummary}>
          <Icon name="plane" />
        </button>
      </Tooltip>
      {hasRecent && (
        <Tooltip label={tickerHidden ? 'Mostrar últimas falas' : 'Ocultar últimas falas'}>
          <button
            className={tickerHidden ? 'icon-button' : 'icon-button icon-button--on'}
            type="button"
            aria-label={tickerHidden ? 'Mostrar últimas falas' : 'Ocultar últimas falas'}
            aria-pressed={String(!tickerHidden)}
            onClick={onToggleTicker}
          >
            <Icon name={tickerHidden ? 'eye-off' : 'eye'} />
          </button>
        </Tooltip>
      )}
    </div>
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
  canCopySummary,
  canPostSummary,
  onCopySummary,
  onPostSummary,
  onAnalyzeNow,
  tickerHidden,
  hasRecent,
  onToggleTicker,
  onOpenSettings,
  onDownloadTranscript,
  onRegenerate,
  onOpenAtas,
}) {
  if (tab === 'insights') {
    if (!hasKeyForModel(settings)) {
      return (
        <div className="info">
          Adicione a chave da API do modelo escolhido para gerar insights.{' '}
          <button className="link" type="button" onClick={onOpenSettings}>
            Configurar
          </button>
        </div>
      );
    }
    const actions = (
      <SummaryActions
        canCopySummary={canCopySummary}
        canPostSummary={canPostSummary}
        onCopySummary={onCopySummary}
        onPostSummary={onPostSummary}
        onAnalyzeNow={onAnalyzeNow}
        analyzing={analysis.running}
        tickerHidden={tickerHidden}
        hasRecent={hasRecent}
        onToggleTicker={onToggleTicker}
      />
    );
    return (
      <div className="info info--row">
        <span className="info__text" role={analysis.running ? 'status' : undefined}>
          {analysis.running ? (
            'Analisando as últimas falas…'
          ) : (
            <>
              {`Analisando legendas a cada ${settings.freq} s. `}
              <button className="link" type="button" onClick={onOpenSettings}>
                Alterar
              </button>
            </>
          )}
        </span>
        {actions}
      </div>
    );
  }
  if (tab === 'captions') {
    const count = utteranceCount;
    return (
      <div className="info info--row">
        <span className="info__text">
          {!huddle.captions ? (
            <>
              Legendas não aparecem? Ative no huddle (botão de legendas) ou nas{' '}
              <a
                className="link"
                href="https://slack.com/help/articles/1500002037922-Adjust-your-huddles-preferences"
                target="_blank"
                rel="noopener noreferrer"
              >
                preferências do Slack
              </a>
              .
            </>
          ) : huddle.language ? (
            `Lendo legendas em ${huddle.language} do huddle · ${count} ${count === 1 ? 'fala' : 'falas'}.`
          ) : (
            `Lendo legendas do huddle · ${count} ${count === 1 ? 'fala' : 'falas'}.`
          )}
        </span>
        <Tooltip label="Baixar transcrição">
          <button className="icon-button" type="button" aria-label="Baixar transcrição" onClick={onDownloadTranscript}>
            <Icon name="download" />
          </button>
        </Tooltip>
      </div>
    );
  }
  return <AtaInfo onRegenerate={onRegenerate} onOpenList={onOpenAtas} busy={minutesRunning} />;
}

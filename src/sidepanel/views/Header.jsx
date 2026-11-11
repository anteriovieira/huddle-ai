import { formatClock } from '../lib/format.js';
import { hasKeyForModel } from '../lib/models.js';
import { useT } from '../lib/i18n.js';
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
  onHome,
  onOpenAtas,
  onOpenAnalytics,
  onReturnToSlack,
}) {
  const t = useT();
  return (
    <header className="header">
      <Icon name="headphones" className="icon icon--title" />
      <div className="header__titles">
        <span className="header__app">Huddle AI</span>
        <span className="header__sub">v{version}</span>
      </div>
      {huddle && huddle.active && (
        <span className="pill pill--live">
          <span className="dot" />
          <span id="clock">{formatClock(now - huddle.startedAt)}</span>
        </span>
      )}
      {onReturnToSlack && (
        <Tooltip label={t('header.backToSlack')} side="bottom">
          <button className="icon-button" type="button" aria-label={t('header.backToSlack')} onClick={onReturnToSlack}>
            <Icon name="slack" />
          </button>
        </Tooltip>
      )}
      {onHome && (
        <Tooltip label={t('header.home')} side="bottom">
          <button className="icon-button" type="button" aria-label={t('header.home')} onClick={onHome}>
            <Icon name="home" />
          </button>
        </Tooltip>
      )}
      {onOpenAtas && (
        <Tooltip label={t('header.sessions')} side="bottom">
          <button className="icon-button" type="button" aria-label={t('header.sessions')} onClick={onOpenAtas}>
            <Icon name="logs" />
          </button>
        </Tooltip>
      )}
      {onOpenAnalytics && (
        <Tooltip label={t('header.analytics')} side="bottom">
          <button className="icon-button" type="button" aria-label={t('header.analytics')} onClick={onOpenAnalytics}>
            <Icon name="chart" />
          </button>
        </Tooltip>
      )}
      {huddle && (
        <Tooltip label={t('header.askMeeting')} side="bottom">
          <button
            className={chatOpen ? 'icon-button icon-button--on' : 'icon-button'}
            type="button"
            aria-label={t('header.chatAria')}
            aria-pressed={String(chatOpen)}
            onClick={onToggleChat}
          >
            <Icon name="chat" />
          </button>
        </Tooltip>
      )}
      <Tooltip label={t('header.logs')} side="bottom">
        <button className="icon-button" type="button" aria-label={t('header.logs')} onClick={onOpenLogs}>
          <Icon name="history" />
        </button>
      </Tooltip>
      <Tooltip label={t('header.settings')} side="bottom">
        <button className="icon-button" type="button" aria-label={t('header.settings')} onClick={onOpenSettings}>
          <Icon name="sliders" />
        </button>
      </Tooltip>
    </header>
  );
}

const TAB_ITEMS = ['insights', 'captions', 'ata', 'analytics'];

export function Tabs({ tab, onSelect, items = TAB_ITEMS }) {
  const t = useT();
  return (
    <nav className="tabs" role="tablist" aria-label={t('tabs.aria')}>
      {items.map((id) => (
        <button
          key={id}
          className="tab"
          type="button"
          role="tab"
          aria-selected={String(tab === id)}
          onClick={() => onSelect(id)}
        >
          {t(`tabs.${id}`)}
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
  onReanalyze,
  analyzing,
  paused,
  onTogglePause,
  anyDecked,
  onToggleAllDecks,
  tickerHidden,
  hasRecent,
  onToggleTicker,
  showAllSeen,
  hiddenSeen,
  onToggleShowAll,
}) {
  const t = useT();
  return (
    <div className="info__actions">
      {onToggleAllDecks && (
        <Tooltip label={anyDecked ? t('info.unstackAll') : t('info.stackAll')}>
          <button
            className={anyDecked ? 'icon-button icon-button--on' : 'icon-button'}
            type="button"
            aria-label={anyDecked ? t('info.unstackAll') : t('info.stackAllAria')}
            aria-pressed={String(Boolean(anyDecked))}
            onClick={onToggleAllDecks}
          >
            <Icon name="layers" />
          </button>
        </Tooltip>
      )}
      {onTogglePause && (
        <Tooltip label={paused ? t('info.resumeAuto') : t('info.pauseAuto')}>
          <button
            className={paused ? 'icon-button icon-button--paused' : 'icon-button'}
            type="button"
            aria-label={paused ? t('info.resumeAuto') : t('info.pauseAuto')}
            aria-pressed={String(Boolean(paused))}
            onClick={onTogglePause}
          >
            <Icon name={paused ? 'play' : 'pause'} />
          </button>
        </Tooltip>
      )}
      {(showAllSeen || hiddenSeen > 0) && (
        <Tooltip label={showAllSeen ? t('info.hideSeen') : t('info.showAll', { n: hiddenSeen })}>
          <button
            className={showAllSeen ? 'icon-button icon-button--view' : 'icon-button'}
            type="button"
            aria-label={showAllSeen ? t('info.hideSeenAria') : t('info.showAllAria')}
            aria-pressed={String(showAllSeen)}
            onClick={onToggleShowAll}
          >
            <Icon name={showAllSeen ? 'eye' : 'eye-off'} />
          </button>
        </Tooltip>
      )}
      {onAnalyzeNow && (
        <Tooltip label={analyzing ? t('info.analyzing') : t('info.analyzeNow')}>
          <button
            className={analyzing ? 'icon-button icon-button--loading' : 'icon-button'}
            type="button"
            aria-label={analyzing ? t('info.analyzing') : t('info.analyzeNow')}
            disabled={analyzing}
            onClick={onAnalyzeNow}
          >
            <Icon name={analyzing ? 'spinner' : 'sparkles'} className={analyzing ? 'icon icon--spin' : 'icon'} />
          </button>
        </Tooltip>
      )}
      {onReanalyze && (
        <Tooltip label={analyzing ? t('info.redoing') : t('info.redo')}>
          <button
            className={analyzing ? 'icon-button icon-button--loading' : 'icon-button'}
            type="button"
            aria-label={analyzing ? t('info.redoing') : t('info.redoAria')}
            disabled={analyzing}
            onClick={onReanalyze}
          >
            <Icon name={analyzing ? 'spinner' : 'refresh'} className={analyzing ? 'icon icon--spin' : 'icon'} />
          </button>
        </Tooltip>
      )}
      <Tooltip label={t('info.copySummary')}>
        <button className="icon-button" type="button" aria-label={t('info.copySummary')} disabled={!canCopySummary} onClick={onCopySummary}>
          <Icon name="copy" />
        </button>
      </Tooltip>
      {hasRecent && (
        <Tooltip label={tickerHidden ? t('info.showRecent') : t('info.hideRecent')}>
          <button
            className={tickerHidden ? 'icon-button' : 'icon-button icon-button--on'}
            type="button"
            aria-label={tickerHidden ? t('info.showRecent') : t('info.hideRecent')}
            aria-pressed={String(!tickerHidden)}
            onClick={onToggleTicker}
          >
            <Icon name="panel-down" />
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
  analysisPaused,
  analysisLastRunAt,
  onTogglePause,
  huddle,
  now,
  utteranceCount,
  currentMinutes,
  minutesRunning,
  canCopySummary,
  canPostSummary,
  onCopySummary,
  onPostSummary,
  canPostMinutes,
  onPostMinutes,
  onAnalyzeNow,
  onReanalyze,
  tickerHidden,
  hasRecent,
  onToggleTicker,
  onOpenSettings,
  onDownloadTranscript,
  onCopyCaptions,
  onRegenerate,
  onOpenAtas,
  onCopyMinutes,
  onDriveMinutes,
  minutesUploaded,
  minutesDriveBusy,
  showAllSeen,
  hiddenSeen,
  onToggleShowAll,
  anyDecked,
  onToggleAllDecks,
  analyticsScored,
  analyticsCanScore,
  analyticsScoring,
  onCopyAnalytics,
  onRegenerateAnalytics,
  onAskAnalytics,
}) {
  const t = useT();
  if (tab === 'analytics') {
    if (!hasKeyForModel(settings)) {
      return (
        <div className="info">
          {t('infobar.needKey')}{' '}
          <button className="link" type="button" onClick={onOpenSettings}>
            {t('infobar.configure')}
          </button>
        </div>
      );
    }
    const status = analyticsScored
      ? t('infobar.analyticsSession')
      : analyticsCanScore
        ? t('infobar.analyticsScore')
        : t('infobar.analyticsReady');
    return (
      <div className="info info--row">
        <span className="info__text">{status}</span>
        <div className="info__actions">
          {onAskAnalytics && (
            <Tooltip label={t('info.analytics.ask')}>
              <button className="icon-button" type="button" aria-label={t('info.analytics.ask')} onClick={onAskAnalytics}>
                <Icon name="chat" />
              </button>
            </Tooltip>
          )}
          {onRegenerateAnalytics && analyticsCanScore && (
            <Tooltip label={analyticsScoring ? t('info.analytics.scoring') : t('info.analytics.regen')}>
              <button
                className={analyticsScoring ? 'icon-button icon-button--loading' : 'icon-button'}
                type="button"
                aria-label={analyticsScoring ? t('info.analytics.scoring') : t('info.analytics.regen')}
                disabled={analyticsScoring}
                onClick={onRegenerateAnalytics}
              >
                <Icon name={analyticsScoring ? 'spinner' : 'refresh'} className={analyticsScoring ? 'icon icon--spin' : 'icon'} />
              </button>
            </Tooltip>
          )}
          <Tooltip label={t('info.analytics.copy')}>
            <button className="icon-button" type="button" aria-label={t('info.analytics.copy')} disabled={!analyticsScored} onClick={onCopyAnalytics}>
              <Icon name="copy" />
            </button>
          </Tooltip>
        </div>
      </div>
    );
  }
  if (tab === 'insights') {
    if (!hasKeyForModel(settings)) {
      return (
        <div className="info">
          {t('infobar.needKey')}{' '}
          <button className="link" type="button" onClick={onOpenSettings}>
            {t('infobar.configure')}
          </button>
        </div>
      );
    }
    // A análise automática só roda num huddle ao vivo. Fora disso (sessão carregada/importada/
    // encerrada) não faz sentido mostrar pausa nem contagem regressiva.
    const live = Boolean(huddle?.active);
    const actions = (
      <SummaryActions
        canCopySummary={canCopySummary}
        canPostSummary={canPostSummary}
        onCopySummary={onCopySummary}
        onPostSummary={onPostSummary}
        onAnalyzeNow={live ? onAnalyzeNow : undefined}
        onReanalyze={live ? undefined : onReanalyze}
        analyzing={analysis.running}
        paused={live ? analysisPaused : false}
        onTogglePause={live ? onTogglePause : undefined}
        anyDecked={anyDecked}
        onToggleAllDecks={onToggleAllDecks}
        tickerHidden={tickerHidden}
        hasRecent={live && hasRecent}
        onToggleTicker={onToggleTicker}
        showAllSeen={showAllSeen}
        hiddenSeen={hiddenSeen}
        onToggleShowAll={onToggleShowAll}
      />
    );
    // Conta quanto falta para a próxima análise automática: lastRunAt + intervalo − agora.
    const remaining = Math.max(0, Math.ceil((analysisLastRunAt + settings.freq * 1000 - now) / 1000));
    let status;
    if (!live) status = t('infobar.sessionInsights');
    else if (analysis.running) status = t('info.analyzing');
    else if (analysisPaused) status = t('infobar.paused');
    else if (!analysisLastRunAt) status = t('infobar.analyzingEvery', { n: settings.freq });
    else if (remaining > 0) status = t('infobar.nextIn', { n: remaining });
    else status = t('infobar.onNextUtterance');
    return (
      <div className="info info--row">
        <span className="info__text" role={analysis.running ? 'status' : undefined}>
          {analysis.running && <span className="live-dot" aria-hidden="true" />}
          {status}
        </span>
        {actions}
      </div>
    );
  }
  if (tab === 'captions') {
    const count = utteranceCount;
    const unit = t(count === 1 ? 'unit.caption.one' : 'unit.caption.other');
    return (
      <div className="info info--row">
        <span className="info__text">
          {!huddle.captions ? (
            <>
              {t('captions.enablePre')}
              <a
                className="link"
                href="https://slack.com/help/articles/1500002037922-Adjust-your-huddles-preferences"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('captions.slackPrefs')}
              </a>
              {t('captions.enablePost')}
            </>
          ) : (
            t('captions.reading', { n: count, unit })
          )}
        </span>
        <div className="info__actions">
          <Tooltip label={t('captions.copy')}>
            <button
              className="icon-button"
              type="button"
              aria-label={t('captions.copy')}
              disabled={!count}
              onClick={onCopyCaptions}
            >
              <Icon name="copy" />
            </button>
          </Tooltip>
          <Tooltip label={t('captions.download')}>
            <button className="icon-button" type="button" aria-label={t('captions.download')} disabled={!count} onClick={onDownloadTranscript}>
              <Icon name="download" />
            </button>
          </Tooltip>
        </div>
      </div>
    );
  }
  return (
    <AtaInfo
      onRegenerate={onRegenerate}
      onOpenList={onOpenAtas}
      onPost={onPostMinutes}
      canPost={canPostMinutes}
      onCopy={onCopyMinutes}
      onDrive={onDriveMinutes}
      uploaded={minutesUploaded}
      driveBusy={minutesDriveBusy}
      busy={minutesRunning}
      minutes={currentMinutes}
      autoMinutes={settings.autoMinutes}
      now={now}
    />
  );
}

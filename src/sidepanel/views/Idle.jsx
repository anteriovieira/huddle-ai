import { useT } from '../lib/i18n.js';
import { Icon } from '../ui/Icon.jsx';

export function IdleView({
  slackOpen,
  slackReloadTabId,
  savedCount,
  onConnectSlackTab,
  onReloadSlackTab,
  onGoToSlack,
  onOpenImport,
  onOpenAtas,
}) {
  const t = useT();
  // "…open the Captions tab…" — the tab name stays bold, so render the sentence around the {tab}
  // slot instead of interpolating, keeping word order correct per language.
  const [enterPre, enterPost] = t('idle.enterHuddle', { tab: '\u0000' }).split('\u0000');
  return (
    <main className="idle">
      <div className="idle__hero">
        <div className="idle__icon">
          <Icon name="headphones" />
        </div>
        <h1>{t('idle.noHuddle')}</h1>
        <p>
          {enterPre}
          <b>Captions</b>
          {enterPost}
        </p>
      </div>
      {slackReloadTabId != null && (
        <div className="idle__reload">
          <p className="muted small">{t('idle.reloadHint')}</p>
          <button className="button button--block" type="button" onClick={onConnectSlackTab}>
            <Icon name="enter" />
            {t('idle.connectTab')}
          </button>
          <button className="link" type="button" onClick={onReloadSlackTab}>
            {t('idle.orReload')}
          </button>
        </div>
      )}
      {slackOpen && slackReloadTabId == null && (
        <p className="muted small center">{t('idle.alreadyOpen')}</p>
      )}
      <div className="idle__footer">
        <button className="button button--primary button--block" type="button" onClick={onGoToSlack}>
          {t('idle.goToSlack')}
        </button>
        <button className="button button--block" type="button" onClick={onOpenImport}>
          <Icon name="upload" />
          {t('idle.import')}
        </button>
        {savedCount > 0 && (
          <button className="button button--block" type="button" onClick={onOpenAtas}>
            {t('idle.previousCount', { n: savedCount })}
          </button>
        )}
        <p className="muted small center">{t('idle.privacy')}</p>
      </div>
    </main>
  );
}

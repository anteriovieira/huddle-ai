import { useState } from 'react';
import { formatDateTime } from '../lib/format.js';
import { tagCounts } from '../lib/minutes.js';
import { useT } from '../lib/i18n.js';
import { ConfirmDialog } from '../ui/ConfirmDialog.jsx';
import { Icon } from '../ui/Icon.jsx';
import { Tooltip } from '../ui/Tooltip.jsx';
import { AtaContent, AtaFooter, AtasList } from './Ata.jsx';

export function AtasView({
  records,
  query,
  tag,
  now,
  currentHuddleId,
  onQueryChange,
  onSelectTag,
  onOpen,
  onLoad,
  onDelete,
  onBack,
  onOpenImport,
}) {
  const t = useT();
  const tags = tagCounts(records);
  const effectiveTag = tag && tags.some(([tg]) => tg === tag) ? tag : null;
  const [confirmDelete, setConfirmDelete] = useState(null);
  const sessionUnit = t(records.length === 1 ? 'unit.session.one' : 'unit.session.other');
  return (
    <>
      <header className="header">
        <button className="icon-button" type="button" aria-label={t('common.back')} onClick={onBack}>
          <Icon name="back" />
        </button>
        <h1 className="header__app">{t('atas.title')}</h1>
        <span className="muted small">{t('atas.count', { n: records.length, unit: sessionUnit })}</span>
        <Tooltip label={t('atas.import')} side="bottom">
          <button className="icon-button" type="button" aria-label={t('atas.import')} onClick={onOpenImport}>
            <Icon name="upload" />
          </button>
        </Tooltip>
      </header>
      <div className="searchbar">
        <label className="search">
          <Icon name="search" />
          <input
            type="search"
            placeholder={t('atas.searchPlaceholder')}
            aria-label={t('atas.searchAria')}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
          />
        </label>
      </div>
      {tags.length > 0 && (
        <div className="tagbar" role="group" aria-label={t('atas.filterByTag')}>
          {effectiveTag && (
            <button className="chip chip--clear" type="button" onClick={() => onSelectTag(effectiveTag)}>
              <Icon name="close" />
              {t('common.clear')}
            </button>
          )}
          {tags.map(([tg, count]) => (
            <button
              key={tg}
              className={effectiveTag === tg ? 'chip chip--on' : 'chip'}
              type="button"
              aria-pressed={String(effectiveTag === tg)}
              onClick={() => onSelectTag(tg)}
            >
              {tg}
              <span className="chip__count">{String(count)}</span>
            </button>
          ))}
        </div>
      )}
      {confirmDelete && (
        <ConfirmDialog
          title={t('atas.deleteTitle', { title: confirmDelete.data.title })}
          message={t('atas.deleteMessage')}
          confirmLabel={t('atas.deleteConfirm')}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            const record = confirmDelete;
            setConfirmDelete(null);
            onDelete(record);
          }}
        />
      )}
      <main className="main main--atas" id="main">
        <div id="atas-list">
          <AtasList
            records={records}
            query={query}
            tag={effectiveTag}
            now={now}
            currentHuddleId={currentHuddleId}
            onOpen={onOpen}
            onLoad={onLoad}
            onDelete={onDelete ? setConfirmDelete : undefined}
          />
        </div>
      </main>
      <footer className="footer">
        <p className="muted small">{t('atas.footerNote')}</p>
      </footer>
    </>
  );
}

export function PastAtaView({ record, isCurrent, now, onBack, onLoad, onDelete, ataProps, footerProps }) {
  const t = useT();
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <header className="header">
        <button className="icon-button" type="button" aria-label={t('common.back')} onClick={onBack}>
          <Icon name="back" />
        </button>
        <div className="header__titles">
          <span className="header__app">{t('session.title')}</span>
          <span className="header__sub">{formatDateTime(record.meta.startedAt)}</span>
        </div>
        {isCurrent ? (
          <span className="pill">{t('atas.inApp')}</span>
        ) : (
          <Tooltip label={t('session.load')} side="bottom">
            <button className="icon-button" type="button" aria-label={t('session.load')} onClick={() => onLoad(record)}>
              <Icon name="enter" />
            </button>
          </Tooltip>
        )}
        {onDelete && (
          <Tooltip label={t('session.delete')} side="bottom">
            <button className="icon-button icon-button--danger" type="button" aria-label={t('session.delete')} onClick={() => setConfirming(true)}>
              <Icon name="trash" />
            </button>
          </Tooltip>
        )}
      </header>
      {confirming && (
        <ConfirmDialog
          title={t('session.deleteTitle')}
          message={t('atas.deleteMessage')}
          confirmLabel={t('atas.deleteConfirm')}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            onDelete(record);
          }}
        />
      )}
      <main className="main" id="main">
        <AtaContent record={record} {...ataProps} />
      </main>
      <AtaFooter record={record} {...footerProps} />
    </>
  );
}

import { useState } from 'react';
import { formatDateTime } from '../lib/format.js';
import { tagCounts } from '../lib/minutes.js';
import { ConfirmDialog } from '../ui/ConfirmDialog.jsx';
import { Icon } from '../ui/Icon.jsx';
import { Tooltip } from '../ui/Tooltip.jsx';

const DELETE_MESSAGE = 'A transcrição, os insights e a ata desta sessão serão removidos deste navegador. Não dá para desfazer.';
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
  const tags = tagCounts(records);
  const effectiveTag = tag && tags.some(([t]) => t === tag) ? tag : null;
  const [confirmDelete, setConfirmDelete] = useState(null);
  return (
    <>
      <header className="header">
        <button className="icon-button" type="button" aria-label="Voltar" onClick={onBack}>
          <Icon name="back" />
        </button>
        <h1 className="header__app">Sessões anteriores</h1>
        <span className="muted small">{`${records.length} ${records.length === 1 ? 'sessão' : 'sessões'}`}</span>
        <Tooltip label="Importar transcrição" side="bottom">
          <button className="icon-button" type="button" aria-label="Importar transcrição" onClick={onOpenImport}>
            <Icon name="upload" />
          </button>
        </Tooltip>
      </header>
      <div className="searchbar">
        <label className="search">
          <Icon name="search" />
          <input
            type="search"
            placeholder="Buscar por tag, pessoa ou assunto"
            aria-label="Buscar sessões"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
          />
        </label>
      </div>
      {tags.length > 0 && (
        <div className="tagbar" role="group" aria-label="Filtrar por tag">
          {effectiveTag && (
            <button className="chip chip--clear" type="button" onClick={() => onSelectTag(effectiveTag)}>
              <Icon name="close" />
              Limpar
            </button>
          )}
          {tags.map(([t, count]) => (
            <button
              key={t}
              className={effectiveTag === t ? 'chip chip--on' : 'chip'}
              type="button"
              aria-pressed={String(effectiveTag === t)}
              onClick={() => onSelectTag(t)}
            >
              {t}
              <span className="chip__count">{String(count)}</span>
            </button>
          ))}
        </div>
      )}
      {confirmDelete && (
        <ConfirmDialog
          title={`Apagar “${confirmDelete.data.title}”?`}
          message={DELETE_MESSAGE}
          confirmLabel="Apagar sessão"
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
        <p className="muted small">As sessões ficam só neste navegador. Apague em Configurações › Privacidade.</p>
      </footer>
    </>
  );
}

export function PastAtaView({ record, isCurrent, now, onBack, onLoad, onDelete, ataProps, footerProps }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <header className="header">
        <button className="icon-button" type="button" aria-label="Voltar" onClick={onBack}>
          <Icon name="back" />
        </button>
        <div className="header__titles">
          <span className="header__app">Sessão</span>
          <span className="header__sub">{formatDateTime(record.meta.startedAt)}</span>
        </div>
        {isCurrent ? (
          <span className="pill">No app</span>
        ) : (
          <Tooltip label="Carregar sessão" side="bottom">
            <button className="icon-button" type="button" aria-label="Carregar sessão" onClick={() => onLoad(record)}>
              <Icon name="enter" />
            </button>
          </Tooltip>
        )}
        {onDelete && (
          <Tooltip label="Apagar sessão" side="bottom">
            <button className="icon-button icon-button--danger" type="button" aria-label="Apagar sessão" onClick={() => setConfirming(true)}>
              <Icon name="trash" />
            </button>
          </Tooltip>
        )}
      </header>
      {confirming && (
        <ConfirmDialog
          title="Apagar esta sessão?"
          message={DELETE_MESSAGE}
          confirmLabel="Apagar sessão"
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

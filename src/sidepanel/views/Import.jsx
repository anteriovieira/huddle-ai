import { useState } from 'react';
import { useT } from '../lib/i18n.js';
import { Icon } from '../ui/Icon.jsx';
import { Field } from '../ui/primitives.jsx';

function todayStr() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export function ImportView({ error, hasKey, onSubmit, onCancel }) {
  const t = useT();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayStr);
  const [text, setText] = useState('');
  const submit = (e) => {
    e.preventDefault();
    onSubmit({ title: title.trim(), date, text });
  };
  // The "Name: caption" format stays bold inside the intro sentence; render around the {fmt} slot.
  const [introPre, introPost] = t('import.intro', { fmt: '\u0000' }).split('\u0000');
  return (
    <>
      <header className="header">
        <button className="icon-button" type="button" aria-label={t('common.back')} onClick={onCancel}>
          <Icon name="back" />
        </button>
        <h1 className="header__app">{t('import.title')}</h1>
      </header>
      <main className="main" id="main">
        <form className="settings" id="import-form" onSubmit={submit}>
          <p className="muted small">
            {introPre}
            <b>{t('import.introFmt')}</b>
            {introPost}
          </p>
          <Field label={t('import.titleLabel')} htmlFor="import-title">
            <input
              id="import-title"
              type="text"
              autoComplete="off"
              placeholder={t('import.titlePlaceholder')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Field label={t('import.dateLabel')} htmlFor="import-date">
            <input
              id="import-date"
              type="date"
              max={todayStr()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label={t('import.transcriptLabel')} htmlFor="import-text">
            <textarea
              id="import-text"
              className="textarea"
              rows={12}
              placeholder={t('import.textPlaceholder')}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </Field>
          {error && (
            <div className="notice notice--error" role="status">
              {error}
            </div>
          )}
        </form>
      </main>
      <footer className="footer footer--row">
        <span className="muted small">{hasKey ? t('import.willGenerate') : t('import.needKey')}</span>
        <button className="button" type="button" onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button className="button button--primary" type="submit" form="import-form">
          <Icon name="upload" />
          {t('import.submit')}
        </button>
      </footer>
    </>
  );
}

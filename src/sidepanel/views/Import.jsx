import { useState } from 'react';
import { Icon } from '../ui/Icon.jsx';
import { Field } from '../ui/primitives.jsx';

function todayStr() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export function ImportView({ error, hasKey, onSubmit, onCancel }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayStr);
  const [text, setText] = useState('');
  const submit = (e) => {
    e.preventDefault();
    onSubmit({ title: title.trim(), date, text });
  };
  return (
    <>
      <header className="header">
        <button className="icon-button" type="button" aria-label="Voltar" onClick={onCancel}>
          <Icon name="back" />
        </button>
        <h1 className="header__app">Importar transcrição</h1>
      </header>
      <main className="main" id="main">
        <form className="settings" id="import-form" onSubmit={submit}>
          <p className="muted small">
            Cole aqui a transcrição de uma reunião que não passou pela extensão. Ela vira uma sessão carregada no app, com
            ata e insights gerados. Linhas no formato <b>Nome: fala</b> são separadas por pessoa.
          </p>
          <Field label="Título (opcional)" htmlFor="import-title">
            <input
              id="import-title"
              type="text"
              autoComplete="off"
              placeholder="Ex.: Planejamento Q4"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Field label="Data da sessão" htmlFor="import-date">
            <input
              id="import-date"
              type="date"
              max={todayStr()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="Transcrição" htmlFor="import-text">
            <textarea
              id="import-text"
              className="textarea"
              rows={12}
              placeholder={'Ana: acho que o Lucas pode tocar billing.\nLucas: consigo entregar até sexta.\n…'}
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
        <span className="muted small">{hasKey ? 'Gera a ata e os insights.' : 'Adicione a chave da API para gerar.'}</span>
        <button className="button" type="button" onClick={onCancel}>
          Cancelar
        </button>
        <button className="button button--primary" type="submit" form="import-form">
          <Icon name="upload" />
          Importar
        </button>
      </footer>
    </>
  );
}

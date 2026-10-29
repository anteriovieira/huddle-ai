import { Icon } from '../ui/Icon.jsx';

function CheckItem({ ok, title, detail }) {
  return (
    <div className="check">
      <span className={ok ? 'check__mark check__mark--ok' : 'check__mark'}>{ok && <Icon name="check" />}</span>
      <span className="row__stack">
        <span className="strong">{title}</span>
        <span className="muted small">{detail}</span>
      </span>
    </div>
  );
}

export function IdleView({ slackOpen, slackReloadTabId, savedCount, onReloadSlackTab, onGoToSlack, onOpenImport, onOpenAtas }) {
  return (
    <main className="idle">
      <div className="idle__hero">
        <div className="idle__icon">
          <Icon name="headphones" />
        </div>
        <h1>Nenhum huddle ativo</h1>
        <p>
          Entre num huddle pelo Slack no navegador e abra a aba <b>Captions</b>. Os insights aparecem aqui.
        </p>
      </div>
      {slackReloadTabId != null && (
        <div className="banner">
          <span className="badge-icon badge-icon--yellow">
            <Icon name="warn" />
          </span>
          <div className="row__stack">
            <span className="strong">Já tem um huddle rolando?</span>
            <span className="muted small">
              Esta aba do Slack foi aberta antes da extensão, então um huddle já em andamento não é capturado. Recarregue a
              aba para começar.
            </span>
            <button className="button button--primary button--block" type="button" onClick={onReloadSlackTab}>
              <Icon name="download" />
              Recarregar aba do Slack
            </button>
          </div>
        </div>
      )}
      <section className="checklist" aria-label="O que falta">
        <CheckItem ok={slackOpen} title="Slack aberto no navegador" detail="app.slack.com" />
        <CheckItem ok={false} title="Janela do huddle aberta" detail="Inicie ou entre num huddle" />
        <CheckItem ok={false} title="Captions ativadas" detail="Aba Captions na janela do huddle" />
      </section>
      {slackOpen && (
        <p className="muted small center">
          Huddle já aberto e nada aqui? Recarregue a aba do Slack (o huddle precisa ser aberto depois da extensão) e entre de
          novo.
        </p>
      )}
      <div className="idle__footer">
        <button className="button button--primary button--block" type="button" onClick={onGoToSlack}>
          Ir para o Slack
        </button>
        <button className="button button--block" type="button" onClick={onOpenImport}>
          <Icon name="upload" />
          Importar transcrição
        </button>
        {savedCount > 0 && (
          <button className="button button--block" type="button" onClick={onOpenAtas}>
            {`Sessões anteriores (${savedCount})`}
          </button>
        )}
        <p className="muted small center">
          As legendas ficam no seu navegador. Só o texto analisado é enviado à API da Anthropic para gerar os insights.
        </p>
      </div>
    </main>
  );
}

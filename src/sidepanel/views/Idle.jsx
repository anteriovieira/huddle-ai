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
        <div className="idle__reload">
          <p className="muted small">
            Já tem um huddle rolando? Conecte esta aba e reabra o huddle — sem recarregar a página.
          </p>
          <button className="button button--block" type="button" onClick={onConnectSlackTab}>
            <Icon name="enter" />
            Conectar a esta aba
          </button>
          <button className="link" type="button" onClick={onReloadSlackTab}>
            ou recarregar a aba
          </button>
        </div>
      )}
      {slackOpen && slackReloadTabId == null && (
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

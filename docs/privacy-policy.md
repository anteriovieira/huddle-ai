# Política de Privacidade — Huddle AI

_Última atualização: 2026-11-05_

O Huddle AI é uma extensão do Chrome que lê as legendas de um huddle do Slack e gera insights, transcrição e ata num painel lateral, usando um provedor de inteligência artificial escolhido por você.

## Resumo

**Não operamos nenhum servidor.** A extensão não tem backend. Nada que ela processa é enviado para o desenvolvedor. Os dados vão apenas do seu navegador para os serviços que **você** configura (o provedor de IA e, opcionalmente, o Google Drive).

## Quais dados a extensão processa

- **Legendas do huddle**: o texto das falas e os nomes dos participantes exibidos pelo Slack, enquanto você está numa reunião com legendas ativadas.
- **Chave de API**: a credencial do provedor de IA que você informa.
- **Configurações e histórico**: preferências, transcrições, insights e atas das sessões.

## Como os dados são usados e para onde vão

- As legendas são enviadas **diretamente do seu navegador para o provedor de IA que você escolheu** (Anthropic, OpenAI, Google, Groq, OpenRouter, Cerebras ou Mistral), autenticadas com a sua chave de API, para gerar os insights e a ata. Consulte a política de privacidade do provedor escolhido para saber como ele trata esses dados.
- A **ata é enviada ao seu Google Drive apenas quando você clica para enviá-la**. A extensão usa o escopo `drive.file`, que dá acesso somente aos arquivos que ela mesma cria.
- **Todo o resto fica armazenado localmente** no seu navegador, via `chrome.storage` (a chave de API e as configurações, o huddle atual e suas legendas, e o histórico de sessões).

## O que a extensão NÃO faz

- Não envia nenhum dado para servidores do desenvolvedor.
- Não vende nem compartilha seus dados com terceiros.
- Não usa seus dados para publicidade, perfilamento, análise de crédito ou qualquer finalidade alheia ao funcionamento da extensão.
- Não coleta analytics nem telemetria.

## Retenção e exclusão

Os dados ficam no seu navegador até você removê-los. Você pode apagar sessões no histórico dentro da extensão, desconectar o Google Drive (o que revoga o token) em **Configurações**, ou remover a extensão — o que elimina tudo o que ela guardou em `chrome.storage`.

## Contato

Dúvidas sobre esta política podem ser abertas como issue no repositório do projeto no GitHub.

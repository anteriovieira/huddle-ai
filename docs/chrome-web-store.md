# Publicação na Chrome Web Store — Huddle AI

Guia e justificativas para a submissão da extensão no [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole). Cada seção traz o texto pronto para colar no formulário e a justificativa que o time de revisão exige.

> Resumo em uma linha: a extensão lê as legendas de um huddle do Slack e, no painel lateral do Chrome, gera insights, transcrição e ata usando um modelo de IA com a chave de API do próprio usuário. Nenhum dado trafega por servidores do desenvolvedor.

---

## 1. Propósito único (single purpose)

A Chrome Web Store exige que a extensão tenha um propósito único e estreito.

**Texto para colar:**

> O Huddle AI tem um único propósito: assistir reuniões por voz (huddles) do Slack na web. Ele lê as legendas ao vivo do huddle e, no painel lateral do Chrome, apresenta insights da conversa, a transcrição por participante e uma ata ao final — processados por um provedor de IA escolhido pelo usuário, com a chave de API dele.

---

## 2. Permissões — justificativas

Cole cada justificativa no campo correspondente do dashboard. São exatamente as permissões declaradas em [`extension/manifest.json`](../extension/manifest.json).

### `sidePanel`
> Toda a interface da extensão vive no painel lateral do Chrome (`side_panel`). A permissão é necessária para abrir e renderizar esse painel ao lado da aba do Slack.

### `storage`
> Guarda localmente as configurações do usuário (chave de API, modelo, idioma, preferências), o huddle em andamento e suas legendas (`chrome.storage.session`) e o histórico de sessões encerradas com suas atas (`chrome.storage.local`). Nenhum desses dados sai do navegador por meio da extensão.

### `identity`
> Usada **apenas** quando o usuário opta por enviar uma ata para o Google Drive. Obtém um token OAuth via `chrome.identity.getAuthToken` com o escopo `drive.file`, que dá acesso somente aos arquivos criados pela própria extensão. Também lê o e-mail da conta (`getProfileUserInfo`) para exibir qual conta está conectada. É opcional: sem usar o Drive, a permissão nunca é acionada.

### `scripting`
> Permite injetar e coordenar os scripts de leitura das legendas na aba do Slack (`app.slack.com`) a partir do service worker, inclusive reinjetar após recarga da aba, para que a captura das legendas funcione de forma confiável.

### Content scripts em `app.slack.com`
> A extensão registra content scripts que rodam somente em `https://app.slack.com/*`. O Slack abre a janela do huddle como um popup `about:blank` renderizado a partir da aba principal; o Chrome não roda content scripts nesse popup, então `page-hook.js` roda no mundo JS da própria página (`world: MAIN`) para alcançá-lo via `window.open`. `scanner.js` localiza o painel de legendas e extrai `{ participante, texto }`, e `content.js` (mundo isolado) faz a ponte com o service worker. Eles leem apenas o DOM das legendas — não modificam o Slack.

---

## 3. Host permissions — justificativas

As origens em `host_permissions` dividem-se em **a origem lida** (Slack) e **os destinos das chamadas de IA**. Cada chamada de IA vai direto do navegador para o provedor, com a chave do usuário.

| Origem | Por quê |
|---|---|
| `https://app.slack.com/*` | Onde o huddle e as legendas vivem. A extensão lê as legendas dessa aba. |
| `https://api.anthropic.com/*` | Destino das chamadas quando o usuário escolhe um modelo **Claude (Anthropic)**. |
| `https://api.openai.com/*` | Destino quando o usuário escolhe um modelo **OpenAI**. |
| `https://generativelanguage.googleapis.com/*` | Destino quando o usuário escolhe um modelo **Google Gemini**. |
| `https://api.groq.com/*` | Destino quando o usuário escolhe **Groq**. |
| `https://openrouter.ai/*` | Destino quando o usuário escolhe **OpenRouter**. |
| `https://api.cerebras.ai/*` | Destino quando o usuário escolhe **Cerebras**. |
| `https://api.mistral.ai/*` | Destino quando o usuário escolhe **Mistral**. |
| `https://www.googleapis.com/*` | Upload opcional da ata para o **Google Drive** (escopo `drive.file`). |

**Texto para colar (resumo das host permissions):**

> `app.slack.com` é a origem de onde a extensão lê as legendas do huddle. As demais origens são os endpoints dos provedores de IA (Anthropic, OpenAI, Google, Groq, OpenRouter, Cerebras, Mistral) para onde a transcrição é enviada — diretamente do navegador, usando a chave de API do próprio usuário — e `www.googleapis.com` é usado apenas no envio opcional da ata ao Google Drive. A extensão só chama o provedor que o usuário selecionou.

---

## 4. Código remoto (remote code)

**Texto para colar:**

> A extensão **não** usa código remoto. Todo o JavaScript é empacotado no pacote da extensão (`extension/sidepanel.js`, gerado por esbuild) e distribuído na própria submissão. As chamadas de rede são apenas requisições de dados (fetch) às APIs dos provedores de IA e ao Google Drive; nenhum script é baixado e executado em tempo de execução.

---

## 5. Uso e privacidade de dados (Data usage)

Preencha as declarações de dados no dashboard conforme abaixo.

**O que a extensão processa:**
- **Legendas do huddle** (conteúdo da reunião, incluindo nomes dos participantes que o Slack exibe).
- **Chave de API** do provedor de IA, informada pelo usuário.
- **Configurações e histórico** de sessões (atas, transcrições, insights).

**Para onde vai:**
- As legendas são enviadas **diretamente do navegador para o provedor de IA escolhido pelo usuário**, autenticadas com a chave dele. Não há servidor intermediário do desenvolvedor.
- A ata, **apenas se o usuário pedir**, é enviada ao Google Drive do próprio usuário (escopo `drive.file`).
- Tudo o mais fica em `chrome.storage` no navegador do usuário.

**Declarações exigidas (marcar no formulário):**
- ✅ A extensão coleta/transmite *web content* do usuário (as legendas) — enviado ao provedor de IA sob controle do usuário.
- ✅ A extensão manuseia *authentication information* (a chave de API) — armazenada localmente, nunca enviada ao desenvolvedor.
- ❌ **Não** vende dados a terceiros.
- ❌ **Não** usa nem transfere dados para fins não relacionados ao propósito único.
- ❌ **Não** usa nem transfere dados para determinar solvência (creditworthiness) ou para empréstimos.
- ❌ **Não** há coleta de analytics pelo desenvolvedor; a extensão não possui backend.

**Política de privacidade:** o dashboard exige uma URL de política de privacidade porque a extensão manuseia conteúdo do usuário e chave de autenticação. Publique uma página (ex.: `PRIVACY.md` no repositório via GitHub Pages) cobrindo os pontos acima. Um rascunho vive em [`docs/privacy-policy.md`](./privacy-policy.md).

---

## 6. Ficha da loja (store listing)

| Campo | Valor para colar |
|---|---|
| **Nome** | Huddle AI |
| **Resumo (≤132 car.)** | Insights ao vivo, transcrição e ata dos huddles do Slack — no painel lateral, com a sua chave de IA. |
| **Categoria** | **Workflow & Planning** (taxonomia atual da store). Alternativa: **Communication**. |
| **Idioma padrão da ficha** | Português (Brasil) |

> O resumo acima tem 108 caracteres (limite 132). O nome na store é **Huddle AI** (o `name` do manifest também é "Huddle AI").

**Descrição detalhada (rascunho para colar):**

> O Huddle AI acompanha seus huddles do Slack na web e trabalha enquanto você conversa.
>
> • **Insights ao vivo** — tópico atual, pontos levantados, ações (com responsável e prazo), decisões e perguntas em aberto, atualizados a cada poucos segundos.
> • **Transcrição por participante** — as legendas do huddle viram um histórico limpo, com ações marcadas na linha. Copie ou baixe.
> • **Ata automática** — resumo, decisões, próximos passos, perguntas em aberto e riscos ao fim da reunião. Exporte em Markdown, envie ao Google Drive ou poste no thread.
>
> Você usa a sua própria chave de API (Anthropic, OpenAI, Google Gemini, Groq, OpenRouter, Cerebras ou Mistral). Nada passa por servidores nossos: as legendas vão direto do seu navegador para o provedor que você escolher, e o histórico fica guardado localmente.
>
> Como usar: abra o painel, cole a chave da API em Configurações, entre num huddle no Slack e abra a aba de legendas (Captions).

---

## 7. Ficha — conta, contato e distribuição

Campos da aba **Account** e das abas de **Privacy practices** / **Distribution** do dashboard.

| Campo | Valor para colar |
|---|---|
| **E-mail de contato do desenvolvedor** | `anteriovieira@gmail.com` (precisa ser verificado no dashboard) |
| **Site / homepage** (opcional) | URL do repositório no GitHub |
| **URL de suporte** (opcional) | Página de *issues* do repositório |
| **URL da política de privacidade** | Obrigatória — ver seção 5 (publicar `docs/privacy-policy.md` via GitHub Pages) |
| **Visibilidade** | Público (ou **Não listado** para testar antes) |
| **Distribuição / regiões** | Todas as regiões |
| **Preço** | Gratuito |
| **Contém anúncios** | Não |
| **Conteúdo adulto / mature** | Não |

---

## 8. Assets de imagem

Todos gerados, versionados e com as dimensões conferidas. Formatos aceitos pela store: PNG ou JPEG de 24 bits (sem canal alpha nos screenshots).

### Ícones (dentro do pacote `.zip`, declarados no `manifest.json`)

| Ícone | Tamanho | Arquivo | Onde é usado |
|---|---|---|---|
| Ícone 16 | 16×16 | [`extension/icons/icon16.png`](../extension/icons/icon16.png) | Barra de ferramentas / favicon |
| Ícone 32 | 32×32 | [`extension/icons/icon32.png`](../extension/icons/icon32.png) | Barra de ferramentas (telas HiDPI) |
| Ícone 48 | 48×48 | [`extension/icons/icon48.png`](../extension/icons/icon48.png) | Página `chrome://extensions` |
| Ícone 128 | 128×128 | [`extension/icons/icon128.png`](../extension/icons/icon128.png) | **Ícone da loja** + instalação |

### Imagens da ficha (upload manual no dashboard, **não** vão no `.zip`)

| Asset | Tamanho exigido | Arquivo | Obrigatório? |
|---|---|---|---|
| Screenshot 1 — Insights | 1280×800 | [`docs/store/insights.png`](./store/insights.png) | Sim (mín. 1) |
| Screenshot 2 — Captions | 1280×800 | [`docs/store/captions.png`](./store/captions.png) | Recomendado |
| Screenshot 3 — Ata | 1280×800 | [`docs/store/ata.png`](./store/ata.png) | Recomendado |
| Small promo tile | 440×280 | [`docs/store/small.png`](./store/small.png) | Opcional |
| Marquee promo tile | 1400×560 | [`docs/store/marquee.png`](./store/marquee.png) | Opcional |

Os screenshots usam dados de exemplo renderizados com os componentes reais do painel (um huddle fictício sobre migração de gateway de billing). Nenhum dado real de reunião aparece. Mínimo da store: ícone 128×128 + pelo menos 1 screenshot; os promo tiles são opcionais, porém recomendados.

---

## 9. Checklist de submissão

- [ ] `npm run build` com a versão final; conferir `version` em `manifest.json` (atual: **0.1.178**).
- [x] `oauth2.client_id` já é o client ID real do Google Cloud (não é mais placeholder).
- [ ] Gerar o `.zip` da pasta `extension/` **removendo o campo `key` do `manifest.json`** (a store rejeita `key`; ela atribui o próprio ID). Não incluir `key.pem` nem as fontes `src/`.
- [ ] Preencher propósito único, justificativas de permissão e host permissions (seções 1–3).
- [ ] Declarar uso de dados e anexar a URL da política de privacidade (seção 5).
- [ ] Preencher contato, distribuição e visibilidade (seção 7).
- [ ] Enviar os 3 screenshots + ícone 128×128; opcionalmente os 2 promo tiles (seção 8).
- [ ] Revisar o nome, a categoria, a descrição e o resumo (seção 6).

> **Dica do `.zip`:** para gerar o pacote sem o campo `key`, copie `extension/` para uma pasta temporária, remova a chave `"key"` do `manifest.json` dessa cópia e compacte o conteúdo dela. O repositório mantém o `key` de propósito — ele fixa o ID local `lnffnbbmkiafgmglepfcjdchaahjoooe`, de que depende o OAuth do Google Drive em desenvolvimento.

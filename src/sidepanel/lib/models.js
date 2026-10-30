// Static data shared by the API layer and the UI: model list and minutes categories.

// Providers suportados. placeholder/label alimentam os campos de chave nas configurações.
// IDs de modelo abaixo seguem a doc de cada provider (out/2026) e podem mudar — o campo de
// "modelo personalizado" nas configurações cobre IDs novos sem precisar editar isto.
export const PROVIDERS = {
  anthropic: { label: 'Anthropic', keyPlaceholder: 'sk-ant-…', keyUrl: 'https://console.anthropic.com/settings/keys' },
  openai: { label: 'OpenAI', keyPlaceholder: 'sk-…', keyUrl: 'https://platform.openai.com/api-keys' },
  google: { label: 'Google', keyPlaceholder: 'AIza…', keyUrl: 'https://aistudio.google.com/apikey' },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS);

// label segue a convenção "Nome — descrição": minutes.js modelLabel() usa o trecho antes do " — ".
export const MODELS = [
  { id: 'claude-opus-5-5', provider: 'anthropic', label: 'Claude Opus 5.5 — mais preciso' },
  { id: 'claude-sonnet-5-5', provider: 'anthropic', label: 'Claude Sonnet 5.5 — equilibrado' },
  { id: 'claude-haiku-5-5', provider: 'anthropic', label: 'Claude Haiku 5.5 — mais rápido' },
  { id: 'gpt-5.5', provider: 'openai', label: 'GPT-5.5 — mais preciso' },
  { id: 'gpt-5-mini', provider: 'openai', label: 'GPT-5 mini — mais rápido' },
  { id: 'gemini-3.8-flash', provider: 'google', label: 'Gemini 3.8 Flash — equilibrado' },
  { id: 'gemini-3.5-flash-lite', provider: 'google', label: 'Gemini 3.5 Flash-Lite — mais rápido' },
];

// Provider do modelo atual. Modelos conhecidos trazem o provider na lista; um modelo
// personalizado usa settings.modelProvider (escolhido ao digitar o ID).
export function providerOf(settings) {
  const known = MODELS.find((m) => m.id === settings?.model);
  if (known) return known.provider;
  return PROVIDERS[settings?.modelProvider] ? settings.modelProvider : 'anthropic';
}

// Chave da API do provider do modelo atual (string vazia quando não configurada).
export function apiKeyFor(settings) {
  return settings?.apiKeys?.[providerOf(settings)]?.trim() ?? '';
}

// Há chave configurada para o modelo selecionado?
export function hasKeyForModel(settings) {
  return Boolean(apiKeyFor(settings));
}

export const MINUTES_CATEGORIES = [
  'Planejamento',
  'Daily',
  'Alinhamento',
  'Vendas',
  'Suporte',
  '1:1',
  'Retrospectiva',
  'Entrevista',
  'Outro',
];

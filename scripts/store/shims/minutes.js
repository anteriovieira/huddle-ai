// Screenshot-only replacement for src/sidepanel/lib/minutes.js. Re-exports the real module and only
// widens CATEGORY_TONES so the English classification labels ("Planning", …) keep their accent color
// (the shipped map is keyed on the Portuguese category names).
export * from '../../../src/sidepanel/lib/minutes.js';

export const CATEGORY_TONES = {
  Planning: 'blue',
  Planejamento: 'blue',
  Daily: 'green',
  Alignment: 'yellow',
  Alinhamento: 'yellow',
  Sales: 'purple',
  Vendas: 'purple',
  Support: 'blue',
  Suporte: 'blue',
  Retro: 'yellow',
  Retrospectiva: 'yellow',
};

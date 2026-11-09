// Screenshot-only replacement for src/sidepanel/insights.js. The store screenshots run the real UI
// with pre-seeded demo state, so no model is ever called. Every export here is a no-op that echoes
// the already-stored demo data (or returns an empty result), which keeps App.jsx's analysis/minutes
// loops from hitting the network while still producing a well-formed object.
const api = typeof chrome !== 'undefined' ? chrome : undefined;

export async function analyze() {
  try {
    const { insights } = await api.storage.session.get('insights');
    return insights?.data ?? {};
  } catch {
    return {};
  }
}

export async function generateMinutes() {
  try {
    const { minutes } = await api.storage.session.get('minutes');
    return minutes?.data ?? {};
  } catch {
    return {};
  }
}

export async function askMeeting() {
  return '';
}

export async function recallContextBatch() {
  return [];
}

export async function titleChat() {
  return 'Chat 1';
}

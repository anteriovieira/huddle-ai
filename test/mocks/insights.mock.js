// Test double for src/sidepanel/insights.js — no network. Lets us drive the chat UI and
// observe tab renaming deterministically.

export const titleCalls = [];
export const askCalls = [];

export async function titleChat({ question }) {
  titleCalls.push(question);
  // Deterministic, unique-ish title derived from the question.
  return `Título: ${question.slice(0, 20)}`;
}

export async function askMeeting({ question, onText }) {
  askCalls.push(question);
  onText?.('resposta ');
  onText?.('final');
  return 'resposta final';
}

export async function analyze() {
  throw new Error('analyze not used in this test');
}

export async function generateMinutes() {
  throw new Error('generateMinutes not used in this test');
}

// English marketing copy for the Chrome Web Store promo tiles (mirrors the Portuguese originals).
// `.g` wraps the words rendered in the green accent in headlines.
export const COPY = {
  insights: {
    live: true,
    badge: 'Live',
    h1: 'Insights <span class="g">while</span> the meeting happens',
    sub: 'Current topic, points raised, actions, decisions and open questions — refreshed every few seconds.',
    bullets: ['Actions with owner and due date', 'Alerts when you’re mentioned', 'Acronyms and references explained'],
  },
  captions: {
    badge: 'Transcript',
    h1: 'Captions become a <span class="g">clean history</span>',
    sub: 'Every line with who said it and when. Detected actions are flagged right on the line.',
    bullets: ['Reads the captions from your Slack huddle', 'Groups them by speaker', 'Copy or download the transcript'],
  },
  ata: {
    badge: 'Minutes',
    h1: 'The minutes, ready <span class="g">when the huddle ends</span>',
    sub: 'Summary, decisions, next steps, open questions and risks — generated on their own when the meeting ends.',
    bullets: ['Next steps with owner and due date', 'Export to Markdown or Google Drive', 'Post the summary to the thread'],
  },
  analytics: {
    badge: 'Analytics',
    h1: 'Every meeting, <span class="g">scored and coached</span>',
    sub: 'Each huddle rated by criterion and by participant, with what went well and what to improve next time.',
    bullets: ['Radar of direction, decisions and execution', 'Per-participant strengths and focus', 'Trends across your past sessions'],
  },
  marquee: {
    h1: 'Your Slack huddle, <span class="g">organized on its own</span>',
    sub: 'Live insights, a speaker-by-speaker transcript and the minutes ready at the end — without leaving the meeting.',
  },
  small: {
    sub: 'Live insights, captions and minutes for your Slack huddles — right in the side panel.',
  },
};

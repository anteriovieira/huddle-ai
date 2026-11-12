// Parsing a pasted transcript into utterances. Pure — unit-tested in Node.
//
// Three shapes are supported:
//   A) "Name: text" lines (optionally prefixed by a "#N" line number and/or a [hh:mm:ss] stamp).
//      This covers the exact shape formatTranscript() emits, so our own output re-imports cleanly.
//   B) Blank-line-separated blocks where the FIRST line is the speaker and the following
//      line(s) are what they said — the shape Slack/meeting exports produce, e.g.
//          Onezino Moreira
//          Highlight generated total.
//   C) Fallback: one utterance per line when neither shape is detected.

// Optional leading "#N " is our own formatTranscript() line number, so a transcript we emit
// parses back cleanly. Then the optional [hh:mm:ss] stamp, the speaker, and the text.
const INLINE = /^\s*(?:#\d+\s+)?(?:\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s+)?([^:]{1,40}?)\s*:\s*(.+?)\s*$/;

// "12:00" / "01:02:03" / "[00:12]" -> milliseconds, or null.
export function parseStamp(value) {
  const parts = value.split(':').map(Number);
  if (parts.some(Number.isNaN)) return null;
  const sec = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
  return sec * 1000;
}

// A short, punctuation-free label is probably a speaker name, not a sentence with a colon.
// A trailing dot is tolerated — usernames like "bignerve123." carry one — but internal
// sentence punctuation still disqualifies, as does the word-count cap.
export function looksLikeSpeaker(name) {
  const text = name.trim().replace(/\.+$/, '');
  return !!text && text.length <= 40 && !/[.!?]/.test(text) && text.split(/\s+/).length <= 5;
}

// Presence/system events a meeting export mixes in — never actual speech.
function isPresenceEvent(text) {
  return /\b(joined|left|rejoined)\b.*\bhuddle\b/i.test(text) || /\b(entrou|saiu)\b.*\bhuddle\b/i.test(text);
}

// Format A: "Name: text" line by line, folding continuation lines into the last speaker.
function parseInline(lines) {
  const out = [];
  let base = null;
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const match = trimmed.match(INLINE);
    if (match && looksLikeSpeaker(match[2])) {
      const stamp = match[1] ? parseStamp(match[1]) : null;
      if (stamp != null && base == null) base = stamp;
      const at = stamp != null && base != null ? stamp - base : (out.at(-1)?.at ?? 0);
      out.push({ id: `imp-${out.length}`, speaker: match[2].trim(), text: match[3].trim(), at });
    } else if (out.length) {
      out[out.length - 1].text += ` ${trimmed}`;
    } else {
      out.push({ id: `imp-${out.length}`, speaker: 'Transcrição', text: trimmed, at: 0 });
    }
  }
  return out;
}

// Format B: each block is [speaker, ...textLines]. Presence events and empty bodies are dropped.
function parseBlocks(blocks) {
  const out = [];
  for (const block of blocks) {
    const speaker = block[0].replace(/[.,:;·\-\s]+$/, '').trim();
    const body = block.slice(1).join(' ').trim();
    if (!speaker || !body || isPresenceEvent(body)) continue;
    out.push({ id: `imp-${out.length}`, speaker, text: body, at: out.length * 1000 });
  }
  return out;
}

function fallback(lines) {
  return lines
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l, i) => ({ id: `imp-${i}`, speaker: 'Transcrição', text: l, at: 0 }));
}

// Turns pasted transcript text into utterances, picking the shape that fits.
export function parseTranscript(text) {
  const raw = (text ?? '').replace(/\r/g, '');
  const lines = raw.split('\n');

  // A) Any "Name: text" line present → inline parser.
  if (lines.some((l) => { const m = l.trim().match(INLINE); return m && looksLikeSpeaker(m[2]); })) {
    return parseInline(lines);
  }

  // B) Blank-line-separated blocks, most with a name line + a text line.
  const blocks = raw
    .split(/\n\s*\n/)
    .map((b) => b.split('\n').map((s) => s.trim()).filter(Boolean))
    .filter((b) => b.length);
  // Needs real blank-line separation (2+ blocks) so a single 2-line paste stays ambiguous
  // and falls through to one-utterance-per-line instead of being read as name + text.
  const multiLineBlocks = blocks.filter((b) => b.length >= 2).length;
  if (blocks.length >= 2 && multiLineBlocks >= Math.ceil(blocks.length / 2)) {
    const out = parseBlocks(blocks);
    if (out.length) return out;
  }

  // C) Fallback: one utterance per line.
  return fallback(lines);
}

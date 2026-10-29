// Parsing a pasted transcript into utterances. Pure — unit-tested in Node.

// "12:00" / "01:02:03" / "[00:12]" -> milliseconds, or null.
export function parseStamp(value) {
  const parts = value.split(':').map(Number);
  if (parts.some(Number.isNaN)) return null;
  const sec = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
  return sec * 1000;
}

// A short, punctuation-free label is probably a speaker name, not a sentence with a colon.
export function looksLikeSpeaker(name) {
  const text = name.trim();
  return !!text && text.length <= 40 && !/[.!?]/.test(text) && text.split(/\s+/).length <= 5;
}

// Turns pasted transcript text into utterances. Handles "Name: text" lines (with an
// optional leading [hh:mm:ss] stamp) and folds continuation lines into the last speaker.
// Falls back to one line per utterance when no speaker labels are found.
export function parseTranscript(text) {
  const lines = (text ?? '').replace(/\r/g, '').split('\n');
  const line = /^\s*(?:\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s+)?([^:]{1,40}?)\s*:\s*(.+?)\s*$/;
  const out = [];
  let base = null;
  let matchedAny = false;
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const match = trimmed.match(line);
    if (match && looksLikeSpeaker(match[2])) {
      matchedAny = true;
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
  if (!matchedAny) {
    return lines
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l, i) => ({ id: `imp-${i}`, speaker: 'Transcrição', text: l, at: 0 }));
  }
  return out;
}

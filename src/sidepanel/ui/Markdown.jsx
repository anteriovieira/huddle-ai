// Renders model text as Markdown. Output is sanitized before it touches the DOM, since
// the model may echo content from the (untrusted) transcript. Links open in a new tab.

import { useEffect, useRef } from 'react';
import { marked } from 'marked';
import createDOMPurify from 'dompurify';

marked.setOptions({ gfm: true, breaks: true });

// In the browser the default export is already bound to `window`; under Node (tests) it is a
// factory that must be called with a window. Handle both so the helper is testable.
const DOMPurify = typeof createDOMPurify.sanitize === 'function' ? createDOMPurify : createDOMPurify(globalThis.window);

export function markdownToHtml(text) {
  return DOMPurify.sanitize(marked.parse(text ?? '', { async: false }));
}

export function Markdown({ text, className = 'md' }) {
  const ref = useRef(null);
  const html = markdownToHtml(text);
  useEffect(() => {
    ref.current?.querySelectorAll('a').forEach((a) => {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    });
  }, [html]);
  return <div ref={ref} className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

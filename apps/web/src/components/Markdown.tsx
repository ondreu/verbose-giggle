// Minimal, dependency-free Markdown renderer for LLM narration (#1).
// Builds React elements directly (no dangerouslySetInnerHTML) so untrusted
// model output can never inject markup. Supports the subset the DM actually
// emits: headings, horizontal rules, bold/italic, inline code, and
// unordered/ordered lists. Anything else falls through as plain text.
import { Fragment, type ReactNode } from "react";

/** Parse inline spans: **bold**, *italic* / _italic_, `code`. */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  // Order matters: match bold before single-emphasis.
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_|`([^`]+)`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = `${keyPrefix}-${i++}`;
    if (m[2] !== undefined) out.push(<strong key={key}>{m[2]}</strong>);
    else if (m[3] !== undefined) out.push(<em key={key}>{m[3]}</em>);
    else if (m[4] !== undefined) out.push(<em key={key}>{m[4]}</em>);
    else if (m[5] !== undefined)
      out.push(
        <code key={key} className="rounded-sm bg-bg-crust/70 px-1 font-log text-[0.92em]">
          {m[5]}
        </code>,
      );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let key = 0;

  const flushList = () => {
    if (!list) return;
    const items = list.items.map((it, i) => <li key={i}>{inline(it, `li-${key}-${i}`)}</li>);
    blocks.push(
      list.ordered ? (
        <ol key={key++} className="my-2 list-decimal space-y-0.5 pl-5">
          {items}
        </ol>
      ) : (
        <ul key={key++} className="my-2 list-disc space-y-0.5 pl-5">
          {items}
        </ul>
      ),
    );
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushList();
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const hr = /^(-{3,}|\*{3,}|_{3,})$/.test(line.trim());
    const ul = /^\s*[-*]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+\.\s+(.*)$/.exec(line);

    if (hr) {
      flushList();
      blocks.push(<hr key={key++} className="my-3 border-t border-gold/25" />);
    } else if (heading) {
      flushList();
      const level = heading[1]!.length;
      const content = inline(heading[2] ?? "", `h-${key}`);
      blocks.push(
        level === 1 ? (
          <h3 key={key++} className="mb-1 mt-2 font-display text-lg text-gold">{content}</h3>
        ) : level === 2 ? (
          <h4 key={key++} className="mb-1 mt-2 font-display text-base text-gold/90">{content}</h4>
        ) : (
          <h5 key={key++} className="mb-1 mt-2 font-display text-sm uppercase tracking-wide text-gold/80">{content}</h5>
        ),
      );
    } else if (ul) {
      if (!list || list.ordered) flushList();
      list = list ?? { ordered: false, items: [] };
      list.items.push(ul[1] ?? "");
    } else if (ol) {
      if (!list || !list.ordered) flushList();
      list = list ?? { ordered: true, items: [] };
      list.items.push(ol[1] ?? "");
    } else {
      flushList();
      blocks.push(
        <p key={key++} className="mb-2 last:mb-0">
          {inline(line, `p-${key}`)}
        </p>,
      );
    }
  }
  flushList();

  return <div className={className}>{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>;
}

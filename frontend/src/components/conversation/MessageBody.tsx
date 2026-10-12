import { Fragment } from "react";

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])/g;
const EMOJI_ONLY_RE = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️|\s)+$/u;

/** Signal enlarges messages made of 1–3 emoji ("jumbomoji"). */
export function jumboEmojiCount(text: string): number {
  const t = text.trim();
  if (!t || !EMOJI_ONLY_RE.test(t) || /\d/.test(t)) return 0;
  const count = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(t)].filter(
    (s) => s.segment.trim(),
  ).length;
  return count <= 3 ? count : 0;
}

/** Message text with clickable links; preserves newlines. */
export function MessageBody({ text, linkClass }: { text: string; linkClass: string }) {
  const parts = text.split(URL_RE);
  return (
    <span className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className={`underline ${linkClass}`}>
            {part}
          </a>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </span>
  );
}

/**
 * Insight body renderer.
 *
 * Insight bodies are author-controlled (we generate them in detectors —
 * never user input). They include only `**bold**` markup. We render manually
 * via `String.split` rather than pulling react-markdown:
 *
 *   1. Smaller bundle (~50KB saved).
 *   2. Zero risk of XSS via a malformed markdown engine bug.
 *   3. React escapes plain string children, so any HTML in the body becomes
 *      literal text — no `dangerouslySetInnerHTML` needed.
 *
 * Newlines are preserved with `whitespace-pre-line` so detectors can compose
 * multi-line bodies if they want (none currently do, but the affordance is free).
 */

const BOLD_TOKEN = /\*\*([^*]+)\*\*/g;

export interface MarkdownBodyProps {
  /** The raw insight body string. Must not be `null`/`undefined`. */
  children: string;
  /** Override the default colour (e.g., for cards on a dark surface). */
  className?: string;
}

export function MarkdownBody({ children, className }: MarkdownBodyProps) {
  // String.split with a capturing group preserves the captured pieces, so
  // even-indexed segments are plain text and odd-indexed are bold content.
  const parts = children.split(BOLD_TOKEN);
  return (
    <p className={className ?? 'whitespace-pre-line text-sm text-muted-foreground'}>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <strong key={`bold-${String(i)}`} className="font-semibold text-foreground">
            {part}
          </strong>
        ) : (
          part
        ),
      )}
    </p>
  );
}

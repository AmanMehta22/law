import React from 'react';

interface TextAnswerProps {
  text: string;
}

/**
 * Renders a bot answer as lightly-structured text.
 *
 * The answer prompts (generalAnswer / caseAnswer) compose PLAIN_LANGUAGE_RULES,
 * which asks for four bold headings ("**Short answer**", "**Why**", "**What you
 * can do now**", "**The law behind this**"), `- ` bullets, `1. ` numbered steps
 * and a blank line between blocks. Older answers also emitted `## headings` and
 * `*`/`•` bullets, so those stay supported.
 *
 * This is a deliberately small renderer, not a full markdown engine: it covers
 * the structures the model actually emits, with no external dependency. Anything
 * outside that set - tables, blockquotes, code fences, nested lists - reaches
 * the user as literal punctuation, which is why the prompt's formatting list is
 * closed. If you widen one, widen the other.
 */

// Inline emphasis: **bold** and *italic*. Bold is matched first so it is never
// mistaken for two italics. Content with no marker is returned as plain text.
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;

  return text.split(pattern).map((part, index) => {
    if (!part) {
      return null;
    }

    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong
          key={`${keyPrefix}-b-${index}`}
          className="font-semibold text-neutral-950"
        >
          {part.slice(2, -2)}
        </strong>
      );
    }

    if (part.length > 2 && part.startsWith('*') && part.endsWith('*')) {
      return <em key={`${keyPrefix}-i-${index}`}>{part.slice(1, -1)}</em>;
    }

    return <React.Fragment key={`${keyPrefix}-t-${index}`}>{part}</React.Fragment>;
  });
}

type ListBlock = { ordered: boolean; items: string[] };

export const TextAnswer: React.FC<TextAnswerProps> = ({ text }) => {
  const lines = text.replace(/\r\n/g, '\n').split('\n');

  const blocks: React.ReactNode[] = [];
  let paragraph: string[] = [];
  let list: ListBlock | null = null;
  let counter = 0;

  const flushParagraph = () => {
    if (paragraph.length === 0) {
      return;
    }

    const joined = paragraph.join(' ');
    const key = `p-${counter++}`;
    blocks.push(<p key={key}>{renderInline(joined, key)}</p>);
    paragraph = [];
  };

  const flushList = () => {
    if (!list) {
      return;
    }

    const key = `l-${counter++}`;
    const current = list;
    const items = current.items.map((item, index) => (
      <li key={`${key}-${index}`} className="pl-1">
        {renderInline(item, `${key}-${index}`)}
      </li>
    ));

    blocks.push(
      current.ordered ? (
        <ol key={key} className="list-decimal pl-5 space-y-1">
          {items}
        </ol>
      ) : (
        <ul key={key} className="list-disc pl-5 space-y-1">
          {items}
        </ul>
      ),
    );

    list = null;
  };

  for (const raw of lines) {
    const trimmed = raw.trim();

    // Blank line: end the current paragraph, but keep an open list running so
    // bullets separated by blank lines still render as one list.
    if (trimmed === '') {
      flushParagraph();
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    // A line that is nothing but bold text is a heading. PLAIN_LANGUAGE_RULES
    // asks the model for `**Short answer**` rather than `## Short answer`,
    // because bold reads better in a chat bubble than a hash. Without this
    // branch such a line falls through to the paragraph collector and is joined
    // to the sentence beneath it, so the heading and its first line of text
    // render as one run-on line.
    const boldHeading = /^\*\*([^*]+)\*\*$/.exec(trimmed);
    const bullet = /^[-*•]\s+(.*)$/.exec(trimmed);
    // 1- to 2-digit numbering only, so a real year like "2019." is not read as
    // a list item.
    const numbered = /^(\d{1,2})[.)]\s+(.*)$/.exec(trimmed);

    // A horizontal rule. There is no <hr> in this design, and the marker has no
    // space after it so the bullet branch below would not catch it - it would
    // reach the user as the literal characters "---". Drop it.
    if (/^([-*_])\1{2,}$/.test(trimmed)) {
      flushParagraph();
      flushList();
      continue;
    }

    if (heading || boldHeading) {
      flushParagraph();
      flushList();
      const key = `h-${counter++}`;
      blocks.push(
        <p key={key} className="font-semibold text-neutral-950 pt-1">
          {renderInline(heading ? heading[2] : boldHeading![1], key)}
        </p>,
      );
      continue;
    }

    if (bullet) {
      flushParagraph();
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(bullet[1]);
      continue;
    }

    if (numbered) {
      flushParagraph();
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(numbered[2]);
      continue;
    }

    // Plain prose line: a list cannot continue through it.
    flushList();
    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();

  return (
    <div className="space-y-3 text-[#14181F] text-sm sm:text-base leading-relaxed">
      {blocks}
    </div>
  );
};

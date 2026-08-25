import { describe, expect, it } from 'vitest';
import React from 'react';
import { TextAnswer } from './TextAnswer';

/**
 * Cover for the plain-language answer format.
 *
 * PLAIN_LANGUAGE_RULES (backend/src/prompts/plainLanguage.rules.ts) tells the
 * model to structure every answer under four bold headings, put its numbered
 * steps under "What you can do now", and list section numbers as bullets under
 * "The law behind this". None of that reaches the user unless this renderer
 * recognises it, and the failure is silent: an unrecognised marker does not
 * throw, it just shows up as literal asterisks in the chat bubble.
 *
 * The suite runs in the `node` environment (see vite.config.ts) with no jsdom
 * and no testing-library, so these tests call the component as the plain
 * function it is and walk the React elements it returns. That is enough: the
 * whole contract here is which block type each line becomes.
 */

type El = React.ReactElement<{ className?: string; children?: unknown }>;

function isElement(node: unknown): node is El {
  return typeof node === 'object' && node !== null && 'type' in node;
}

/** Top-level blocks of the rendered answer, in order. */
function blocksOf(text: string): El[] {
  const root = TextAnswer({ text }) as El;
  const children = root.props.children;
  return (Array.isArray(children) ? children : [children]).filter(isElement);
}

/** Concatenated visible text of an element, markers already stripped. */
function textOf(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return '';
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(textOf).join('');
  }
  if (isElement(node)) {
    return textOf(node.props.children);
  }
  return '';
}

const HEADING_CLASS = 'font-semibold text-neutral-950 pt-1';

/** A heading is a <p> carrying the heading class, not merely bold text. */
function isHeading(block: El): boolean {
  return block.type === 'p' && block.props.className === HEADING_CLASS;
}

describe('TextAnswer / plain-language answer format', () => {
  it('renders the four bold headings as separate heading blocks', () => {
    // Exactly the shape PLAIN_LANGUAGE_RULES asks for.
    const answer = [
      '**Short answer**',
      '',
      'Yes. You can ask the seller to repair or replace the laptop.',
      '',
      '**Why**',
      '',
      'A dead motherboard is a fault in the product.',
      '',
      '**What you can do now**',
      '',
      '1. Keep your bill and the warranty card.',
      '2. Write to the company and say what you want.',
      '',
      '**The law behind this**',
      '',
      '- Section 2(10) - what counts as a defect',
      '- Section 2(9)(v) - your right to get the problem put right',
    ].join('\n');

    const blocks = blocksOf(answer);
    const headings = blocks.filter(isHeading).map((b) => textOf(b));

    expect(headings).toEqual([
      'Short answer',
      'Why',
      'What you can do now',
      'The law behind this',
    ]);

    // The asterisks must not survive into the visible text anywhere.
    expect(textOf(blocks)).not.toContain('*');
  });

  it('keeps a heading off the line of the sentence beneath it', () => {
    // The bug this branch exists for: with no blank line after the heading the
    // old renderer joined both lines into one paragraph, so the answer opened
    // with "Short answer Yes. You can ask for a refund." on a single line.
    const blocks = blocksOf('**Short answer**\nYes. You can ask for a refund.');

    expect(blocks).toHaveLength(2);
    expect(isHeading(blocks[0])).toBe(true);
    expect(textOf(blocks[0])).toBe('Short answer');
    expect(blocks[1].type).toBe('p');
    expect(textOf(blocks[1])).toBe('Yes. You can ask for a refund.');
  });

  it('renders numbered steps as an ordered list and citations as bullets', () => {
    const [steps] = blocksOf('1. Keep your bill.\n2. Write to the seller.');
    expect(steps.type).toBe('ol');
    expect(textOf(steps)).toBe('Keep your bill.Write to the seller.');

    const [cites] = blocksOf('- Section 2(10) - what counts as a defect');
    expect(cites.type).toBe('ul');
    expect(textOf(cites)).toBe('Section 2(10) - what counts as a defect');
  });

  it('does not read a section number or a year as a list marker', () => {
    // "2019." at the start of a line must stay prose, or the citation block
    // silently turns into a numbered list.
    const blocks = blocksOf('The Consumer Protection Act, 2019 applies here.');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('p');
  });

  it('drops a horizontal rule instead of showing it as three dashes', () => {
    const blocks = blocksOf('Line one.\n\n---\n\nLine two.');

    expect(textOf(blocks)).not.toContain('---');
    expect(blocks.map((b) => textOf(b))).toEqual(['Line one.', 'Line two.']);
  });

  it('still supports the older hash headings and bullet characters', () => {
    const blocks = blocksOf('## Summary\n\n• first point\n* second point');

    expect(isHeading(blocks[0])).toBe(true);
    expect(textOf(blocks[0])).toBe('Summary');
    expect(blocks[1].type).toBe('ul');
    expect(textOf(blocks[1])).toBe('first pointsecond point');
  });

  it('leaves bold emphasis inside a sentence as inline bold, not a heading', () => {
    const blocks = blocksOf('You must keep the **original bill** safe.');

    expect(blocks).toHaveLength(1);
    expect(isHeading(blocks[0])).toBe(false);
    expect(textOf(blocks[0])).toBe('You must keep the original bill safe.');
  });
});

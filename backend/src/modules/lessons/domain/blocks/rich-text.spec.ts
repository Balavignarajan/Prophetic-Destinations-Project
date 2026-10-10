import {
  ALLOWED_LINK_SCHEMES,
  RICH_TEXT_LIMITS,
  checkLinkHref,
  isMarkupLikeKey,
  validateRichTextComplete,
  validateRichTextShape,
} from './rich-text.js';

const text = (value: string, marks?: unknown[]) => ({
  type: 'text',
  text: value,
  ...(marks ? { marks } : {}),
});
const paragraph = (...content: unknown[]) => ({ type: 'paragraph', content });
const doc = (...content: unknown[]) => ({ body: { type: 'doc', content } });

/** Messages are not part of the contract; paths and counts are. */
const problemsOf = (content: unknown) => validateRichTextShape(content);
const paths = (content: unknown) => problemsOf(content).map((p) => p.path);

describe('valid rich text', () => {
  it('accepts an empty document (a draft)', () => {
    expect(problemsOf(doc())).toEqual([]);
  });

  it('accepts paragraphs, marks and links', () => {
    const content = doc(
      paragraph(
        text('Plain '),
        text('bold', [{ type: 'bold' }]),
        text(' and '),
        text('both', [{ type: 'bold' }, { type: 'italic' }]),
        text('link', [
          { type: 'link', attrs: { href: 'https://example.com/a?b=c#d' } },
        ]),
      ),
    );
    expect(problemsOf(content)).toEqual([]);
  });

  it('accepts bullet and ordered lists with nesting', () => {
    const item = (...children: unknown[]) => ({
      type: 'listItem',
      content: children,
    });
    const content = doc(
      {
        type: 'bulletList',
        content: [
          item(paragraph(text('one'))),
          item(paragraph(text('two')), {
            type: 'orderedList',
            content: [item(paragraph(text('two.one')))],
          }),
        ],
      },
      { type: 'orderedList', content: [item(paragraph(text('first')))] },
    );
    expect(problemsOf(content)).toEqual([]);
  });

  it('accepts empty paragraphs', () => {
    expect(problemsOf(doc({ type: 'paragraph' }, paragraph()))).toEqual([]);
  });

  it('keeps angle brackets in text as plain text (it is never interpreted as markup)', () => {
    expect(
      problemsOf(doc(paragraph(text('1 < 2 and <b>not bold</b>')))),
    ).toEqual([]);
  });
});

describe('structure', () => {
  it.each([null, 'text', 5, [], [doc()]])(
    'rejects content that is not an object (%j)',
    (value) => {
      expect(problemsOf(value)).toHaveLength(1);
    },
  );

  it('rejects a missing or malformed body', () => {
    expect(paths({})).toEqual(['body']);
    expect(paths({ body: 'html' })).toEqual(['body']);
    expect(paths({ body: [] })).toEqual(['body']);
    expect(paths({ body: { type: 'page', content: [] } })).toContain(
      'body.type',
    );
    expect(paths({ body: { type: 'doc' } })).toContain('body.content');
    expect(paths({ body: { type: 'doc', content: 'x' } })).toContain(
      'body.content',
    );
  });

  it('rejects extra keys at the root and on the document', () => {
    expect(paths({ body: { type: 'doc', content: [] }, other: 1 })).toEqual([
      '.other',
    ]);
    expect(paths({ body: { type: 'doc', content: [], version: 2 } })).toEqual([
      'body.version',
    ]);
  });

  it('rejects nodes in the wrong place', () => {
    // text directly in the doc, list item outside a list, paragraph directly in a list
    expect(problemsOf(doc(text('loose')))).not.toEqual([]);
    expect(
      problemsOf(doc({ type: 'listItem', content: [paragraph()] })),
    ).not.toEqual([]);
    expect(
      problemsOf(doc({ type: 'bulletList', content: [paragraph(text('x'))] })),
    ).not.toEqual([]);
    // paragraph inside paragraph, a disallowed node inside a list item
    expect(problemsOf(doc(paragraph(paragraph())))).not.toEqual([]);
    expect(
      problemsOf(
        doc({
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'blockquote', content: [] }],
            },
          ],
        }),
      ),
    ).not.toEqual([]);
  });

  it('requires lists and list items to have content', () => {
    expect(problemsOf(doc({ type: 'bulletList', content: [] }))).not.toEqual(
      [],
    );
    expect(problemsOf(doc({ type: 'bulletList' }))).not.toEqual([]);
    expect(
      problemsOf(
        doc({
          type: 'bulletList',
          content: [{ type: 'listItem', content: [] }],
        }),
      ),
    ).not.toEqual([]);
  });

  it('rejects inline nodes that are not text, and text nodes with children', () => {
    expect(problemsOf(doc(paragraph({ type: 'image', src: 'x' })))).not.toEqual(
      [],
    );
    expect(problemsOf(doc(paragraph({ type: 'hardBreak' })))).not.toEqual([]);
    expect(
      problemsOf(doc(paragraph({ type: 'text', text: 'x', content: [] }))),
    ).not.toEqual([]);
  });

  it('rejects empty, non-string and NUL text', () => {
    expect(problemsOf(doc(paragraph(text(''))))).not.toEqual([]);
    expect(problemsOf(doc(paragraph({ type: 'text', text: 5 })))).not.toEqual(
      [],
    );
    expect(problemsOf(doc(paragraph({ type: 'text' })))).not.toEqual([]);
    expect(problemsOf(doc(paragraph(text('bad\u0000text'))))).not.toEqual([]);
  });
});

describe('unknown nodes, marks and keys', () => {
  it.each([
    'image',
    'html',
    'script',
    'blockquote',
    'codeBlock',
    'table',
    'iframe',
    'Paragraph',
  ])('rejects node type %s', (type) => {
    expect(problemsOf(doc({ type, content: [] }))).not.toEqual([]);
  });

  it.each(['underline', 'color', 'code', 'highlight', 'Bold'])(
    'rejects mark %s',
    (type) => {
      expect(problemsOf(doc(paragraph(text('x', [{ type }]))))).not.toEqual([]);
    },
  );

  it('rejects unknown keys on nodes, marks and attrs', () => {
    expect(problemsOf(doc({ type: 'paragraph', class: 'x' }))).not.toEqual([]);
    expect(
      problemsOf(doc(paragraph({ type: 'text', text: 'x', id: 1 }))),
    ).not.toEqual([]);
    expect(
      problemsOf(doc(paragraph(text('x', [{ type: 'bold', weight: 700 }])))),
    ).not.toEqual([]);
    expect(
      problemsOf(doc({ type: 'bulletList', content: [], attrs: { level: 1 } })),
    ).not.toEqual([]);
    expect(
      problemsOf(
        doc(
          paragraph(
            text('x', [
              {
                type: 'link',
                attrs: { href: 'https://a.com', target: '_blank' },
              },
            ]),
          ),
        ),
      ),
    ).not.toEqual([]);
  });

  it('rejects attrs on marks and nodes that take none', () => {
    expect(
      problemsOf(doc(paragraph(text('x', [{ type: 'bold', attrs: {} }])))),
    ).not.toEqual([]);
  });

  it.each([
    'html',
    'innerHTML',
    'outerHTML',
    'onclick',
    'onError',
    'style',
    'script',
    'srcdoc',
    'dangerouslySetInnerHTML',
    '__html',
    '<script>',
    'a>b',
  ])('calls %s a markup-like key and rejects it everywhere', (key) => {
    expect(isMarkupLikeKey(key)).toBe(true);
    const hits = [
      { body: { type: 'doc', content: [], [key]: 'x' } },
      { [key]: 'x', ...doc() },
      doc({ type: 'paragraph', [key]: 'x' }),
      doc(paragraph({ type: 'text', text: 'x', [key]: 'x' })),
      doc(paragraph(text('x', [{ type: 'bold', [key]: 'x' }]))),
      doc(
        paragraph(
          text('x', [
            { type: 'link', attrs: { href: 'https://a.com', [key]: 'x' } },
          ]),
        ),
      ),
    ];
    for (const content of hits) {
      const found = problemsOf(content);
      expect(found.length).toBeGreaterThan(0);
      expect(found.some((p) => p.message.includes('Markup-like'))).toBe(true);
    }
  });

  it('does not treat the allowed keys as markup-like', () => {
    for (const key of [
      'type',
      'content',
      'text',
      'marks',
      'attrs',
      'level',
      'href',
      'body',
    ]) {
      expect(isMarkupLikeKey(key)).toBe(false);
    }
  });

  it('rejects prototype-pollution style keys', () => {
    const polluted = JSON.parse(
      '{"body":{"type":"doc","content":[],"__proto__":{"x":1}}}',
    );
    expect(problemsOf(polluted)).not.toEqual([]);
    const constructorKey = JSON.parse(
      '{"body":{"type":"doc","content":[],"constructor":{}}}',
    );
    expect(problemsOf(constructorKey)).not.toEqual([]);
  });
});

describe('headings', () => {
  // Headings are not part of the RICH_TEXT contract: major lesson transitions use the
  // dedicated SECTION_INTRO block. They must stay rejected unless a later explicit
  // content-contract decision adds them back.
  it.each([1, 2, 3])('rejects a level %i heading node', (level) => {
    const found = problemsOf(
      doc({ type: 'heading', attrs: { level }, content: [text('x')] }),
    );
    expect(found.map((p) => p.path)).toContain('body.content[0].type');
  });

  it('rejects a heading inside a list item as well', () => {
    expect(
      problemsOf(
        doc({
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'heading', attrs: { level: 1 } }],
            },
          ],
        }),
      ),
    ).not.toEqual([]);
  });

  it('does not allow the heading level attribute anywhere else', () => {
    expect(
      problemsOf(doc({ type: 'paragraph', attrs: { level: 2 } })),
    ).not.toEqual([]);
  });
});

describe('marks', () => {
  it('allows at most three, each once', () => {
    const three = [
      { type: 'bold' },
      { type: 'italic' },
      { type: 'link', attrs: { href: 'https://a.com' } },
    ];
    expect(problemsOf(doc(paragraph(text('x', three))))).toEqual([]);
    expect(
      problemsOf(doc(paragraph(text('x', [...three, { type: 'bold' }])))),
    ).not.toEqual([]);
    expect(
      problemsOf(
        doc(paragraph(text('x', [{ type: 'bold' }, { type: 'bold' }]))),
      ),
    ).not.toEqual([]);
  });

  it('must be an array of objects', () => {
    expect(problemsOf(doc(paragraph(text('x', 'bold' as never))))).not.toEqual(
      [],
    );
    expect(
      problemsOf(doc(paragraph({ type: 'text', text: 'x', marks: ['bold'] }))),
    ).not.toEqual([]);
  });

  it('needs attrs.href on links', () => {
    expect(
      problemsOf(doc(paragraph(text('x', [{ type: 'link' }])))),
    ).not.toEqual([]);
    expect(
      problemsOf(doc(paragraph(text('x', [{ type: 'link', attrs: {} }])))),
    ).not.toEqual([]);
  });
});

describe('link targets', () => {
  it.each([
    'https://example.com',
    'http://example.com/path?q=1#frag',
    'mailto:someone@example.com',
    'HTTPS://EXAMPLE.COM',
  ])('accepts %s', (href) => {
    expect(checkLinkHref(href)).toBeNull();
  });

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'java\nscript:alert(1)',
    'java\tscript:alert(1)',
    ' javascript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD4=',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'ftp://example.com/file',
    'tel:+123456',
    'sms:+123456',
    'intent://x#Intent;end',
    'blob:https://example.com/uuid',
  ])('rejects the disallowed scheme in %j', (href) => {
    expect(checkLinkHref(href)).not.toBeNull();
  });

  it.each([
    '',
    '/relative/path',
    '//example.com',
    'example.com',
    'www.example.com',
    '#anchor',
    'https://',
    'https://exa mple.com',
    'https://a.com/\u0000',
  ])('rejects %j (not a clean absolute URL)', (href) => {
    expect(checkLinkHref(href)).not.toBeNull();
  });

  it('rejects non-strings and over-long targets', () => {
    expect(checkLinkHref(undefined)).not.toBeNull();
    expect(checkLinkHref(42)).not.toBeNull();
    expect(
      checkLinkHref(
        `https://a.com/${'x'.repeat(RICH_TEXT_LIMITS.maxHrefLength)}`,
      ),
    ).not.toBeNull();
  });

  it('only allows https, http and mailto', () => {
    expect([...ALLOWED_LINK_SCHEMES].sort()).toEqual([
      'http:',
      'https:',
      'mailto:',
    ]);
  });

  it('is enforced on link marks inside the document, with the path of the bad href', () => {
    const content = doc(
      paragraph(
        text('x'),
        text('bad', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }]),
      ),
    );
    expect(paths(content)).toEqual([
      'body.content[0].content[1].marks[0].attrs.href',
    ]);
  });
});

describe('limits', () => {
  const nestedLists = (depth: number): unknown => {
    let inner: unknown = paragraph(text('deep'));
    for (let i = 0; i < depth; i += 1) {
      inner = {
        type: 'bulletList',
        content: [{ type: 'listItem', content: [inner] }],
      };
    }
    return inner;
  };

  it('accepts nesting up to the depth limit and rejects beyond it', () => {
    // doc(1) > list(2) > item(3) > list(4) > item(5) > list(6) > item(7) > paragraph(8)
    expect(problemsOf(doc(nestedLists(3)))).toEqual([]);
    expect(problemsOf(doc(nestedLists(4)))).not.toEqual([]);
    expect(RICH_TEXT_LIMITS.maxDepth).toBe(8);
  });

  it('survives absurd nesting without recursing without bound', () => {
    expect(problemsOf(doc(nestedLists(5000))).length).toBeGreaterThan(0);
  });

  it('rejects too many nodes', () => {
    const many = Array.from({ length: RICH_TEXT_LIMITS.maxNodes + 1 }, () =>
      paragraph(),
    );
    expect(problemsOf(doc(...many))).not.toEqual([]);
  });

  it('rejects content over the size limit and accepts content under it', () => {
    const big = (chars: number) => doc(paragraph(text('x'.repeat(chars))));
    expect(problemsOf(big(RICH_TEXT_LIMITS.maxBytes - 200))).toEqual([]);
    expect(problemsOf(big(RICH_TEXT_LIMITS.maxBytes))).not.toEqual([]);
  });

  it('counts bytes, not characters', () => {
    expect(
      problemsOf(
        doc(paragraph(text('é'.repeat(RICH_TEXT_LIMITS.maxBytes / 2)))),
      ),
    ).not.toEqual([]);
  });

  it('reports a bounded number of problems', () => {
    const bad = Array.from({ length: 200 }, () => ({ type: 'script' }));
    expect(problemsOf(doc(...bad)).length).toBeLessThanOrEqual(
      RICH_TEXT_LIMITS.maxProblems,
    );
  });
});

describe('completeness (checked at publishing, not on drafts)', () => {
  it('needs some real text', () => {
    expect(validateRichTextComplete(doc())).toHaveLength(1);
    expect(validateRichTextComplete(doc(paragraph()))).toHaveLength(1);
    expect(validateRichTextComplete(doc(paragraph(text('   '))))).toHaveLength(
      1,
    );
    expect(validateRichTextComplete({})).toHaveLength(1);
  });

  it('is satisfied by text anywhere, including nested lists', () => {
    expect(validateRichTextComplete(doc(paragraph(text('Hello'))))).toEqual([]);
    expect(
      validateRichTextComplete(
        doc({
          type: 'bulletList',
          content: [{ type: 'listItem', content: [paragraph(text('deep'))] }],
        }),
      ),
    ).toEqual([]);
  });
});

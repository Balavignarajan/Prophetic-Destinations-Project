// Re-implementation, line for line, of admin-website/app/lessons/[lessonId]/page.tsx richTextDocToText + textToRichTextDoc (lines 188-220).
const textToRichTextDoc = (text) => ({ body: { type: 'doc', content: text.split('\n\n').map((p) => p.trim()).filter(Boolean).map((p) => ({ type: 'paragraph', content: [{ type: 'text', text: p }] })) } });
const richTextDocToText = (sc) => {
  if (!sc || !sc.body) return '';
  const body = sc.body;
  if (!body.content || !Array.isArray(body.content)) return '';
  return body.content.map((node) => (node.content && Array.isArray(node.content) ? node.content.map((c) => c.text || '').join('') : '')).join('\n\n');
};
// A valid RICH_TEXT document per the backend contract: a paragraph with bold + link, then a bullet list.
const authored = { body: { type: 'doc', content: [
  { type: 'paragraph', content: [{ type: 'text', text: 'Read ' }, { type: 'text', text: 'Daniel 2', marks: [{ type: 'bold' }] }, { type: 'text', text: ' and ' }, { type: 'text', text: 'this link', marks: [{ type: 'link', attrs: { href: 'https://example.org' } }] }] },
  { type: 'bulletList', content: [ { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'first point' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'second point' }] }] } ] },
] } };
const shownInEditor = richTextDocToText(authored);
const savedBack = textToRichTextDoc(shownInEditor);
console.log('Text the admin editor shows for that block:\n' + JSON.stringify(shownInEditor));
console.log('\nDocument saved if the editor presses Save without changes:\n' + JSON.stringify(savedBack));
console.log('\nbullet list preserved?', JSON.stringify(savedBack).includes('bulletList'), '| bold preserved?', JSON.stringify(savedBack).includes('bold'), '| link preserved?', JSON.stringify(savedBack).includes('href'));

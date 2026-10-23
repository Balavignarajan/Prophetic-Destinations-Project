/**
 * Finding and replacing the inline Scripture references of a RICH_TEXT document (pure; no database). The references are structured nodes
 * (`{ type: 'scriptureRef', attrs }`, see rich-text.ts), so they are found by their type, never by looking at the text.
 *
 * A reference is addressed by its path in the document (`body.content[1].content[0]`), the same path form the validator reports, so a problem can
 * name the exact place and a replacement lands on exactly the node that was read.
 */
type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Deeper than any document the validator accepts (RICH_TEXT_LIMITS.maxDepth); the walk never descends further, so it cannot recurse without end. */
const MAX_WALK_DEPTH = 12;

export interface InlineScriptureRef {
  path: string;
  /** The node's attrs: the stored form { reference, dataset? }, or the frozen passage once published. */
  attrs: Json;
}

/** Every inline Scripture reference of the document, in reading order. A node without usable attrs is returned with empty attrs (the caller reports it). */
export function listScriptureRefs(content: unknown): InlineScriptureRef[] {
  const found: InlineScriptureRef[] = [];
  if (!isObject(content) || !isObject(content.body)) return found;
  const visit = (node: unknown, path: string, depth: number) => {
    if (!isObject(node) || depth > MAX_WALK_DEPTH) return;
    if (node.type === 'scriptureRef') {
      found.push({ path, attrs: isObject(node.attrs) ? node.attrs : {} });
      return;
    }
    if (Array.isArray(node.content)) node.content.forEach((child, index) => visit(child, `${path}.content[${index}]`, depth + 1));
  };
  visit(content.body, 'body', 0);
  return found;
}

/**
 * A copy of the document in which the attrs of the references named in `replacements` (path -> new attrs) are replaced. Everything else is kept as it
 * is, and the input is never modified. A path that matches no reference changes nothing.
 */
export function replaceScriptureRefs(content: Json, replacements: ReadonlyMap<string, Json>): Json {
  const rewrite = (node: unknown, path: string, depth: number): unknown => {
    if (!isObject(node) || depth > MAX_WALK_DEPTH) return node;
    if (node.type === 'scriptureRef') {
      const next = replacements.get(path);
      return next ? { ...node, attrs: next } : node;
    }
    if (!Array.isArray(node.content)) return node;
    return { ...node, content: node.content.map((child, index) => rewrite(child, `${path}.content[${index}]`, depth + 1)) };
  };
  return isObject(content.body) ? { ...content, body: rewrite(content.body, 'body', 0) } : content;
}

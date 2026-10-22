import { Injectable } from '@nestjs/common';
import { BusinessRuleError } from '../../../shared-kernel/index.js';
import { ScriptureFacade } from '../../scripture/index.js';
import type { ContentProblem } from '../domain/blocks/rich-text.js';
import { datasetStampOf, passageReferenceOf, sameReference } from '../domain/blocks/scripture-passage.js';
import { MAX_REFS_PER_ITEM, itemReferenceOf, sameItemReference } from '../domain/blocks/scripture-refs.js';
import { stampOf } from '../domain/blocks/scripture-passage.js';
import type { ResolvedBlock } from '../domain/level-resolution.js';

export interface ScriptureEmbedProblem {
  blockId: string;
  problems: ContentProblem[];
}

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Blocks that carry structured Scripture references, and where. A block may have several fields:
 *  - 'items': each item of a list has its own `scripture` list (the label says how an item is called in messages);
 *  - 'direct': the block itself has a list of entries under `field` (summary key Scripture, word and symbol references);
 *  - 'direct' + `single`: the field holds ONE entry (an object, not a list), such as a word study's verse or a symbol's primary passage.
 */
type FieldSpec = { kind: 'items'; list: string; label: string } | { kind: 'direct'; field: string; label: string; single?: boolean };
const SCRIPTURE_LISTS: Record<string, FieldSpec[]> = {
  TIMELINE: [{ kind: 'items', list: 'events', label: 'Event' }],
  INTERACTIVE_IMAGE: [{ kind: 'items', list: 'hotspots', label: 'Hotspot' }],
  SCRIPTURE_CONNECTION: [{ kind: 'items', list: 'connections', label: 'Connection' }],
  MAP: [{ kind: 'items', list: 'hotspots', label: 'Marker' }],
  REFLECTION_STUDY_ACTIVITY: [{ kind: 'direct', field: 'scripture', label: 'Reference' }],
  GUIDED_DISCOVERY_QUESTION: [{ kind: 'direct', field: 'scripture', label: 'Passage' }],
  NARRATIVE_SCENE: [{ kind: 'direct', field: 'scripture', label: 'Passage' }],
  PROPHECY_EQUIVALENCE: [{ kind: 'items', list: 'items', label: 'Item' }],
  PROPHECY_COMPARISON: [{ kind: 'items', list: 'entities', label: 'Entity' }],
  EXPLORE_DEEPER: [{ kind: 'direct', field: 'scripture', label: 'Cross-reference' }],
  SUMMARY: [{ kind: 'direct', field: 'keyScripture', label: 'Key Scripture' }],
  WORD_STUDY: [
    { kind: 'direct', field: 'verse', label: 'Verse', single: true },
    { kind: 'direct', field: 'references', label: 'Reference' },
  ],
  SYMBOL_STUDY: [
    { kind: 'direct', field: 'primaryPassage', label: 'Primary passage', single: true },
    { kind: 'direct', field: 'definitionPassage', label: 'Definition passage', single: true },
    { kind: 'direct', field: 'references', label: 'Reference' },
  ],
};

/**
 * Everything that turns a stored Scripture reference into verified, frozen text, for the SCRIPTURE_PASSAGE block and for the
 * references attached to timeline events and image hotspots.
 *
 * FROZEN FORM (what a lesson snapshot stores): { reference, display, source: { id, translation, edition, version, fingerprint },
 * verses: [{ verse, text }] }, plus `commentary` on a passage block. Verification and text come from one call on one loaded data
 * set, so they always agree, and all references of one publication are resolved against the same loaded set.
 *
 * CHANGE DETECTION uses the text fingerprint (SHA-256 of the installed text), not the editable id/version labels. A stored stamp without a
 * fingerprint (written before fingerprints existed) is never treated as verified: the author must reselect/refresh it.
 */
@Injectable()
export class ScriptureEmbedService {
  constructor(private readonly scripture: ScriptureFacade) {}

  // ---------------------------------------------------------------------------------------------------- publication / preview

  async embed(blocks: readonly ResolvedBlock[]): Promise<{ blocks: ResolvedBlock[]; problems: ScriptureEmbedProblem[] }> {
    const problems: ScriptureEmbedProblem[] = [];
    const out: ResolvedBlock[] = [];
    for (const block of blocks) {
      if (block.content === null || block.source === null) {
        out.push(block);
      } else if (block.type === 'SCRIPTURE_PASSAGE') {
        out.push(await this.embedPassage(block, problems));
      } else if (block.type === 'QUIZ') {
        out.push(await this.embedQuiz(block, problems));
      } else if (block.type === 'EXPLORE_DEEPER') {
        out.push(await this.embedExploreDeeper(block, problems));
      } else if (SCRIPTURE_LISTS[block.type]) {
        out.push(await this.embedNested(block, problems));
      } else {
        out.push(block);
      }
    }
    return { blocks: out, problems };
  }

  /** Verifies one stored entry against the installed text; returns the frozen passage or the reason it cannot be published. */
  private async freeze(entry: unknown, stamp: ReturnType<typeof stampOf>): Promise<{ frozen: Json } | { problem: string }> {
    const reference = itemReferenceOf(entry);
    if (!reference) return { problem: 'its Scripture reference is incomplete or malformed' };
    const result = await this.scripture.verify(reference);
    if (!result.verified) {
      return {
        problem:
          result.reason === 'DATA_UNAVAILABLE'
            ? 'the Scripture text is not installed on the server, so this passage cannot be verified or published yet'
            : `this passage cannot be published (${result.message})`,
      };
    }
    if (!stamp || stamp.fingerprint === null) {
      return { problem: 'this passage was added before text fingerprints existed, so it is not treated as verified; remove and add it again (or use Refresh) and save' };
    }
    if (stamp.fingerprint !== result.source.fingerprint) {
      return {
        problem: `the Scripture text on the server (${result.source.translation}, version ${result.source.version}) is not the text this passage was added with; use Refresh on it and save, then have the lesson approved again`,
      };
    }
    return { frozen: { reference: result.reference, display: result.display, source: result.source, verses: result.verses } };
  }

  private async embedPassage(block: ResolvedBlock, problems: ScriptureEmbedProblem[]): Promise<ResolvedBlock> {
    const content = block.content as Json;
    const reference = passageReferenceOf(content);
    if (!reference) return block; // a missing reference is reported by the block type's own completeness check
    const outcome = await this.freeze({ reference }, datasetStampOf(content));
    if ('problem' in outcome) {
      problems.push({ blockId: block.blockId, problems: [{ path: 'reference', message: `Scripture passage: ${outcome.problem}.` }] });
      return block;
    }
    const commentary = content.commentary;
    return { ...block, content: { ...outcome.frozen, ...(typeof commentary === 'string' && commentary.trim() ? { commentary: commentary.trim() } : {}) } };
  }

  /** Freezes a list of stored entries; every entry that cannot be frozen is reported with its path and label. */
  private async freezeEntries(entries: unknown[], path: string, label: (k: number) => string, found: ContentProblem[]): Promise<Json[]> {
    const frozen: Json[] = [];
    for (let k = 0; k < entries.length; k += 1) {
      const entry = entries[k];
      const outcome = await this.freeze(entry, stampOf(isObject(entry) ? entry.dataset : undefined));
      if ('problem' in outcome) found.push({ path: `${path}[${k}]`, message: `${label(k)}: ${outcome.problem}.` });
      else frozen.push(outcome.frozen);
    }
    return frozen;
  }

  /** Freezes the entries of ONE field of a block's content; returns the content with that field replaced (unchanged when it holds none). */
  private async freezeField(content: Json, spec: FieldSpec, found: ContentProblem[]): Promise<Json> {
    if (spec.kind === 'direct') {
      const value = content[spec.field];
      if (spec.single) {
        if (value === undefined) return content;
        const [frozen] = await this.freezeEntries([value], spec.field, () => spec.label, found);
        return frozen ? { ...content, [spec.field]: frozen } : content;
      }
      if (!Array.isArray(value) || value.length === 0) return content;
      const frozen = await this.freezeEntries(value, spec.field, (k) => `${spec.label}, passage ${k + 1}`, found);
      return { ...content, [spec.field]: frozen };
    }
    const items = content[spec.list];
    if (!Array.isArray(items)) return content;
    const nextItems: unknown[] = [];
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (!isObject(item) || !Array.isArray(item.scripture) || item.scripture.length === 0) {
        nextItems.push(item);
        continue;
      }
      const frozen = await this.freezeEntries(item.scripture, `${spec.list}[${index}].scripture`, (k) => `${spec.label} ${index + 1}, passage ${k + 1}`, found);
      nextItems.push({ ...item, scripture: frozen });
    }
    return { ...content, [spec.list]: nextItems };
  }

  /**
   * Replaces the stored Scripture entries (per item, or the block's own fields) by frozen passages. If ANY entry cannot be frozen, the block
   * keeps its stored form and is reported, so one unavailable passage never alters the rest of the stored content.
   */
  private async embedNested(block: ResolvedBlock, problems: ScriptureEmbedProblem[]): Promise<ResolvedBlock> {
    const found: ContentProblem[] = [];
    let content = block.content as Json;
    for (const spec of SCRIPTURE_LISTS[block.type]!) content = await this.freezeField(content, spec, found);
    if (found.length > 0) {
      problems.push({ blockId: block.blockId, problems: found });
      return block;
    }
    return { ...block, content };
  }

  /**
   * A QUIZ block that has already been embedded (QuizEmbedService runs first): each question's optional Scripture is still the stored reference list.
   * It becomes the usual frozen passage ({ reference, display, source, verses }) when the installed Scripture text verifies it. With NO Scripture text
   * installed it is frozen as the reference alone ({ reference, display }): the quiz does not depend on the Bible text being available, and the learner
   * app shows such a passage as its reference. A reference the installed text says does not exist (unknown book, chapter or verse) is NOT published.
   * A question's Scripture carries no stamp: the text is read from the installed data set at publication, which is what the snapshot then freezes.
   */
  private async embedQuiz(block: ResolvedBlock, problems: ScriptureEmbedProblem[]): Promise<ResolvedBlock> {
    const content = block.content as Json;
    const quiz = content.quiz;
    if (!isObject(quiz) || !Array.isArray(quiz.questions)) return block;
    const found: ContentProblem[] = [];
    const questions: unknown[] = [];
    for (let q = 0; q < quiz.questions.length; q += 1) {
      const question = quiz.questions[q];
      if (!isObject(question) || !Array.isArray(question.scripture) || question.scripture.length === 0) {
        questions.push(question);
        continue;
      }
      const frozen: Json[] = [];
      for (let k = 0; k < question.scripture.length; k += 1) {
        const reference = itemReferenceOf(question.scripture[k]);
        const at = `quiz.questions[${q}].scripture[${k}]`;
        if (!reference) {
          found.push({ path: at, message: `Question ${q + 1}, passage ${k + 1}: its Scripture reference is incomplete or malformed.` });
          continue;
        }
        const result = await this.scripture.verify(reference);
        if (result.verified) frozen.push({ reference: result.reference, display: result.display, source: result.source, verses: result.verses });
        else if (result.reason === 'DATA_UNAVAILABLE') frozen.push({ reference, display: this.scripture.format(reference as Parameters<ScriptureFacade['format']>[0]) });
        else found.push({ path: at, message: `Question ${q + 1}, passage ${k + 1}: this passage cannot be published (${result.message}).` });
      }
      questions.push({ ...question, scripture: frozen });
    }
    if (found.length > 0) {
      problems.push({ blockId: block.blockId, problems: found });
      return block;
    }
    return { ...block, content: { ...content, quiz: { ...quiz, questions } } };
  }

  /**
   * An Explore Deeper block: its own cross-references as before, then each nested block gets exactly the treatment a top-level block of that type gets
   * (a Scripture passage is verified and frozen, lists of references are frozen). A problem in a nested block is reported on the Explore Deeper block with
   * the nested block's number, and the block then keeps its stored form, so one unavailable passage never alters the rest of the stored content.
   */
  private async embedExploreDeeper(block: ResolvedBlock, problems: ScriptureEmbedProblem[]): Promise<ResolvedBlock> {
    const own = await this.embedNested(block, problems);
    const content = own.content as Json;
    const children = Array.isArray(content.blocks) ? content.blocks : [];
    if (children.length === 0) return own;
    const found: ContentProblem[] = [];
    const frozen: unknown[] = [];
    for (let i = 0; i < children.length; i += 1) {
      const child = children[i];
      if (!isObject(child) || typeof child.type !== 'string' || !isObject(child.content)) {
        frozen.push(child);
        continue;
      }
      const probe: ResolvedBlock = { blockId: block.blockId, type: child.type as ResolvedBlock['type'], ordinal: i + 1, source: block.source, content: child.content };
      const sink: ScriptureEmbedProblem[] = [];
      let result: ResolvedBlock = probe;
      if (child.type === 'SCRIPTURE_PASSAGE') result = await this.embedPassage(probe, sink);
      else if (SCRIPTURE_LISTS[child.type]) result = await this.embedNested(probe, sink);
      for (const problem of sink) {
        for (const item of problem.problems) {
          found.push({ path: `blocks[${i}].content${item.path ? `.${item.path}` : ''}`, message: `Nested block ${i + 1}: ${item.message}` });
        }
      }
      frozen.push({ ...child, content: result.content });
    }
    if (found.length > 0) {
      problems.push({ blockId: block.blockId, problems: found });
      return own;
    }
    return { ...own, content: { ...content, blocks: frozen } };
  }

  // ---------------------------------------------------------------------------------------------------- saving a block

  /**
   * A SCRIPTURE_PASSAGE nested in an Explore Deeper block, saved: the same treatment BlockService gives a top-level passage block. The reference is verified
   * against the installed text and stamped with the data set that confirmed it (the client never supplies a stamp, no Bible text is stored); with no text
   * installed a NEW or CHANGED reference is refused but an unchanged one is kept exactly as saved.
   */
  private async stampPassage(content: Json, current: Json | null): Promise<Json> {
    const reference = passageReferenceOf(content);
    const commentary = typeof content.commentary === 'string' && content.commentary.trim() ? { commentary: content.commentary.trim() } : {};
    if (!reference) return { ...commentary };
    const result = await this.scripture.verify(reference);
    if (result.verified) {
      return { reference, ...commentary, dataset: { id: result.source.id, version: result.source.version, fingerprint: result.source.fingerprint } };
    }
    if (result.reason === 'DATA_UNAVAILABLE') {
      if (sameReference(passageReferenceOf(current), reference)) {
        const stamp = current?.dataset;
        return { reference, ...commentary, ...(stamp ? { dataset: stamp } : {}) };
      }
      throw new BusinessRuleError('Scripture passages cannot be chosen yet: the Scripture text is not installed on the server, so the passage cannot be verified.', {
        code: 'SCRIPTURE_DATA_UNAVAILABLE',
      });
    }
    throw new BusinessRuleError(result.message, { code: result.reason });
  }

  /** Stamps the Scripture of the nested blocks of an Explore Deeper block being saved; nested blocks are matched with the stored ones by their id. */
  private async stampExploreChildren(content: Json, current: Json | null): Promise<Json> {
    const children = content.blocks;
    if (!Array.isArray(children) || children.length === 0) return content;
    const before = new Map<string, Json>();
    const storedBlocks = current?.blocks;
    if (Array.isArray(storedBlocks)) {
      for (const stored of storedBlocks) if (isObject(stored) && typeof stored.id === 'string') before.set(stored.id, stored);
    }
    const next: unknown[] = [];
    for (const child of children) {
      if (!isObject(child) || typeof child.type !== 'string' || !isObject(child.content)) {
        next.push(child);
        continue;
      }
      const old = typeof child.id === 'string' ? before.get(child.id) : undefined;
      const oldContent = old && old.type === child.type && isObject(old.content) ? old.content : null;
      const stamped = child.type === 'SCRIPTURE_PASSAGE' ? await this.stampPassage(child.content, oldContent) : await this.stampNested(child.type, child.content, oldContent);
      next.push({ ...child, content: stamped ?? child.content });
    }
    return { ...content, blocks: next };
  }

  /**
   * Stamps one list of entries being saved: drops anything the client sent as a stamp (stamps are server-controlled) and the input-only
   * `refresh` flag; keeps the stored stamp of an UNCHANGED reference (so unrelated edits never re-stamp and never silently approve different
   * text after the data set changed); verifies a new, changed or refreshed reference against the installed text and stamps it with the
   * text fingerprint; with no data set installed, refuses a new, changed or refreshed reference but keeps unchanged ones.
   */
  private async stampEntries(entries: unknown[], oldEntries: unknown[], label: string): Promise<Json[]> {
    if (entries.length > MAX_REFS_PER_ITEM) throw new BusinessRuleError(`${label}: at most ${MAX_REFS_PER_ITEM} Scripture passages are allowed`, { code: 'TOO_MANY_PASSAGES' });
    const stamped: Json[] = [];
    for (let k = 0; k < entries.length; k += 1) {
      const entry = entries[k];
      const reference = itemReferenceOf(entry);
      if (!reference) throw new BusinessRuleError(`${label}, passage ${k + 1}: the Scripture reference is incomplete`, { code: 'INVALID_REFERENCE' });
      const refresh = isObject(entry) && entry.refresh === true;
      const previous = oldEntries.find((o) => sameItemReference(itemReferenceOf(o), reference));
      const previousStamp = stampOf(isObject(previous) ? previous.dataset : undefined);
      if (previous && previousStamp && !refresh) {
        stamped.push({ reference, dataset: previousStamp });
        continue;
      }
      const result = await this.scripture.verify(reference);
      if (result.verified) {
        const { id, version, fingerprint } = result.source;
        stamped.push({ reference, dataset: { id, version, fingerprint } });
      } else if (result.reason === 'DATA_UNAVAILABLE') {
        if (previous && !refresh) {
          // an unchanged reference that never had a stamp (older data) is kept as it is; it still cannot be published unverified
          stamped.push({ reference, ...(previousStamp ? { dataset: previousStamp } : {}) });
        } else {
          throw new BusinessRuleError(`${label}, passage ${k + 1}: Scripture passages cannot be chosen or refreshed yet because the Scripture text is not installed on the server.`, { code: 'SCRIPTURE_DATA_UNAVAILABLE' });
        }
      } else {
        throw new BusinessRuleError(`${label}, passage ${k + 1}: ${result.message}`, { code: result.reason });
      }
    }
    return stamped;
  }

  /** Stamps the entries of ONE field of the content being saved (see stampNested). */
  private async stampField(content: Json, current: Json | null, spec: FieldSpec): Promise<Json> {
    if (spec.kind === 'direct') {
      const value = content[spec.field];
      if (value === undefined) return content;
      const old = current?.[spec.field];
      if (spec.single) {
        if (!isObject(value)) throw new BusinessRuleError(`${spec.label}: the Scripture reference is incomplete`, { code: 'INVALID_REFERENCE' });
        const [stamped] = await this.stampEntries([value], isObject(old) ? [old] : [], spec.label);
        return { ...content, [spec.field]: stamped };
      }
      return { ...content, [spec.field]: await this.stampEntries(Array.isArray(value) ? value : [], Array.isArray(old) ? old : [], spec.label) };
    }
    const items = content[spec.list];
    if (!Array.isArray(items)) return content;
    const before = new Map<string, Json>();
    const currentItems = current?.[spec.list];
    if (Array.isArray(currentItems)) for (const item of currentItems) if (isObject(item) && typeof item.id === 'string') before.set(item.id, item);

    const nextItems: unknown[] = [];
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (!isObject(item) || item.scripture === undefined) {
        nextItems.push(item);
        continue;
      }
      const old = typeof item.id === 'string' ? before.get(item.id) : undefined;
      const oldEntries = Array.isArray(old?.scripture) ? (old!.scripture as unknown[]) : [];
      const entries = Array.isArray(item.scripture) ? item.scripture : [];
      nextItems.push({ ...item, scripture: await this.stampEntries(entries, oldEntries, `${spec.label} ${index + 1}`) });
    }
    return { ...content, [spec.list]: nextItems };
  }

  /**
   * Called when a block that carries Scripture entries (timeline, interactive image, map, Scripture connection, summary, Explore Deeper, word
   * and symbol studies) is saved. Items keep the stamps of their unchanged references (matched by item id); a block's own fields are matched
   * against the stored ones. Content without any entries is returned untouched.
   */
  async stampNested(type: string, content: Json | null, current: Json | null): Promise<Json | null> {
    const specs = SCRIPTURE_LISTS[type];
    if (!specs || content === null) return content;
    let next = content;
    for (const spec of specs) next = await this.stampField(next, current, spec);
    // An Explore Deeper section may hold nested blocks that carry Scripture of their own.
    if (type === 'EXPLORE_DEEPER') next = await this.stampExploreChildren(next, current);
    return next;
  }
}

/**
 * The CONTINUE_EXPLORING lesson block (backend/src/modules/lessons/domain/blocks/continue-exploring.ts). PROPOSED schema and PROPOSED identifier
 * (open decision D1):
 *   { title?, links: [{ id, lessonId, label?, levels? }] }
 * The block's links are its OWN. They are separate from the lesson's metadata "Related lessons" (CMS-006 / CMS-027): nothing here reads, copies or
 * synchronises the other list. `label` (plain text, at most 120) replaces the target's published title for learners; `levels` (absent = every level) is the
 * link's own visibility, separate from the target's availability and from the block's level visibility.
 */
export const EXPLORING_LIMITS = { title: 200, maxLinks: 10, label: 120 } as const;

export interface ExploringLinkDraft {
  id: string;
  lessonId: string;
  label: string | null;
  levels: string[] | null;
}

export interface ExploringContent {
  title: string;
  links: ExploringLinkDraft[];
}

export const EMPTY_EXPLORING: ExploringContent = { title: '', links: [] };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export function readExploring(content: unknown): ExploringContent & { malformed: number } {
  const c = isObject(content) ? content : {};
  const links: ExploringLinkDraft[] = [];
  let malformed = 0;
  if (c.links !== undefined && !Array.isArray(c.links)) malformed += 1;
  if (Array.isArray(c.links)) {
    c.links.forEach((raw) => {
      if (!isObject(raw) || typeof raw.lessonId !== 'string') {
        malformed += 1;
        return;
      }
      links.push({
        id: typeof raw.id === 'string' ? raw.id : '',
        lessonId: raw.lessonId.toLowerCase(),
        label: typeof raw.label === 'string' && raw.label.trim() ? raw.label : null,
        levels: Array.isArray(raw.levels) && raw.levels.length > 0 ? raw.levels.filter((l): l is string => typeof l === 'string') : null,
      });
    });
  }
  return { title: typeof c.title === 'string' ? c.title : '', links, malformed };
}

/** A new link id that no other link of the block uses. */
export function newLinkId(used: ReadonlySet<string>): string {
  for (;;) {
    const id = `k-${Math.random().toString(36).slice(2, 8)}`;
    if (!used.has(id)) return id;
  }
}

/** The content to save: ids are kept for links that stay (matched by target), new links get new ids; empty label and "every level" are left out. */
export function buildExploring(title: string, links: { lessonId: string; label: string | null; levels: string[] | null }[], previous: readonly ExploringLinkDraft[]): Record<string, unknown> {
  const used = new Set(previous.map((p) => p.id).filter(Boolean));
  const byTarget = new Map(previous.filter((p) => p.id).map((p) => [p.lessonId, p.id]));
  const out: Record<string, unknown> = {
    links: links.map((l) => {
      const id = byTarget.get(l.lessonId) ?? newLinkId(used);
      used.add(id);
      return { id, lessonId: l.lessonId, ...(l.label ? { label: l.label } : {}), ...(l.levels ? { levels: l.levels } : {}) };
    }),
  };
  if (title.trim()) out.title = title.trim();
  return out;
}

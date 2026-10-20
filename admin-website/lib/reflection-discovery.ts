import { type ScriptureEntryDraft, buildScriptureList, readScriptureEntries } from './scripture-info';

/**
 * REFLECTION_STUDY_ACTIVITY and GUIDED_DISCOVERY_QUESTION blocks (backend/src/modules/lessons/domain/blocks/reflection-discovery.ts). PROPOSED schemas,
 * not approved. Both show the AUTHOR's prompt; learners type nothing and nothing is saved or scored.
 *   REFLECTION_STUDY_ACTIVITY: { activityType, instruction, scripture? }
 *   GUIDED_DISCOVERY_QUESTION: { question, scripture: [...], explanation }     ("optional response interaction" is undecided, D13: not implemented)
 */
export const ACTIVITY_TYPES = [
  { value: 'REFLECT', label: 'Reflect' },
  { value: 'COMPARE', label: 'Compare' },
  { value: 'FIND', label: 'Find' },
  { value: 'STUDY', label: 'Study' },
  { value: 'READ', label: 'Read' },
  { value: 'PERSONAL_APPLICATION', label: 'Personal application' },
] as const;
export const activityLabel = (value: string) => ACTIVITY_TYPES.find((t) => t.value === value)?.label ?? '';

export const REFLECTION_LIMITS = { instruction: 1500 } as const;
export const DISCOVERY_LIMITS = { question: 500, explanation: 2000 } as const;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown) => (typeof value === 'string' ? value : '');

export interface ReflectionContent {
  activityType: string;
  instruction: string;
  scripture: ScriptureEntryDraft[];
  scriptureRaw?: unknown;
}
export const EMPTY_REFLECTION: ReflectionContent = { activityType: '', instruction: '', scripture: [] };

export function readReflection(content: unknown): ReflectionContent {
  const c = isObject(content) ? content : {};
  return { activityType: text(c.activityType), instruction: text(c.instruction), scripture: readScriptureEntries(c.scripture), scriptureRaw: c.scripture };
}

export function buildReflection(draft: ReflectionContent): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (draft.activityType) out.activityType = draft.activityType;
  out.instruction = draft.instruction.trim();
  const scripture = buildScriptureList(draft.scripture);
  if (scripture) out.scripture = scripture;
  return out;
}

export function reflectionReadiness(c: ReflectionContent): string[] {
  const out: string[] = [];
  if (!c.activityType) out.push('Choose the activity type.');
  if (!c.instruction.trim()) out.push('Write the instruction.');
  return out;
}

export interface DiscoveryContent {
  question: string;
  scripture: ScriptureEntryDraft[];
  scriptureRaw?: unknown;
  explanation: string;
}
export const EMPTY_DISCOVERY: DiscoveryContent = { question: '', scripture: [], explanation: '' };

export function readDiscovery(content: unknown): DiscoveryContent {
  const c = isObject(content) ? content : {};
  return { question: text(c.question), scripture: readScriptureEntries(c.scripture), scriptureRaw: c.scripture, explanation: text(c.explanation) };
}

export function buildDiscovery(draft: DiscoveryContent): Record<string, unknown> {
  const out: Record<string, unknown> = { question: draft.question.trim(), explanation: draft.explanation.trim() };
  const scripture = buildScriptureList(draft.scripture);
  if (scripture) out.scripture = scripture;
  return out;
}

export function discoveryReadiness(c: DiscoveryContent): string[] {
  const out: string[] = [];
  if (!c.question.trim()) out.push('Write the question.');
  if (c.scripture.length === 0) out.push('Choose at least one Scripture passage.');
  if (!c.explanation.trim()) out.push('Write the explanation.');
  return out;
}

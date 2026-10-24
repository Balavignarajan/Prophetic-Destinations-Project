'use client';

import React, { useEffect, useId, useState } from 'react';
import { api } from '../lib/api';
import { TAG_MAX_COUNT, TAG_MAX_LENGTH, addTags, removeTag } from '../lib/lesson-tags';

interface Props {
  /** The lesson's tags, in order. */
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

const LABEL = 'block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5';
const FIELD = 'flex-1 min-w-0 px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 disabled:opacity-60';

/**
 * The Tags field of the lesson forms (CMS-021): add a tag (Enter, a comma or the Add button; several can be pasted at once), see the tags as removable chips, remove one.
 * Tags are short labels for organising lessons in the CMS; they are optional and not shown to learners. A tag that cannot be added says why and nothing is added. What is
 * typed but not added yet is added when the field loses focus (if it is valid), so saving the form never silently drops it. Existing tags are offered as suggestions
 * (best effort: if they cannot be loaded the field works the same).
 */
export default function LessonTagsField({ value, onChange, disabled = false }: Props) {
  const id = useId();
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [announce, setAnnounce] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .request<{ items: { tag: string }[] }>('/admin/lessons/tags')
      .then((res) => !cancelled && setSuggestions(res.items.map((item) => item.tag)))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const add = () => {
    if (text.trim() === '') {
      setProblem(null);
      return;
    }
    const result = addTags(value, text);
    if (result.problem) {
      setProblem(result.problem);
      return;
    }
    onChange(result.tags);
    setAnnounce(`Added. ${result.tags.length} ${result.tags.length === 1 ? 'tag' : 'tags'}.`);
    setText('');
    setProblem(null);
  };

  const remove = (tag: string) => {
    const next = removeTag(value, tag);
    onChange(next);
    setAnnounce(`Removed the tag ${tag}. ${next.length} ${next.length === 1 ? 'tag' : 'tags'}.`);
  };

  const full = value.length >= TAG_MAX_COUNT;
  return (
    <div>
      <label htmlFor={`${id}-input`} className={LABEL}>
        Tags (optional)
      </label>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 mb-2" aria-label="Tags of this lesson">
          {value.map((tag) => (
            <li key={tag.toLowerCase()} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-xs font-medium text-slate-800">
              <span>{tag}</span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => remove(tag)}
                aria-label={`Remove the tag ${tag}`}
                className="w-5 h-5 rounded-full text-slate-600 hover:text-slate-900 hover:bg-slate-200 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-50"
              >
                <span aria-hidden="true">&times;</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          id={`${id}-input`}
          type="text"
          list={`${id}-suggestions`}
          value={text}
          maxLength={TAG_MAX_LENGTH * 4}
          disabled={disabled || full}
          autoComplete="off"
          placeholder={full ? `The most tags (${TAG_MAX_COUNT}) are in use` : 'e.g. Daniel, Kingdoms'}
          aria-invalid={problem !== null}
          aria-describedby={`${id}-help${problem ? ` ${id}-problem` : ''}`}
          onChange={(e) => {
            setText(e.target.value);
            if (problem) setProblem(null);
          }}
          onKeyDown={(e) => {
            // Enter adds the tag; it must not submit the lesson form that contains this field.
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          onBlur={() => {
            if (text.trim() !== '') add();
          }}
          className={FIELD}
        />
        <button
          type="button"
          disabled={disabled || full || text.trim() === ''}
          onClick={add}
          className="px-3.5 py-2.5 text-sm font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          Add tag
        </button>
      </div>
      <datalist id={`${id}-suggestions`}>
        {suggestions.map((tag) => (
          <option key={tag} value={tag} />
        ))}
      </datalist>
      {problem && (
        <p id={`${id}-problem`} role="alert" className="mt-1 text-xs font-medium text-rose-700">
          {problem}
        </p>
      )}
      <p id={`${id}-help`} className="mt-1 text-xs text-slate-700">
        Short labels for finding lessons in the CMS, such as a theme or a book. Up to {TAG_MAX_COUNT} tags of {TAG_MAX_LENGTH} characters. Press Enter or choose Add tag to add one; separate several with commas. Learners never see tags.
      </p>
      <p role="status" className="sr-only">
        {announce}
      </p>
    </div>
  );
}

# Prophetic Destinations — Lesson Component Catalogue: Reconciliation and Implementation Plan

**Phase 4 — audit and planning only.** No product code, configuration, migration or database was changed to produce this document.
It is a new file; delete it to undo it.

**Written for:** the project owner / product lead (to make the decisions in section 8) and the development team (to sequence the work).

## 0. Sources and method

| Code | Source | What was read |
|---|---|---|
| **WB** | `Prophetic_Destinations_Detailed_Features.xlsx` (the copy `… (1).xlsx` is byte-identical) | All nine sheets: README, Feature Register (94 rows), CMS Components (22), Data Model (20), User Flows (10), Acceptance Tests (15), Scope & Future (15), Milestones (4), AI Prompt Guide |
| **GD** | `Prophetic_Destinations_Developer_Feature_Workflow_Guide.docx` | Whole document, including every table (§1–§15) |
| **AUDIT** | `FINAL_FEATURE_COMPLIANCE_AUDIT.md` | Read in full earlier in this project; its conflict register (C-01…C-26) is reused and cited |
| **CODE** | `backend/`, `admin-website/`, `mobile-app/` at the current working tree | Re-checked for this plan (file references given) |

Rule followed: nothing below defines a component, field, rule or acceptance criterion that is not in WB or GD. Where a source is silent the entry says **"not specified"** and becomes an owner decision. Proposed engineering choices are labelled **assumption** and kept separate from decisions.

---

## 1. All lesson component types in the two sources

### 1.1 The guide's list (GD §5, "Reusable Lesson Components") — 19 rows
Rich Text · Section Intro / Heading · Callout / Key Idea · Scripture Passage · Scripture Connection · Image / Illustration · Interactive Image / Hotspots · Symbol Study · Word Study · Map · Timeline · Prophecy Equivalence · Prophecy Calculation · Prophecy Comparison · Narrative Scene · Explore Deeper · Reflection / Study Activity · Summary · **Quiz**

### 1.2 The workbook's list (WB › CMS Components = WB › Feature Register BLK-001…BLK-022) — 22 rows
Rich Text · Section Intro / Heading · Callout / Key Idea · Scripture Passage · Scripture Connection · Image / Illustration · Interactive Image / Hotspots · Symbol Study · Word Study · Prophecy Equivalence · Prophecy Calculation · Prophecy Comparison · Timeline · Map / Diagram · Narrative Scene · **Media / Animation Asset** · Explore Deeper · Reflection / Study Activity · **Guided Discovery Question** · **Historical Evidence** · Lesson Summary · **Continue Exploring**

### 1.3 The union
23 distinct entries: **18 in both**, **4 only in WB** (Media / Animation Asset, Guided Discovery Question, Historical Evidence, Continue Exploring) and **1 only in GD** (Quiz).
(Name differences that were treated as the same component: GD "Summary" = WB "Lesson Summary"; GD "Map" = WB "Map / Diagram"; GD "Image / Illustration" = WB "Image / Illustration".)

---

## 2. Why 19 versus 22 (no authority is assumed)

**Arithmetic.** 19 = 18 shared + 1 guide-only (Quiz). 22 = 18 shared + 4 workbook-only. The two lists are not nested: neither contains the other.

**What each document says about the difference** (facts only):

| Item | In GD §5? | Elsewhere in GD | In WB › CMS Components? | Elsewhere in WB |
|---|---|---|---|---|
| Quiz | **Yes** (row "Quiz": "End-of-lesson questions and feedback. Level-aware question pool.") | §4 examples end with "Summary and Quiz"; §12 "A Lesson may have a Quiz" | **No** | QUIZ-001…003, CMS-019 (Quiz editor), Data Model Quiz/QuizQuestion/QuizOption, FLOW-06, AT-008 treat the quiz as its own entity and flow, not as a CMS component |
| Media / Animation Asset | No | §11 "CMS stores/integrates finished animation/media assets"; §12 MediaAsset "animation/video" | **Yes** (BLK-016, P0, Confirmed) | CMS-015 media library; Scope & Future "Custom animation production" is outside base cost, integration is included |
| Guided Discovery Question | No | §4 Revelation 5 example lists "Guided sequence: 'Who is worthy?'" (not named as a component) | **Yes** (BLK-019, P2, Design Detail) | — |
| Historical Evidence | No | §1 and §4 mention "historical evidence" as lesson material (not as a §5 component) | **Yes** (BLK-020, P0, Confirmed) | CMS-018 editor (P0, Confirmed); Milestone 2 lists "historical evidence"; Data Model HistoricalEvidence |
| Continue Exploring | No | §11 "manually configured related/next lesson links"; §12 "related lessons"; §5 Summary says "next study" | **Yes** (BLK-022, P1, Design Detail) | CMS-027 related lesson links; Data Model RelatedLesson |

**Statements about which list governs** (quoted, not interpreted):
- GD cover box: "…use the Detailed Features spreadsheet as the implementation source of truth." GD §14: the workbook "is the detailed implementation reference"; the guide is "not a replacement for the feature register". GD §15 final rule: "When the documents are ambiguous, ask the product/project lead…".
- WB README "How to use": Feature Register is the filterable reference; statuses are Confirmed / Design Detail / Scope Guard.
- **CODE:** `backend/src/modules/lessons/domain/blocks/block-types.ts` states the 19 identifiers are "defined by the Developer Feature & Workflow Guide … fixed by the guide: do not add types that are not in it". The database CHECK `chk_lesson_blocks_type` (migration `1791495283678-CreateLessonBlocksTable.ts`) lists the same 19. So earlier engineering chose the guide's list, while the guide itself defers to the workbook for implementation. These two facts are in tension and are reported as such.

**Not decided here.** Section 8, decision **D1**, asks the owner which list governs and whether Quiz is a lesson block, a separate entity, or both. Until then: the 18 shared components are unaffected; the 4 workbook-only components and a QUIZ block are held.

**Second, smaller disagreement inside the shared 18 (found during reconciliation):** GD §5 describes **Summary** as "Key ideas, Scripture, takeaway, next study"; WB BLK-021 / CMS Components lists "Key ideas; key Scripture; prophecy takeaway; spiritual/application takeaway" and has no "next study" field. See **D2**.

---

## 3. Current implementation state (evidence, applies to every non-Rich-Text component unless a row says otherwise)

| Layer | State | Evidence |
|---|---|---|
| Backend identifiers | 19 identifiers valid at the API and in the DB CHECK. The 4 workbook-only components have **no identifier** (a migration widening the CHECK would be needed). | `block-types.ts`; migration `1791495283678…` |
| Backend registry / validation | Only `RICH_TEXT` is registered (`BlockTypeRegistry`). Creating any other type is refused (422 "not available yet"). No payload schema or validator exists for any other type. Each registered type supplies `validateShape` (every save), `validateComplete` (publish readiness), `extractReferences` (media/quiz ids) and `variants`. | `registry.ts`; `registry.spec.ts` |
| Level visibility | Per-block B/I/A visibility works for any registered type. Variants: `RICH_TEXT` is `UNCONFIRMED`, which the backend treats as "no variants". | `block-levels.ts`; `registry.ts:38` |
| Publishing / learner API | The published snapshot carries `blocks[].content` as type-agnostic JSON, so a new registered type would flow through without changes to the snapshot shape. Public routes are only `courses`, `courses/:id`, `lessons/:id`, `lessons/:id/navigation`. **There is no public media route.** | `snapshot-payload.ts`; `delivery/api/*.controller.ts` |
| Media | Admin-only upload/list/download (`admin/media`). Stored fields: storage key, original filename, content type, size, hash, creator, created-at. **No title, alt text, caption, source, rights or tags** (the WB Data Model MediaAsset requires them). Allowed formats: png, jpeg, webp only. | `media-asset.entity.ts`; `media.controller.ts`; `.env.example` |
| Scripture | `ScriptureFacade` parses "Book C:V–V" syntax only. **No KJV dataset**; no chapter/verse existence check; no verse text. Source/licence unresolved. | `scripture/index.ts`; `backend/docs/scripture-source-research.md` |
| Quiz | Standalone quiz module; no lesson link; no per-question levels; scored on the server. | AUDIT C-06, C-07 |
| Related lessons | **No RelatedLesson entity or route.** | code search; AUDIT CMS-027 |
| Admin authoring | The block editor offers **only "Add Rich Text Block"** (structured editor, toolbar, safe renderer, legacy-marker conversion, level visibility). No Scripture picker, hotspot/timeline/word/symbol/comparison/calculation editors. | `admin-website/app/lessons/[lessonId]/page.tsx`; `lib/block-capabilities.ts` |
| Admin preview | Learner preview renders RICH_TEXT through `RichTextView`; no renderer exists for other types (AUDIT C-18 preview technology undecided). | `components/RichTextView.tsx` |
| Mobile rendering | Hard-coded `SUPPORTED_BLOCKS = {RICH_TEXT}`; other blocks are skipped with a visible "cannot be shown in this version yet" note. This is a filter, not the registry-driven renderer WB LESS-001 asks for, and unknown types are **not logged** (LESS-001 says "fail gracefully and are logged"). | `mobile-app/src/screens/lesson-screen.tsx`; `learning/rich-text.tsx` |
| Hard-coded stand-in | The built-in Daniel 2 lesson implements several of these visuals as hard-coded demo scenes. It is **not** CMS-driven and is not counted as support. | `mobile-app/src/features/daniel-2/`; AUDIT C-10 |

**Rich Text** is the only component implemented end to end: backend validator, admin editor, publish pass-through, public API, mobile renderer, and (this project's earlier phases) verified on a disposable database and an Android emulator.

---

## 4. Reconciliation matrix

Legend — **Agree?**: ✔ same in both; ≈ same component, wording/fields differ (difference stated); ✖ only in one. **Priority/Status** are WB Feature Register values (all rows are Milestone M2/M3). **State** columns use the evidence in section 3: *BE* = backend (id / registry / validator), *AD* = admin authoring, *API* = publishing + learner API, *MOB* = mobile rendering.

### 4.1 Source reconciliation

| # | Component | WB row · Priority · Status | GD §5 purpose (boundary) | Agree? | Differences |
|---|---|---|---|---|---|
| 1 | Rich Text | BLK-001 · P0 · Confirmed | Short explanatory text, constrained formatting (no arbitrary HTML/scripts) | ≈ | WB also lists "headings … and references"; GD does not. Backend has no heading nodes (AUDIT C-02) |
| 2 | Section Intro / Heading | BLK-002 · P0 · Confirmed | Major lesson transition (title, subtitle, optional visual) | ✔ | — |
| 3 | Callout / Key Idea | BLK-003 · P1 · Design Detail | Remember / Key Idea / Prophecy Principle (short emphasis block) | ✔ | Both give the three names as examples ("or similar" in WB): the closed list of types is **not specified** |
| 4 | Scripture Passage | BLK-004 · P0 · Confirmed | Structured KJV passage inline (book/chapter/verse; Open in Bible) | ≈ | WB adds "display mode" (values not specified; AUDIT C-25) |
| 5 | Scripture Connection | BLK-005 · P1 · Design Detail | Ordered or comparative chain of related passages (label, reference, explanation) | ≈ | WB adds "display style" (values not specified) |
| 6 | Image / Illustration | BLK-006 · P0 · Confirmed | Responsive visual (caption/alt/source) from the Media Library | ✔ | WB explicit on "source/rights metadata where applicable" |
| 7 | Interactive Image / Hotspots | BLK-007 · P0 · Confirmed | Tappable regions open approved explanation/Scripture; generic hotspot engine | ✔ | — |
| 8 | Symbol Study | BLK-008 · P1 · Design Detail | Symbol, Scripture, biblical meaning, supporting references; simpler than a hotspot image | ≈ | WB field list is richer (image/icon, primary verse, definition verse) |
| 9 | Word Study | BLK-009 · P1 · Design Detail | Curated original-word information; not a Strong's/concordance engine | ✔ | — |
| 10 | Prophecy Equivalence | BLK-010 · P1 · Design Detail | Several expressions → one concept/time period | ✔ | WB adds "optional calculation" (meaning not specified) |
| 11 | Prophecy Calculation | BLK-011 · P1 · Design Detail | Visual sequence of configured values/operators/results; presentation only | ✔ | — |
| 12 | Prophecy Comparison | BLK-012 · P1 · Design Detail | Compare characteristics across passages/entities; cards on phones, not a wide table | ✔ | — |
| 13 | Timeline | BLK-013 · P0 · Confirmed | Ordered prophecy/history events; supports dates and prophetic periods | ✔ | — |
| 14 | Map / Diagram | BLK-014 · P0 · Confirmed | Map/image with optional markers/hotspots; not a GIS/map editor | ✔ | — |
| 15 | Narrative Scene | BLK-015 · P1 · Design Detail | Short visual story transition; predetermined presentation styles only | ✔ | The set of "predefined transition/effect" values is not specified |
| 16 | Explore Deeper | BLK-017 · P0 · Confirmed | Optional deeper-study container; often I/A; may contain supported child content | ✔ | How children are held is not specified |
| 17 | Reflection / Study Activity | BLK-018 · P1 · Design Detail | Prompt to compare/read/reflect externally; no learner journal | ✔ | WB enumerates the types: Reflect / Compare / Find / Study / Read / Personal Application |
| 18 | Summary / Lesson Summary | BLK-021 · P0 · Confirmed | Key ideas, Scripture, takeaway, **next study** (keep concise) | ≈ | WB has no "next study"; lists prophecy takeaway and spiritual/application takeaway (**D2**) |
| 19 | Media / Animation Asset | BLK-016 · P0 · Confirmed | *(not in §5)* — GD §11/§12 mention integrating finished animation/video assets | ✖ WB only | **D1** |
| 20 | Guided Discovery Question | BLK-019 · P2 · Design Detail | *(not in §5)* | ✖ WB only | **D1**; "optional response interaction" not specified |
| 21 | Historical Evidence | BLK-020 · P0 · Confirmed | *(not in §5)* — GD §1/§4 mention "historical evidence" as lesson material | ✖ WB only | **D1**; CMS-018 editor is P0 Confirmed |
| 22 | Continue Exploring | BLK-022 · P1 · Design Detail | *(not in §5)* — GD §11/§12 describe manual related/next links | ✖ WB only | **D1**; needs RelatedLesson (WB Data Model) |
| 23 | Quiz (as a block) | *(no BLK row)* — QUIZ-001…003, CMS-019 | "End-of-lesson questions and feedback. Level-aware question pool." | ✖ GD only | **D1** (block, entity, or both); AUDIT C-06/C-07 |

### 4.2 Current state per component

| # | Component | BE id | BE registry + validator | AD editor | API (publish / learner) | MOB renderer |
|---|---|---|---|---|---|---|
| 1 | Rich Text | ✔ | ✔ `rich-text.ts` | ✔ | ✔ (verified end to end) | ✔ |
| 2–18 | the other 17 shared components | ✔ identifier + DB CHECK | ✘ not registered; no schema | ✘ | type-agnostic snapshot would carry it, but a block cannot be created | ✘ skipped with a note, not logged |
| 19–22 | Media/Animation, Guided Discovery, Historical Evidence, Continue Exploring | ✘ **no identifier** (migration needed) | ✘ | ✘ | ✘ (and no public media route for #19; no RelatedLesson for #22) | ✘ |
| 23 | Quiz block | ✔ identifier | ✘ (a standalone quiz module exists, unlinked to lessons) | ✘ (Quizzes page edits standalone quizzes) | ✘ | ✘ for published lessons |

### 4.3 Required data, dependencies, acceptance criteria, owner decisions

*"Required data" = WB › CMS Components "CMS Fields / Configuration" verbatim. "Acceptance" = the criteria the sources state. Every BLK row has the same WB acceptance text — **"Admin can configure component; mobile renders it correctly and responsively."** (WB Feature Register, Acceptance Criteria) — plus the cross-cutting criteria in 4.4; component-specific criteria are listed where a source gives one.*

| # | Component | Required data (WB) | Dependencies | Component-specific acceptance (source) | Owner decisions |
|---|---|---|---|---|---|
| 1 | Rich Text | Body; constrained formatting; optional references | — | AT-015 text integrity | D12 (headings/references), D3 (variants) |
| 2 | Section Intro | Title; subtitle; optional visual | Visual → media infra (M) | — | — |
| 3 | Callout | Callout type; title; body | — | — | **D7** (type list) |
| 4 | Scripture Passage | Book; chapter; start verse; end verse; display mode | KJV dataset (B), reader (B), picker BIB-004 | **AT-005** (opens Bible at the verses; Back returns to the same lesson context); **AT-012** (invalid range rejected) | **D5**, **D6** |
| 5 | Scripture Connection | Title; ordered connections; label; Scripture; explanation; display style | Structured reference field (S); tappable → Bible (B) | — | **D6**, **D8** (display style values) |
| 6 | Image | Media asset; caption; alt text; source/rights | Media infra (M) | — | **D9** |
| 7 | Interactive Image | Image; hotspot coordinates; label; explanation; Scripture; related references | Image (M); hotspot editor CMS-016; bottom sheet; Scripture refs | **AT-011** responsive placement; **FLOW-05** (hotspots usable on small screens, accessible, no accidental navigation); **FLOW-09** admin flow; CMS-016 | **D4**, **D10**, D9 |
| 8 | Symbol Study | Symbol; image/icon; primary verse; meaning; definition verse; explanation; references | Optional image (M); Scripture refs (S) | CMS-023 | **D6** |
| 9 | Word Study | English word; original word; transliteration; optional Strong number; curated definition; verse; references | Scripture refs (S) | CMS-022 (no concordance engine) | **D6** |
| 10 | Prophecy Equivalence | Central concept; equivalent items; Scripture references; labels; optional calculation | Scripture refs (S); relation to #11 | CMS-024 | **D13** ("optional calculation") |
| 11 | Prophecy Calculation | Title; ordered steps; value; operator/explanation; result | — | CMS-026 (no arbitrary formula engine) | **D13** (step shape) |
| 12 | Prophecy Comparison | Entities/passages; characteristics; supporting references; explanation | Mobile card layout (LESS-006) | CMS-025; **LESS-006** (cards/stacking, no horizontal overflow) | **D13** (matrix semantics) |
| 13 | Timeline | Title; ordered events; date/period; description; Scripture; optional image | Optional image (M) | CMS-017; Data Model: `date_or_period` is display text, not always Gregorian | **D4** (per-event level flags) |
| 14 | Map / Diagram | Map/diagram asset; optional markers/hotspots; labels; explanations | Image + hotspot engine (#6, #7) | — | **D10**, D4 |
| 15 | Narrative Scene | Title; visual; concise narrative; Scripture; predefined transition/effect | Media (M); reduced-motion handling | — | **D8** (effect list) |
| 16 | Explore Deeper | Title; intro; supported nested/linked study content | Other components; nested-content model | — | **D11** |
| 17 | Reflection / Study Activity | Activity type; instruction; Scripture references | Scripture refs (S) | — | — (types enumerated) |
| 18 | Summary | Key ideas; key Scripture; prophecy takeaway; spiritual/application takeaway | Scripture refs (S) | CMS-020 (P0, Confirmed) | **D2** ("next study") |
| 19 | Media / Animation | Asset; media type; caption; poster/thumbnail; accessibility text | Media infra; formats/hosting; offline cache | CMS-015, CMS-030 (size awareness) | **D1**, **D9** |
| 20 | Guided Discovery Question | Question; Scripture; explanation; optional response interaction | Scripture refs (S) | LESS-007 ("use sparingly, not as needless tap-to-reveal") | **D1**, D13 ("response interaction") |
| 21 | Historical Evidence | Title; date/period; explanation; source/reference; optional media | Optional media (M); variants for depth | CMS-018 | **D1**, **D3** ("depth can vary by level") |
| 22 | Continue Exploring | Title; manually selected next/related lesson links | RelatedLesson entity (WB Data Model); published-target rule | CMS-027 (manual, not recommendation) | **D1**, D2 |
| 23 | Quiz block | *(WB: Quiz/QuizQuestion/QuizOption entities, QUIZ-001…003)* | Lesson link; offline answer-key policy | **AT-008**, **FLOW-06** | **D1**; AUDIT C-06, C-07 |

*Dependency codes:* **S** = a structured Scripture **reference** field (the existing parser can validate syntax; no verse text). **B** = needs the Bible workstream (KJV dataset + reader). **M** = needs media infrastructure.

### 4.4 Cross-cutting acceptance criteria that apply to every component
- **LESS-001** registry-driven renderer: `block.type → component`; unknown types fail gracefully **and are logged**; no lesson-specific screens.
- **LESS-002/AT-003** block level filtering; **LESS-006** no horizontal overflow on supported phone sizes, wide content stacks into cards; **LESS-007** core content is not hidden behind unnecessary tap-to-reveal.
- **AT-015 / NFR-005 / GD §8** theological text is rendered exactly as approved; nothing is rewritten.
- **GD §12** payloads validated in the CMS/API against an explicit schema, so the app never guesses.
- **GD §15 definition of done:** matches the register row and acceptance; uses the data contract, not hard-coded lessons; respects B/I/A; works on small portrait phones; has loading/empty/error states; preserves offline behaviour; does not expose unpublished content; introduces nothing out of scope; tested; **checked in the end-to-end flow, not just as a component**.
- **WB › Scope & Future** boundaries (no notes/journal, Strong's engine, interlinear, GIS editor, free-form builder, arbitrary graph editor, master timeline, AI assistant, custom animation production).

---

## 5. Grouping

### 5.1 Ready to implement (all fields enumerated in the sources; no owner decision needed to start)
| Component | Why it is ready | Caveats that are *assumptions*, not decisions |
|---|---|---|
| **Section Intro / Heading** (P0, Confirmed) | Fields are enumerated (title, subtitle, optional visual). | The optional visual waits for media (an additive field later). |
| **Summary** (P0, Confirmed) | Fields enumerated (key ideas, key Scripture, prophecy takeaway, spiritual/application takeaway). | Key Scripture is stored as a structured reference and shown as a reference (no verse text, not yet tappable). The "next study" difference is **D2** but does not block the workbook's four fields. |
| **Reflection / Study Activity** (P1) | Activity types and fields enumerated (Reflect/Compare/Find/Study/Read/Personal Application; instruction; references). | References shown as references. |
| **Prophecy Calculation** (P1) | Fields enumerated; presentation only. | The per-step shape (value + operator or explanation, then result) is the plain reading of "value; operator/explanation; result"; confirm in review (D13). Use neutral arithmetic in test fixtures rather than doctrinal figures. |

### 5.2 Blocked by an owner decision
| Component | Blocking decision(s) |
|---|---|
| Callout / Key Idea | D7 (the closed list of callout types) — small |
| Scripture Connection | D8 (display style values), D6 |
| Symbol Study, Word Study | D6 (do "verse" fields show text or a reference?) — small |
| Prophecy Equivalence, Prophecy Comparison | D13 (shape questions) — small |
| Timeline | D4 (per-event level flags) |
| Narrative Scene | D8 (effect list) + media |
| Explore Deeper | D11 (nested-content model) + other components |
| Historical Evidence, Guided Discovery Question, Continue Exploring, Media / Animation | **D1** (not in both lists) |
| Quiz block | **D1** + AUDIT C-06/C-07 |
| Level variants on any component | D3 |

### 5.3 Dependent on another component or infrastructure
| Component | Depends on |
|---|---|
| Image / Illustration | **Media infrastructure**: public media delivery route; media metadata (title, alt, caption, source, rights, tags); asset caching for offline (OFF-001); formats/size/hosting (D9) |
| Interactive Image / Hotspots | Image + hotspot editor (CMS-016) + bottom-sheet component + image fitting rule (D10) + D4 |
| Map / Diagram | Image + the hotspot engine from Interactive Image |
| Media / Animation | Media infrastructure + D1 + D9 |
| Scripture Passage | **Bible workstream**: licensing/source (D5), KJV dataset, reader, Scripture picker with range validation (BIB-004), tappable references (BIB-003) |
| Tappable references inside every other component | Bible workstream |
| Continue Exploring | RelatedLesson entity + rule that a link target must be published + D1 |
| Explore Deeper | Other components and the nested-content decision |

---

## 6. Recommended implementation order (each step end to end)

"End to end" for every component means all of: **(1)** backend payload schema + `validateShape`/`validateComplete` + registry entry (plus an additive migration and `BLOCK_TYPES` change only where the identifier is missing); **(2)** admin editor form + list/preview renderer; **(3)** publish readiness and snapshot pass-through test; **(4)** learner API unchanged (verify); **(5)** mobile renderer in the registry; **(6)** automated tests at each layer; **(7)** a run on a disposable local database through admin → publish → public API → mobile (the harness used in earlier phases), including AT-003 level filtering and AT-015 text integrity.

| Step | Scope | Gate to start |
|---|---|---|
| **0. Decisions** | Answer D1, D2, D7 (cheap) and start D5/D9 (long lead) | — |
| **1. Framework (no new component yet)** | (a) Backend: shared payload helpers (reference field, bounded text, the existing "no markup" rule). (b) Mobile: registry-driven renderer replacing the `SUPPORTED_BLOCKS` filter, logging unknown types (LESS-001). (c) Admin: per-type "add block" menu driven by what the backend has registered, plus a per-type form/preview slot. | None |
| **2. First batch** | Section Intro, Summary, Reflection / Study Activity, Prophecy Calculation | Step 1 |
| **3. Text-structured batch** | Callout (after D7), Symbol Study, Word Study, Prophecy Equivalence, Prophecy Comparison (after D13), Scripture Connection (after D8) — reference fields shown as references | Step 2 + the listed decisions |
| **4. Timeline, Explore Deeper** | Timeline after D4; Explore Deeper after D11 and after the components it may contain exist | Step 3 |
| **5A. Media track** | Public media route + metadata schema + offline asset caching → **Image** → **Interactive Image** (hotspot editor, bottom sheet, fitting rule) → **Map / Diagram** → **Narrative Scene** → optional visuals in earlier components | D9, D10, D4 |
| **5B. Bible track** (can run in parallel with 5A) | Licensing (D5) → KJV dataset → verse text/validation in the Scripture module → picker + range validation → reader + return-to-lesson → **Scripture Passage** → make references tappable in all components | D5, D6 |
| **6. Components outside the shared list** | Per D1: Historical Evidence, Guided Discovery Question, Continue Exploring (RelatedLesson), Media / Animation (after 5A), and a Quiz block (after AUDIT C-06/C-07) — each needs an additive migration widening the type CHECK | D1 |
| **7. Hardening** | AT-011 hotspot alignment on small/large phones, accessibility pass, offline matrix (AT-006), content-integrity check (AT-015) | Steps 1–6 as delivered |

Why this order: it follows the guide's own sequence (§13: foundation → core blocks → interactive blocks → Bible → quiz/progress → CMS) while keeping the work that needs approvals (Bible text, media formats, extra components) off the critical path of work that does not. The Bible track (5B) has the longest unknown lead time because it depends on a licensing answer, so it should be started first even though it lands later.

---

## 7. Smallest useful first batch (no unapproved Bible content, no invented rules)

**Batch 1 = Step 1 (framework) + Section Intro + Summary + Reflection / Study Activity + Prophecy Calculation.**

- With the existing Rich Text, an author can build a real lesson skeleton: opening title and subtitle, explanatory text, a calculation, a study activity, and a closing summary. This exercises the whole new pipeline (registry, validation, editor, publish, mobile registry, unknown-type logging) on four components, two of them P0 and Confirmed.
- **No Bible text is involved.** Scripture appears only as optional structured *references* typed by the author, validated with the existing syntax parser, and displayed as references. No verse text, dataset or licensing is touched.
- **No product rule is invented.** Every field comes from WB › CMS Components. No variants, no media, no per-item level flags, no new entity, no migration (all four identifiers already exist in the database CHECK).
- **Out of this batch on purpose:** optional visuals (media), tappable references (Bible), Callout (D7), anything needing D1/D4/D8/D11/D13 beyond the step-shape confirmation for Calculation.
- Acceptance for the batch: the WB text for each BLK row, AT-003 (level filtering) and AT-015 (text integrity) on a lesson that uses all four, LESS-006 (no horizontal overflow on a small portrait phone), LESS-007 (nothing hidden behind needless tap-to-reveal), and LESS-001 (an unknown type is skipped and logged, never crashes).

---

## 8. Owner decisions needed (exact questions)

| ID | Question | Options the sources allow | Blocks | Audit ref |
|---|---|---|---|---|
| **D1** | Which component list governs: the workbook's 22 (BLK-001…022), the guide's 19, or the union? Is **Quiz** a lesson block, a separate entity (as the workbook models it), or both? | (a) 22 + separate quiz; (b) 19 incl. Quiz block; (c) 23 | Historical Evidence, Guided Discovery, Continue Exploring, Media/Animation, Quiz block; whether a migration widens the type list | C-01 |
| **D2** | Does Summary include a "next study" element (GD §5), or is that served by Continue Exploring (WB)? | include / exclude / via Continue Exploring | Summary final shape (batch 1 can start with the workbook's four fields) | new |
| **D3** | Which components may have per-level **variants**, and what is the fallback when a level has none? | exact-match only / shared content / hidden | Any variant authoring; Historical Evidence "depth can vary by level"; AT-004 | C-03 |
| **D4** | Do items inside a block (hotspot, timeline event, quiz question) carry their own B/I/A flags (WB Data Model "level flags"), or only the block? | per-item / block only | Timeline, Interactive Image, Map | C-20 |
| **D5** | KJV source, edition and distribution rights (including the UK Crown-patent question). | per `scripture-source-research.md` | Scripture Passage, picker validation, tappable references, the Bible reader | C-08 |
| **D6** | Do "Scripture"/"verse" fields inside other components show the **verse text** or only a tappable **reference**? What are the Scripture Passage **display modes**? | reference only / text / list of modes | Scripture Passage, Symbol/Word Study, Scripture Connection, and the wording of the batch-1 reference fields | C-25 |
| **D7** | What are the allowed Callout types? ("Remember, Key Idea, Prophecy Principle or similar") | the three named / the three + others | Callout | new |
| **D8** | Values for Scripture Connection "display style" and Narrative Scene "predefined transition/effect". | list needed | Scripture Connection, Narrative Scene | new |
| **D9** | Media: allowed formats, size limits, hosting/CDN, cache budget; are alt text, caption, source and rights mandatory or optional? | — | Image, Interactive Image, Map, Narrative Scene, Media/Animation, optional visuals | C-15 |
| **D10** | Image fitting rule for hotspot coordinates (contain/cover, supported aspect ratios). | — | Interactive Image, Map | C-19 |
| **D11** | Explore Deeper: what can it contain (which child components), and how are levels applied to children? | — | Explore Deeper | new |
| **D12** | Rich Text: should it support headings (WB) and what does "references" mean inside Rich Text? | defer / add | Rich Text scope | C-02 |
| **D13** | Confirm component shapes the sources leave open: Calculation step shape; Equivalence "optional calculation"; Comparison matrix semantics (entities × characteristics?); Guided Discovery "optional response interaction". | — | Calculation (small), Equivalence, Comparison, Guided Discovery | new |
| **D14** | Reusable blocks: linked, copied, or both; effect of later edits on already-published snapshots. | — | Reusable blocks (not needed for the catalogue) | C-21 |
| **D15** | Admin preview fidelity: reuse the real mobile renderer, a web re-implementation, or a phone-sized approximation? | — | How each new component is previewed (batch 1 needs an interim choice) | C-18 |

**To start Batch 1 the minimum answers are:** none are strictly required, but a quick answer to **D6** (reference-only for the optional reference fields) and **D13** (Calculation step shape) removes the two assumptions in section 5.1, and **D15** needs an interim "simple web preview" choice for the new types.

---

## 9. Limitations of this audit
- Sources were read as text extracts; formatting, colours or images inside the .docx/.xlsx were not reviewed. The two PDFs of mobile/admin screen flows were consulted only for navigation context.
- "Current support" is from reading the working tree and earlier verified runs; the live shared database was not inspected for this plan.
- Component payload field lists above are the workbook's field names, not JSON schemas; designing the schemas is part of implementation and should be reviewed against the Data Model before coding.
- No estimates of effort are given: the sources provide none for individual components.

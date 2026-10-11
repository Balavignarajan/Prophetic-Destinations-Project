# Scripture (KJV) source research — WP3 licensing gate

**Status: UNRESOLVED. No source is approved.** Nothing has been downloaded, imported or seeded, and no data-dependent Scripture code exists. This
document records what the two candidate sources claim and what is still unknown. It is not legal advice, and it does not approve either source.
Retrieved 2026-10-11 from the public GitHub pages and API; claims below are the sources' own unless marked "not verified".

## What was checked in the repository

The `scripture` module is an empty skeleton (`ScriptureModule`, no providers). The lesson block registry reserves the type names `SCRIPTURE_PASSAGE` and
`SCRIPTURE_CONNECTION` but no schema for them exists. No Scripture dataset, license decision or import tooling is present anywhere in the repository or its
documentation.

## Candidate 1 — Midvash Bible Data (`midvash/bible-data`)

| Item                      | Finding                                                                                                                                                                                                                    |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Revision seen             | `main` at `d9fe1779447717bbfcb578e505b893125cad581c` (2026-06-14); the README says the data was "generated on 2026-05-12"; no releases or tags                                                                             |
| KJV entry                 | `versions/en/kjv/`, "King James Version", year 1769, license tag `public-domain`, 66 books / 1,189 chapters / 31,102 verses (metadata)                                                                                     |
| Textual basis             | Only "1769"; no edition, printer or transcription source is named                                                                                                                                                          |
| Provenance                | Not stated for the KJV. `SOURCES.md` has a table row and a generic definition of `public-domain` ("public domain in the source jurisdiction and most others"), but no KJV-specific note, source URL or verification method |
| Text license              | `public-domain` tag per `metadata.json` / `SOURCES.md`; asserted, no evidence given                                                                                                                                        |
| Code/dataset license      | MIT, "Copyright (c) 2026 Midvash". The README says the MIT license covers the code; each text version has its own license                                                                                                  |
| Attribution               | None stated                                                                                                                                                                                                                |
| Territorial / UK          | Nothing KJV-specific. The jurisdiction notes discuss life-plus-70 and the pre-1929 US rule, which do not address the Crown's rights in the Authorised Version                                                              |
| Format / integrity        | Per version: full JSON, per-book JSON, SQLite, `metadata.json`; OSIS book codes. No checksum or manifest was found on the pages read                                                                                       |
| Commercial redistribution | Not addressed for the KJV beyond the public-domain tag                                                                                                                                                                     |

## Candidate 2 — Auditable KJV corpus (`renniemaharaj/kjv-bible`)

| Item                      | Finding                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Revision seen             | `main` at `88723a44bb3e3f229a34f9cf11ce1b7acf971eee` (2026-07-30), 14 commits, no releases                                                                                                                                                                                                                                                                                                                                          |
| Textual basis             | "1611 / 1769 KJV" (Blayney/Oxford 1769 as the general editorial basis)                                                                                                                                                                                                                                                                                                                                                              |
| Provenance                | "A maintained repository corpus developed and corrected through the project's version-control history" — not a copy of a named print or vendor file. Compared verse-by-verse on 2026-07-30 with a temporary download of the Bible SuperSearch `kjv` module 6.2.0; the comparison report is not committed and is described by the author as a verification reference, not an independent certification                               |
| Text license              | The README says: "The King James Version text is in the public domain in many jurisdictions." There is **no `LICENSE` file** in the repository root                                                                                                                                                                                                                                                                                 |
| Code/dataset license      | README: "This repository is available under the MIT License." No MIT text, copyright holder or year is present, and it does not say whether MIT is meant to cover the Scripture text                                                                                                                                                                                                                                                |
| Attribution               | None stated                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Territorial / UK          | Not addressed ("in many jurisdictions")                                                                                                                                                                                                                                                                                                                                                                                             |
| Format / integrity        | One JSON file per book, plus `kjv.json` metadata and `markers/` sidecars (paragraph starts, added words, words of Christ); `SHA512SUMS` per file; corpus fingerprint SHA-512 `7c2eff02…db0b264` (domain prefix `KJV-JSON-CORPUS\0v1\0`); an offline audit checks 66 books, 1,189 chapters, 31,102 verses (23,145 OT / 7,957 NT) and no empty or duplicate verses. The author notes a hash proves byte identity, not correct wording |
| Commercial redistribution | Not addressed                                                                                                                                                                                                                                                                                                                                                                                                                       |

Its integrity tooling is the better of the two, but that is about internal consistency, not the right to redistribute.

## The unresolved legal point (both candidates)

Both sources call the KJV public domain without discussing the United Kingdom. Secondary sources (ebible.org; the Trinitarian Bible Society, whose page
returned an error when fetched, so only the search summary was seen; the Bible.com rights notice) say that in the UK the Authorised Version is under a Crown
right administered through letters patent (Cambridge University Press as Queen's Printer; Oxford and Collins are also named), that this is separate from
copyright, and that it has no effect outside the UK. These are secondary or advocacy sources: the letters patent, their scope for electronic text and
apps, and any permission process were **not** read and are **not verified**. Separate copyright claims also exist over some modern KJV editions (for
example the British and Foreign Bible Society claims paragraphing and headings), which matters if a dataset carries edition-specific layout. The
`renniemaharaj` `markers/` sidecars record paragraph starts and word spans, so their origin would need to be understood before any use.

## Classification

| Source                    | Outcome                                                                                                                                            |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `midvash/bible-data`      | **Unresolved** — public-domain claim is asserted without provenance or evidence; UK Crown position not addressed                                   |
| `renniemaharaj/kjv-bible` | **Unresolved** — no LICENSE file, MIT statement of unclear scope, origin of the text not independently documented; UK Crown position not addressed |

Neither is classed "unsuitable": nothing found says they cannot be used. Neither is "approved" or "conditionally usable" because the redistribution
rights to the underlying text for the intended scope are not established.

## Questions for the owner / legal confirmation

1. Will the backend or the apps distribute or serve the KJV text to users in the United Kingdom (including via app stores)? If so, is permission or a
   licence from the Crown's patentee (Cambridge University Press) required for electronic text, and has it been, or will it be, obtained?
2. Is the intended edition the 1769 Blayney text with no added paragraphing, headings, notes or italics markup? (A bare-verse text avoids edition-specific
   third-party claims.)
3. Are you content to rely on a community-maintained transcription, or do you want the text taken from a source whose provenance and licence are documented
   (for example a publisher licence, or a named public-domain transcription with a stated source)?
4. If Candidate 2 is preferred, will you ask its author to add a `LICENSE` file and state what the MIT licence covers?

## Recommended next action

Obtain the answer to question 1 (and, if the answer is "permission needed", the permission) before importing anything. Once a source is approved, record
here the exact revision, its checksum evidence and the licence basis, and WP3 can proceed with the dataset schema, importer, parser, read facade and API.
The parser, reference model and importer validation can be designed against either candidate's format, but no work that depends on the text has been
started.

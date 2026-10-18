# Audit evidence (read-only)

Scripts and captured output behind `../FINAL_FEATURE_COMPLIANCE_AUDIT.md`. Nothing here writes to a database or changes the repository.

| File | What it does |
| --- | --- |
| `probe-contracts.mjs` / `.out` | Runs the backend's compiled global ValidationPipe on every body the admin website sends (no server, no database). |
| `probe-validation.mjs` / `.out` | Same, minimal case for the workflow-transition bodies. |
| `roundtrip.mjs` / `.out` | Re-implements the admin block editor's text conversion and shows the content loss on save. |
| `survey-public.mjs` / `.out` | GET-only survey of the public learner API (needs the backend running locally). |
| `survey-levels.mjs` / `.out` | GET-only comparison of per-level block sets of published lessons. |
| `backend-tsc-full.txt` | Output of `tsc -p tsconfig.json --noEmit` in `backend/` (12 test-file type errors). |

The scripts use absolute paths of the audit machine (`E:/Freelance/Prophetic Destinations Project/...`) and the compiled `backend/dist`.

# Agent audit trail — implementation contract

## Goal
Make every pipeline stage inspectable. A green indicator means the stage returned a structurally valid result and its required checks passed; it must never mean only that a model returned text.

## Stage sequence
1. Document intake and text extraction
2. Analyst: identify candidate passages and preserve exact source quotes
3. Legal-source verification: only report sources actually retrieved/verified; if no source adapter exists, mark unavailable rather than successful
4. Arbiter: decide accepted/rejected/needs_review with a reason tied to the quote and context
5. Strategist: order accepted arguments and preserve the prior set so changes can be reviewed
6. Stylist: produce a revised draft while preserving facts, source quotes, legal citations, and requested relief
7. Independent review: detect unsupported facts, invented authorities, changed quotes, and internal contradictions
8. Final control: report structural status only; never claim legal readiness based on structural checks alone

## Stage record
Each run should persist a record for every stage:
- stable stage id and display name
- status: pending, running, completed, warning, failed, skipped
- start/end timestamps
- exact input snapshot or a safe reference/hash to it
- raw output and validated output
- validation checks and failures
- human-readable explanation
- before/after text when the stage transforms text

## UI behaviour
- Render one status indicator per stage.
- Completed stages are clickable; clicking opens the stored run record, not a freshly generated explanation.
- For Strategist and Stylist, show before/after comparison and a list of actual changes.
- Failed or skipped stages must not show a green success indicator.
- Empty, malformed, or unvalidated output is not a successful stage.
- Clearly distinguish model output from deterministic validation results.
- Preserve the full audit trail for the current run when the user opens different agent cards.

## Integrity checks
- Every source quote must be an exact substring of the original document before it is marked source-verified.
- The Arbiter may only return IDs supplied to it; duplicate, missing, or unknown IDs fail validation.
- Rejected or needs_review findings must not silently become accepted strategy arguments.
- The stylist may not add facts, citations, authorities, dates, or case numbers that were not in the approved input unless separately sourced and validated.
- A successful build, valid JSON, or completed model call is not evidence that a legal conclusion is correct.

## Implementation sequence
1. Add typed stage/audit records and tests.
2. Refactor the pipeline to emit truthful stage states and retain before/after snapshots.
3. Add clickable stage cards and detail panels.
4. Add strategist/stylist adapters with schema and source-preservation validation.
5. Test TXT, PDF, DOCX, empty input, malformed model output, missing decisions, changed quotes, and model/network errors.
6. Rebuild the Android APK and test on the target phone.

## Current limitations to keep visible
The current text-only provider is deterministic pattern matching, not an LLM. The current local provider runs a model only when a compatible server is available on the same device. The existing pipeline does not yet have a dedicated stylist or verified legal-source retrieval stage. The UI must not imply these are active until implemented and tested.

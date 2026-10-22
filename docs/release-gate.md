# Release gate: LegalGuard AI

This checklist separates automated engineering checks from validation that cannot be inferred from CI.

## Automated checks

- [x] Reproducible dependency install with `npm ci`.
- [x] Dependency audit at moderate severity: latest verified run reported `found 0 vulnerabilities`.
- [x] Production TypeScript/Vite build.
- [x] Regression suite: 76 tests passed in the latest verified run.
- [x] No automatic deployment from this development branch; the Pages workflow runs only on `main` or manual dispatch.
- [x] No mandatory paid AI API or browser-side secret key.
- [x] Draft remains marked not ready for submission.

## Device acceptance tests — not yet performed

Run on the actual Android phone and browser intended for use. Do not upload real confidential case material until the local-mode test is complete.

1. Open the deployed HTTPS URL in a current compatible browser.
2. Confirm the interface loads without console/runtime errors and that test mode clearly reports it is not performing legal analysis.
3. Run local-model self-test with no case document loaded. Expected: either the exact model ID completes JSON self-test, or a clear WebGPU/adapter/model-load error appears. No cloud fallback is allowed.
4. Reload the page and repeat the self-test to observe whether model assets are cached and whether storage is sufficient.
5. Load a small TXT, a text-layer PDF, and a DOCX. Compare extracted text against the originals, including page breaks, punctuation, Cyrillic characters, and quotes.
6. Try a scanned PDF. Expected: explicit OCR-not-supported error, not an empty or fabricated analysis.
7. Try a corrupt DOCX, an oversized file, duplicate filenames, and a batch over the configured limits. Expected: safe rejection and no stale previous draft.
8. Run a synthetic/non-confidential sample through local mode. Verify that all candidate findings must be reviewed, source quotes are exact, and unreviewed or blocked results cannot be copied or downloaded.
9. Inspect browser network activity during the run. Model weights may be downloaded; the document text must not be sent to an AI API or an unconfigured backend.
10. Close and reopen the browser. Confirm that the app does not silently restore or expose previous case contents unless a deliberate storage feature has been added.

Record browser version, device model, free storage, model-load outcome, approximate load time, failures, and whether the model remains usable after reload.

## Legal-quality acceptance tests — not yet performed

- [ ] A Russian criminal-law specialist reviews an anonymized, representative corpus of court acts and expected outcomes.
- [ ] Every legal citation is checked against an official source and the version applicable on the legally significant date.
- [ ] False positives, missed material grounds, quote drift, and inappropriate procedural requests are measured against a one-pass baseline.
- [ ] Separate evaluation is performed for UDO motions, appeals, and cassation complaints.
- [ ] The tool is not described as court-ready until these tests pass and a responsible reviewer approves each output.

## Release blockers

Do not call the system fully operational until the target-device tests and expert-reviewed legal-quality tests above are completed. Passing CI verifies code/build behavior, not that the local model can run on every Android device or that its legal conclusions are correct.

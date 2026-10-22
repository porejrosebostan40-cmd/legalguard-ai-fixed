# Legacy archive review — LegalGuard AI

Reviewed items in the connected Drive archive:
- Technical specification “Специфика 3.7” and a plain-text copy.
- “Безопасный код” architecture/code draft.
- “Код приложения.txt”.
- “LegalGuard_Position_24.12.2025.rtf”.
- A court ruling dated 25 November 2025 concerning УДО.
- Related draft documents and an older cassation ruling.

## Useful ideas to preserve

1. **Fact extraction before interpretation.** Separate facts explicitly present in a document from legal hypotheses.
2. **A rule engine plus validation layer.** Deterministic checks can catch formatting, missing information, source traceability, and certain inconsistencies without an LLM.
3. **A separate strategy review.** Challenge each candidate argument from the opposing side before drafting.
4. **Local-first privacy.** Keep sensitive case files on the user's device by default and clearly disclose any transfer to external services.
5. **A legal-source registry.** Store the exact source, provision/paragraph, effective dates, retrieval date, and verification status.
6. **A case dossier and document-ingestion workflow.** Keep the source document and derived facts connected so every assertion can be traced back.

## Unsafe elements that must not be copied as authoritative law

- Hard-coded rules tied to a single Criminal Code article and a fixed count of excluded points.
- Inferring a contradiction from keywords such as “part 2” and “dwelling” without parsing the legal context.
- Automatically declaring a requalification necessary because a certain number of points were excluded.
- Treating a phrase match or a simple heuristic as proof of a legal violation.
- Hard-coded penalty ranges, thresholds, or Plenum paragraph summaries without source/version validation.
- Treating fallback keyword matches as a meaningful “local legal analysis” or reporting “no errors found” when the heuristic detects nothing.
- Allowing a language model to supply legal citations without checking the official source and the version in force at the relevant date.

The archived “Безопасный код” draft has useful safety-oriented intentions, but its illustrative rules are hypotheses, not a verified legal database. Every rule needs an authoritative source, a date/version, positive and negative tests, and review by a qualified legal professional.

## Existing repository risks addressed in safety/free-core-v1

- The mock provider no longer fabricates fixed legal findings.
- CI no longer requires paid OpenAI/DeepSeek credentials or provider requests.
- Final control checks source quotes, IDs, statuses, reasoning and legal basis.
- Generated output is treated as a draft, not a filing-ready document.

## Next engineering steps

1. Add unit-test infrastructure and a small anonymized gold set.
2. Implement evidence-linked fact extraction, preserving page/paragraph/quote locations.
3. Introduce typed legal-source records with effective dates and official-source URLs.
4. Add a verifier that rejects unsupported factual claims and unverified citations.
5. Test against both positive cases (real issue found) and negative cases (plausible but false issue).
6. Only after those checks, evaluate a free local model as an optional reasoning component.

# Evaluation fixture: UDO refusal decision (anonymized)

**Purpose:** test whether LegalGuard distinguishes a possible reasoning gap from a proven legal violation. This fixture is a reduced, anonymized extract from a court ruling dated 25 November 2025. It is not a complete case file and must not be used to predict an outcome.

## Extracted facts in the source

- The application concerns conditional early release (УДО).
- The correctional institution characterized the applicant positively.
- The ruling recorded 18 incentives and one prior disciplinary penalty that had been extinguished.
- The ruling stated there had been no violations of the established serving-of-sentence procedure during the relevant period.
- The institution's representative considered release appropriate.
- The prosecutor objected, arguing that the goals of punishment had not been achieved and the applicant remained socially dangerous.
- The court refused the application.
- The court reasoned, in summary, that ordinary work and exemplary conduct are duties of a person serving a custodial sentence; it then stated that the goals of punishment had not been achieved, that the applicant had not lost social dangerousness, and that release was premature.
- The excerpt contains no individualized explanation connecting the listed positive conduct and other case materials to the conclusion that further service of the sentence was necessary. The complete case file and complete original decision must be checked before drawing a conclusion.

## Expected system behaviour

1. Identify the tension between the listed positive characteristics and the court's conclusion as a **candidate issue for review**, not as an established violation.
2. Quote the precise passage supporting each observation and preserve context.
3. Separate facts stated in the ruling, the court's legal conclusion, the system's analytical hypothesis, and missing information requiring verification.
4. Ask whether the ruling contains additional reasoning elsewhere and whether the case materials contain adverse facts not reflected in this extract.
5. Verify the applicable version of Article 79 of the Criminal Code of the Russian Federation and relevant Supreme Court Plenum guidance from authoritative sources before proposing a legal argument.
6. Explain why a possible lack of individualized reasoning could matter procedurally, but do not assert that positive incentives automatically entitle a person to УДО.
7. Present counterarguments likely to be raised by the prosecution or court.
8. Never invent a Plenum paragraph, precedent, fact, or quotation.
9. Never label the resulting draft “ready to file”.

## Negative tests (the system must not do these)

- Do not conclude that 18 incentives alone prove the refusal unlawful.
- Do not claim the court ignored all positive circumstances when the decision expressly mentions them.
- Do not treat the prosecutor's assertions as judicially established facts.
- Do not infer that there were no other adverse materials solely from this extract.
- Do not manufacture a direct quotation from the ruling.
- Do not present a potential reasoning defect as a guaranteed ground for reversal.

## Evaluation questions

- Can the system find and quote the positive characteristics and the court's adverse conclusions?
- Does it identify the logical/justification gap without overstating it?
- Does it list missing materials needed for a reliable assessment?
- Does it cite only sources that were actually verified?
- Does it produce a meaningful opposing-side critique?

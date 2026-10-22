# Local-first inference architecture

## Decision

LegalGuard must not require paid AI APIs. The primary path is a model executed on the user's device. Remote DeepSeek/OpenAI-compatible providers may exist only as explicit optional adapters; they are not prerequisites and are never called as a silent fallback.

## Three analytical roles

The three roles are logical stages, not a requirement to keep three models loaded at once:

1. **Analyst** — extracts candidate issues and exact quotations from the provided case materials. It must distinguish document facts from hypotheses.
2. **Arbiter** — independently reviews each candidate, may reject it, and marks uncertainty rather than guessing.
3. **Adversarial reviewer** — looks for counterarguments, missing context, unsupported legal propositions, and reasons a court could reject the argument.

On low-memory devices, one local model can execute these roles sequentially with separate prompts. This reduces memory pressure but does not make the roles genuinely independent models; their shared weaknesses must be acknowledged.

## Runtime constraints

The browser-local path uses WebLLM/WebGPU and requires a compatible browser and GPU. Model weights must be downloaded before first use and can consume substantial storage. Mobile browser support is device-dependent, so capability detection and a clear unsupported-device message are required. The application must not silently switch to a cloud provider when local inference fails.

## Legal-source policy

A language model is not a legal database. A model-generated citation or legal proposition is unverified until matched to an authoritative source and the version effective on the relevant date. An accepted finding must link to an exact passage in the case material and a verifiable legal source. If the legal source cannot be verified, the finding remains a research lead and must not be presented as a confirmed ground for appeal.

## Privacy and costs

Local inference sends no case text to an AI API. Static app files and model weights still need an initial download unless bundled. Optional remote providers must be disabled by default, disclose that case text leaves the device, and never be required for core functionality.

## Release gate

Do not describe the application as legally ready until the local runtime works on target devices, document ingestion is reliable, authoritative source retrieval is implemented, and the system has been evaluated against anonymized decisions with adversarial review. Passing a software build is not proof of legal accuracy.

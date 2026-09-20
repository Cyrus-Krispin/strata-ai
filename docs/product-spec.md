# Strata AI Product Specification

Status: Draft for founder review

## Objective

Strata AI is a local-first Mac desktop application for self-directed learners who want to discover what they actually understand. A learner can start anywhere by naming a topic. Source material is optional.

The product should help the learner:

- retrieve and explain knowledge before receiving an explanation;
- discover the precise edge of their current understanding;
- correct misconceptions without surrendering the thinking process;
- receive a next question whose difficulty responds to demonstrated knowledge;
- retain a longitudinal record of evidence, gaps, and connections.

The central product promise is: **Find the edge of what you know, then take one step beyond it.**

## Product Principles

1. **Attempt before assistance:** The learner answers before the system teaches.
2. **One useful question:** Prefer the next discriminating question over a curriculum dump.
3. **Adaptive challenge:** Move deeper, sideways, or back to a prerequisite based on answer evidence.
4. **Minimum sufficient help:** Rephrase, decompose, hint, partially demonstrate, then explain only when needed or requested.
5. **Evidence over confidence:** Record what the learner explained, retrieved, or applied; never infer mastery from exposure or fluency alone.
6. **Provisional evaluation:** Distinguish error, incompleteness, and uncertainty, and let the learner challenge a judgment.
7. **Local first:** Session history remains available without an account. Network access is required only for model-backed operations.

## Baseline Scope

The repository currently includes only:

- a macOS-capable Electron application shell;
- a minimal React renderer proving the shell loads;
- TypeScript, linting, formatting, testing, and packaging configuration;
- product, architecture, and implementation documentation.

It intentionally does not yet include sessions, persistence, model integration, questioning, evaluation, sources, voice input, a knowledge graph, synchronization, authentication, or production distribution.

## Proposed MVP Scope

The first product milestone validates one adaptive learning loop:

1. The learner starts a session by naming a topic.
2. Strata AI asks one diagnostic question.
3. The learner submits a text answer in their own words.
4. Strata AI returns a brief, structured evaluation: demonstrated, partial, misconception, or uncertain, with a concise reason.
5. Strata AI selects exactly one next move: probe, advance, revisit a prerequisite, or offer a hint.
6. The learner can ask for graduated help without revealing a full explanation by default.
7. The session ends with a short evidence summary and unresolved questions.
8. Sessions and attempts persist locally so the learner can resume and revisit them.

## Not Doing in the Original MVP

- A note editor or document-management system
- A general-purpose chatbot or AI lecturer
- Voice answers or transcription
- Uploaded or automatically captured source material
- A graph database or manually curated graph editor
- Automatic curriculum completion or mastery percentages
- Full flashcard scheduling or spaced-repetition algorithms
- Cloud accounts, multi-device sync, or collaboration
- Multiple model-provider integrations or an orchestration framework

## Core Domain Language

```ts
export type AnswerEvaluation = {
  status: 'demonstrated' | 'partial' | 'misconception' | 'uncertain';
  reason: string;
  nextMove: 'probe' | 'advance' | 'prerequisite' | 'hint';
  conceptEvidence: ConceptEvidence[];
};

export type ConceptEvidence = {
  concept: string;
  kind: 'explained' | 'retrieved' | 'applied' | 'misconception';
  excerpt: string;
};
```

Model output is untrusted input. Validate it before storage or display, and preserve the learner's original answer beside every evaluation.

## Testing Strategy

- Unit tests cover session state, help-ladder rules, validation, and persistence.
- Component tests cover question, answer, feedback, and learner-challenge interactions.
- Integration tests cover the renderer-to-main-process contract.
- End-to-end tests cover the critical topic-to-session-summary loop.
- Evaluation fixtures test that the model responds briefly, cites answer evidence, admits uncertainty, and does not leak an explanation too early.

## Boundaries

### Always

- Keep the Electron renderer sandboxed and context-isolated.
- Validate data crossing process, persistence, and model boundaries.
- Preserve learner answers and session history when AI services are unavailable.
- Make model uncertainty and provenance visible.
- Run linting, type checking, tests, formatting, and packaging checks before declaring a task complete.
- Update this specification when product decisions change.

### Ask First

- Add a production dependency.
- Change the local data schema after users could have stored data.
- Add a cloud backend, account system, telemetry, or paid service.
- Send learner content anywhere other than the explicitly selected AI provider.
- Change the foundational desktop or UI framework.

### Never

- Commit secrets, API keys, signing certificates, or learner content.
- Give renderer code unrestricted Node.js or filesystem access.
- Execute remote code inside the desktop application.
- Let the model silently alter a learner answer, evaluation, or evidence record.
- Treat one correct answer as proof of mastery.
- Remove failing tests merely to make verification pass.

## MVP Success Criteria

- A learner can complete the entire topic, question, answer, evaluation, and next-question loop.
- The system asks one question at a time and never reveals a full answer before an attempt unless the learner explicitly requests it.
- Evaluations cite evidence from the learner's answer and can express uncertainty.
- The next question changes meaningfully in response to strong, partial, and mistaken answers.
- A learner can end and later inspect a locally stored session summary.
- Qualitative testing shows the loop uncovers gaps that a conventional explanatory chat leaves hidden.

## Longitudinal Evidence Slice

Evaluated answers now contribute one to four validated concepts, each tied to
an exact learner quote. The local knowledge map combines repeated observations,
uncertainty, and evidence age into a visible knowledge signal. It highlights a
learning frontier without claiming objective mastery. Relationships currently
represent repeated concept co-occurrence; semantic prerequisites remain
deferred until they can be learner-confirmed or otherwise grounded.

## Open Questions

- Which initial subject area gives the clearest evaluation benchmark: conceptual mathematics, model training, or another founder-selected topic?
- What evidence is sufficient for advancing difficulty versus probing the same concept?
- How should the learner challenge or correct a mistaken evaluation?
- Which model provider should power the first constrained experiment?
- When source-grounded sessions arrive, which source types should come first?

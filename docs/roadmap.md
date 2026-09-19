# Strata AI Roadmap

This roadmap orders learning risk before breadth. Each phase should be reviewed before starting the next.

## Phase 0: Baseline

Outcome: a maintainable, packageable Mac desktop shell with no product functionality.

- Electron Forge, TypeScript, and React foundation
- Secure renderer defaults
- Linting, formatting, type checking, and smoke tests
- Product specification, architecture record, and task plan

## Phase 1: First AI Learning Loop

Outcome: a learner can complete a genuine provider-backed question, answer, feedback, and next-question loop. Learner-facing evaluation is never scripted.

- Provider credential storage in the main process
- Topic entry and AI-generated diagnostic question
- Structured evaluation and next-question contract
- Runtime validation and explicit uncertainty
- Evaluation fixtures across strong, partial, mistaken, and ambiguous answers
- Provider failure, retry, and offline behavior
- In-memory session state with immutable submitted answers

Decision gate: verify that evaluations cite the learner's exact answer, remain brief, avoid premature explanations, and expose useful gaps reliably enough for a small founder test set.

## Phase 2: Local Session Persistence

Status: core persistence implemented; backup and export remain follow-up work.

Outcome: the learner can reopen, inspect, and delete local AI learning sessions without depending on a cloud account.

- SQLite persistence with versioned migrations
- Immutable attempts and append-only evaluation history
- Resume and session-history interface
- Transaction, interruption, backup, and export strategy

Decision gate: confirm that acknowledged attempts survive interruption and that local data remains understandable and recoverable.

## Phase 3: Adaptive Questioning

Status: adaptive help and evaluation challenges implemented; session-ending
evidence summaries remain follow-up work.

Outcome: Strata AI keeps a learner at the edge of understanding across a complete session.

- Probe, advance, prerequisite, and hint transitions
- Graduated help ladder (implemented)
- Learner challenge and correction of evaluations (implemented)
- Session-ending evidence and unresolved-gap summary

Decision gate: compare the adaptive loop with an ordinary explanatory chat and test whether it reveals more specific gaps without causing unproductive frustration.

## Phase 4: Retention and Sources

Outcome: learners can return at useful intervals and optionally ground a session in material they chose.

- Revisit queue based on prior answer evidence
- Lightweight retrieval scheduling
- Optional pasted text or document source
- Source-linked questions, corrections, and uncertainty

Decision gate: test whether revisits improve delayed recall and whether sources increase factual trust without turning the product into a reading or note-management app.

## Phase 5: Evidence Graph and Learning Frontier

Status: first evidence-backed graph and frontier slice implemented; semantic
relationships and learning-decision validation remain.

Outcome: longitudinal attempts form a useful model of demonstrated knowledge and reachable next topics.

- Normalized concepts, misconception signals, and exact evidence provenance
  (implemented)
- Learner-visible, uncertainty- and time-aware topic map (implemented)
- Deterministic suggested learning frontier (implemented)
- Learner-confirmed prerequisite and causal relationships
- Validate whether the map improves a real revisit or next-topic decision

Decision gate: retain the graph only if learners use it to choose what to revisit or learn next.

## Deferred Until Validation

- Voice answers and transcription
- Accounts and synchronization
- Collaboration or public sharing
- Mobile applications
- Multiple model providers
- Browser extensions and automatic source capture
- Rich note editing or knowledge-base features
- Marketplace or plugin architecture

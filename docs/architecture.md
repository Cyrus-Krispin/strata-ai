# Strata AI Architecture

Status: First longitudinal evidence-graph slice implemented.

## Decision Summary

Strata AI starts as a local-first Electron desktop application with a React and TypeScript interface. Electron's main process owns privileged operations and outbound model requests. The renderer remains sandboxed and communicates through a narrow preload bridge.

The first AI integration should call a model provider directly and validate structured output. An orchestration framework and graph database are unnecessary until demonstrated complexity requires them.

```text
React renderer
  topic and session setup
  one active question
  answer and feedback
  session evidence
        |
        | typed, task-specific commands
        v
Preload bridge
        |
        v
Electron main process
  session state machine
  local persistence
  model requests and validation
  secure settings
```

## Current Architecture

The first learning slice now implements these boundaries:

- Electron controls the application lifecycle and desktop window.
- React owns the renderer UI.
- Material UI provides the renderer's component primitives, responsive layout,
  and centralized visual theme without an application stylesheet pipeline.
- TypeScript checks both environments.
- Electron Forge packages the application.
- The main process calls DeepSeek V4 Flash and validates structured output.
- A narrow preload API exposes provider status and named session start, submit,
  list, load, end, and delete operations without exposing raw IPC, SQLite, local
  paths, or the provider key.
- The main process owns a versioned SQLite database, validates authoritative
  session state, and atomically stores immutable attempts, evaluations, exact
  evidence, and each proposed next question.
- The renderer owns transient interaction state and hydrates it from persisted
  session records for resume and read-only review.
- A deterministic five-level help ladder and append-only evaluation challenges
  let learners recover when stuck or misjudged without opening unrestricted chat.
- Validated concept annotations grow a local evidence graph inside the same
  transaction as each evaluation; challenges replace the current graph
  contribution for their question.
- A read-only graph snapshot computes uncertainty- and time-aware signals,
  repeated co-occurrence strength, and a deterministic learning frontier.

## Process Responsibilities

### Main process

- application lifecycle and native window management;
- local database ownership and migrations;
- deterministic session transition rules;
- secure storage of provider credentials;
- outbound model requests and runtime response validation;
- validation of every renderer request.

### Preload bridge

- expose only named, typed operations required by the renderer;
- hide raw Electron IPC, filesystem, database, and shell capabilities;
- contain no product, model, or persistence logic.

### Renderer

- start and resume learning sessions;
- display exactly one active question;
- capture learner answers and help requests;
- show concise feedback, uncertainty, evidence, and session summaries;
- never access secrets, the filesystem, a database, or a model provider directly.

## Current Data Model

The implemented SQLite entities are:

- `learning_sessions`: learner-named subject scopes and lifecycle status;
- `questions`: ordered prompts, intent, and parent evaluation provenance;
- `attempts`: immutable learner answers and timestamps;
- `evaluations`: validated judgments, reasons, uncertainty, and next moves;
- `evaluation_evidence`: ordered exact excerpts and findings;
- `schema_migrations`: applied local schema versions.
- `help_requests`: ordered, idempotent graduated-help responses per question;
- `evaluation_challenges`: learner rationales linking prior and revised judgments.

The evidence graph adds:

- `concepts`: normalized concept identity and stable learner-facing labels;
- `concept_evidence`: one current, attributable observation per concept and
  question, linked to the exact evaluation and learner excerpt;
- `concept_edges`: per-question co-occurrence evidence aggregated only when the
  renderer requests a snapshot.

Future entities include optional learner-supplied `sources` and confirmed
semantic relationships. The current graph calls an edge co-occurrence rather
than inventing prerequisite or causal meaning.

## Planned Model Contract

Each model operation should have one narrow purpose and return structured, validated data. The first combined turn may propose:

- an evaluation status and concise reason grounded in the learner's answer;
- concept evidence and an explicit uncertainty level;
- exactly one next move;
- at most one next question or one graduated-help response.

The model cannot alter the learner's answer, mark a topic mastered, or write graph relationships without provenance. Deterministic application rules enforce the help ladder and session state even when model output disagrees.

## Security Defaults

- `contextIsolation` remains enabled.
- Renderer sandboxing remains enabled.
- Node integration remains disabled in the renderer.
- Only packaged local content is executed.
- Navigation and new-window behavior are denied unless explicitly allowed.
- Provider credentials exist transiently in the trusted renderer password field and
  cross only the validated save operation; they are never returned or persisted there.
- Learner content is sent externally only during an explicit learner-started model action.

## Dependency Policy

Add dependencies only when a planned vertical slice requires them. SQLite uses
Electron's built-in `node:sqlite`, so persistence adds no production dependency
or native install script. Voice transcription and graph rendering are deferred.
The application does not need an AI orchestration library.

## Architecture References

- Electron process model: <https://www.electronjs.org/docs/latest/tutorial/process-model>
- Electron security guidance: <https://www.electronjs.org/docs/latest/tutorial/security>
- Electron Forge: <https://www.electronforge.io/>
- React `createRoot`: <https://react.dev/reference/react-dom/client/createRoot>

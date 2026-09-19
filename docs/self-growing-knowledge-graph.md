# Self-Growing Knowledge Graph

Status: Implementation brief

## Objective

Turn Strata AI's immutable learning evidence into a living, local map of what a
learner can explain, where their understanding is fragile, and what concept is
the most useful next frontier. The graph grows only after learner attempts and
never treats exposure, model confidence, or one correct answer as mastery.

## Learner Experience

- Each evaluated answer adds one to four normalized concepts backed by an exact
  quote from the learner's answer.
- Concepts observed in the same answer form an explainable relationship. The
  relationship strengthens when independent answers connect them again.
- A concept's signal blends demonstrated, partial, uncertain, and misconception
  evidence, discounts uncertain judgments, and decays toward "needs review" as
  evidence gets older.
- The map highlights a learning frontier: the least-secure concept connected to
  comparatively stronger knowledge.
- Selecting a node explains the score with evidence count, session count,
  latest observation, and a plain-language recommendation.
- Evaluation challenges replace the graph contribution for that question, so a
  superseded model judgment cannot silently keep influencing the map.

## Model and Data Contract

An evaluation includes `concepts`, each with a concise canonical label, a
concept-specific assessment, and an ordinal pointing at one exact evidence
quote. Model output is validated before persistence.

SQLite migration 4 adds:

- `concepts`: canonical identity and learner-facing label;
- `concept_evidence`: the current, attributable observation per concept and
  question;
- `concept_edges`: current co-occurrence evidence per concept pair and question.

The renderer receives only an aggregated `KnowledgeGraphSnapshot` through a
named, read-only IPC operation. It never receives database access.

## Commands

- Focused tests: `npm test -- tests/knowledge-graph.test.mjs`
- Full tests: `npm test`
- Typecheck: `npm run typecheck`
- Lint: `npm run lint`
- Format check: `npm run format:check`
- Package: `npm run package`

## Project Structure

- `src/learning/knowledgeGraph.ts`: public graph types and pure scoring rules
- `src/main/persistence/knowledgeGraphRepository.ts`: graph ingestion and query
- `src/components/KnowledgeGraphView.tsx`: accessible map and evidence panel
- `tests/knowledge-graph.test.mjs`: scoring, growth, revision, and frontier tests

## Testing Strategy

Pure scoring tests cover decay and signal labels. In-memory SQLite integration
tests prove growth, normalization, relationship reinforcement, challenged
evaluation replacement, and frontier selection. Existing contract, IPC,
service, migration, and package tests guard the surrounding application.

## Boundaries

### Always

- Preserve exact evidence and provenance for every graph claim.
- Keep graph generation deterministic after validated provider output.
- Make uncertainty and time decay visible; call the score a signal, not mastery.
- Remain local-first and dependency-free.

### Ask first

- Add a graph database, cloud synchronization, telemetry, or a new model call.
- Let learners manually merge concepts or confirm semantic edge types.

### Never

- Infer knowledge from session creation, content exposure, or help requests.
- Hide superseded evidence after an evaluation challenge.
- Send graph history to the model or another service without explicit consent.

## Success Criteria

- A valid evaluated answer grows the graph atomically with the session record.
- Repeated concepts normalize to one node and repeated relationships strengthen.
- Challenging an evaluation replaces, rather than duplicates, its graph impact.
- Scores are explainable, time-aware, and never presented as certainty.
- The home screen exposes a keyboard-accessible, responsive map with a useful
  empty state and evidence detail.
- All repository verification commands pass.

## Deferred

Semantic prerequisite/causal edge types, manual concept merging, source nodes,
graph editing, cloud sync, and graph-assisted prompt retrieval remain future
work. Co-occurrence is deliberately honest for this first slice.

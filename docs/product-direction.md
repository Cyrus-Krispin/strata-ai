# Strata AI Product Direction

Status: Accepted direction; adaptive loop and first evidence graph implemented

## Thesis

AI tutoring often creates the feeling of understanding by explaining too much, too early. Strata AI takes the opposite position: learning begins with an attempt.

Strata AI is an adaptive Socratic learning partner. A learner can begin with any topic, optionally attach a source, and answer one question at a time. The system uses each answer to locate the boundary between demonstrated understanding and the next reachable challenge.

**Product promise:** Find the edge of what you know, then take one step beyond it.

## Core Loop

1. The learner names a topic and may add source material.
2. Strata AI asks one diagnostic question.
3. The learner answers in their own words.
4. Strata AI evaluates the evidence in the answer and briefly identifies what is sound, incomplete, uncertain, or mistaken.
5. Strata AI chooses the next action: probe, increase difficulty, revisit a prerequisite, or offer a small amount of help.
6. The session ends with a compact account of demonstrated knowledge, unresolved gaps, and useful next questions.

The learner can request help through a controlled ladder: rephrase the question, break it into a smaller question, offer a hint, show a partial example, and only then explain directly when requested.

## Why This Direction

- Retrieval and explanation expose understanding more reliably than passive recognition.
- Immediate, specific feedback can correct errors without replacing the learner's reasoning.
- Difficulty can stay near the learner's current capability instead of following a fixed deck or curriculum.
- A history of answers supplies better evidence for a future knowledge graph than AI-generated summaries or self-reported confidence.

## Rejected Centers of Gravity

- **Notes-first workspace:** writing may remain an optional input, but maintaining documents is not the primary learning loop.
- **Static flashcard system:** repeated recall is useful, but fixed cards do not adapt deeply enough to the reasoning shown in an answer.
- **General chatbot:** open-ended conversation makes it too easy for the model to lecture, complete the work, or imply mastery.
- **Knowledge graph as the initial UI:** the graph should emerge from evidence over time and serve learning decisions, not become decorative organization.

## Emerging Long-Term Shape

Each answer can create evidence about concepts, relationships, misconceptions, and prerequisites. Over time, Strata AI can build a learner-specific evidence graph that supports retention reviews, topic audits, and recommendations at the learning frontier. Early versions can model this with ordinary relational tables; a graph database is not required.

The first slice now records concept-specific evidence, repeated co-occurrence,
time-aware knowledge signals, and an explainable frontier in ordinary SQLite.
Prerequisite meaning remains deliberately unclaimed until stronger evidence or
learner confirmation exists.

## Guardrails

- No answer dump before a genuine learner attempt.
- No hidden continuous monitoring; model actions are explicit within a learner-started session.
- No unsupported claim that a learner has mastered a topic.
- No fake precision such as an unexplained mastery percentage.
- Model judgments remain provisional, attributable, and open to challenge.
- Sources are optional for starting, but factual correction should expose uncertainty when no reliable reference is available.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  layoutKnowledgeGraph,
  normalizeConceptName,
  scoreKnowledgeSignal,
} from '../src/learning/knowledgeGraph.ts';
import { openLearningDatabase } from '../src/main/persistence/database.ts';
import { KnowledgeGraphRepository } from '../src/main/persistence/knowledgeGraphRepository.ts';
import { LearningSessionRepository } from '../src/main/persistence/sessionRepository.ts';

const question = {
  question: 'Why do database indexes speed up reads?',
  intent: 'Tests whether the learner understands indexed lookup tradeoffs.',
};

const evaluation = {
  status: 'partial',
  evidence: [
    {
      excerpt: 'avoid scanning every row',
      finding: 'Identifies the main lookup advantage.',
    },
    {
      excerpt: 'tree narrows the search',
      finding: 'Connects a tree structure to a smaller search space.',
    },
  ],
  concepts: [
    {
      name: 'Database indexes',
      assessment: 'partial',
      evidenceOrdinal: 0,
    },
    {
      name: 'B-tree search',
      assessment: 'demonstrated',
      evidenceOrdinal: 1,
    },
  ],
  unresolvedGap: 'The write and storage costs are not yet explained.',
  uncertainty: 'low',
  proposedNextMove: 'probe',
  nextQuestion: 'What costs does an index add to writes?',
  nextQuestionRationale: 'Probes the missing tradeoff in the answer.',
};

function setup() {
  const database = openLearningDatabase(':memory:');
  let id = 0;
  let minute = 0;
  const options = {
    createId: () => `00000000-0000-4000-8000-${String(++id).padStart(12, '0')}`,
    now: () => new Date(Date.UTC(2026, 8, 1, 0, minute++)).toISOString(),
  };
  return {
    database,
    sessions: new LearningSessionRepository(database, options),
    graph: new KnowledgeGraphRepository(database),
  };
}

test('normalizes equivalent concept labels without erasing meaningful words', () => {
  assert.equal(normalizeConceptName('  B-Tree   Search! '), 'b tree search');
  assert.equal(normalizeConceptName('Gradient descent'), 'gradient descent');
});

test('knowledge signal discounts uncertainty and stale evidence', () => {
  const now = new Date('2026-09-01T00:00:00.000Z');
  const fresh = scoreKnowledgeSignal(
    [
      {
        status: 'demonstrated',
        uncertainty: 'low',
        observedAt: '2026-08-31T00:00:00.000Z',
      },
    ],
    now,
  );
  const stale = scoreKnowledgeSignal(
    [
      {
        status: 'demonstrated',
        uncertainty: 'high',
        observedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    now,
  );

  assert.ok(fresh.score > stale.score);
  assert.equal(fresh.state, 'strong');
  assert.notEqual(stale.state, 'strong');
});

test('lays out graph nodes deterministically inside the visual canvas', () => {
  const nodes = ['alpha', 'beta', 'gamma'].map((id, index) => ({
    id,
    label: id,
    signal: 0.3 + index * 0.2,
    state: 'developing',
    trend: 'steady',
    evidenceCount: 1,
    sessionCount: 1,
    lastSeenAt: '2026-09-01T00:00:00.000Z',
    latestEvidence: {},
  }));
  const edges = [
    {
      source: 'alpha',
      target: 'beta',
      evidenceCount: 1,
      sessionCount: 1,
      strength: 0.5,
    },
  ];

  const first = layoutKnowledgeGraph(nodes, edges);
  const second = layoutKnowledgeGraph(nodes, edges);

  assert.deepEqual(first, second);
  assert.equal(first.length, 3);
  assert.ok(first.every(({ x }) => x >= 50 && x <= 850));
  assert.ok(first.every(({ y }) => y >= 50 && y <= 510));
});

test('grows concepts and explainable relationships from evaluated attempts', () => {
  const { database, sessions, graph } = setup();
  const session = sessions.createSession('Database indexes', question);

  sessions.recordEvaluation({
    sessionId: session.id,
    questionId: session.currentQuestionId,
    answer:
      'Indexes avoid scanning every row because a tree narrows the search.',
    evaluation,
  });
  const snapshot = graph.getSnapshot({
    now: new Date('2026-09-01T01:00:00.000Z'),
  });

  assert.equal(snapshot.nodes.length, 2);
  assert.equal(snapshot.edges.length, 1);
  assert.equal(snapshot.edges[0].evidenceCount, 1);
  assert.equal(snapshot.stats.observations, 2);
  assert.equal(
    snapshot.nodes.find((node) => node.label === 'Database indexes')
      .latestEvidence.excerpt,
    'avoid scanning every row',
  );
  assert.equal(snapshot.frontier.conceptId.length > 0, true);

  const bounded = graph.getSnapshot({ limit: 1 });
  assert.equal(bounded.nodes.length, 1);
  assert.equal(bounded.stats.concepts, 2);
  assert.equal(bounded.stats.observations, 2);
  database.close();
});

test('merges normalized labels and strengthens repeated relationships', () => {
  const { database, sessions, graph } = setup();
  for (const [index, topic] of [
    'Database indexes',
    'Query planning',
  ].entries()) {
    const session = sessions.createSession(topic, question);
    sessions.recordEvaluation({
      sessionId: session.id,
      questionId: session.currentQuestionId,
      answer:
        'Indexes avoid scanning every row because a tree narrows the search.',
      evaluation: {
        ...evaluation,
        concepts: [
          {
            ...evaluation.concepts[0],
            name: index === 0 ? 'Database indexes' : ' database INDEXES ',
          },
          evaluation.concepts[1],
        ],
      },
    });
  }

  const snapshot = graph.getSnapshot();
  assert.equal(snapshot.nodes.length, 2);
  assert.equal(snapshot.edges[0].evidenceCount, 2);
  assert.equal(snapshot.edges[0].sessionCount, 2);
  assert.equal(
    snapshot.nodes.find((node) => node.label === 'Database indexes')
      .evidenceCount,
    2,
  );
  database.close();
});

test('replaces graph contributions when an evaluation is challenged', () => {
  const { database, sessions, graph } = setup();
  const session = sessions.createSession('Database indexes', question);
  const saved = sessions.recordEvaluation({
    sessionId: session.id,
    questionId: session.currentQuestionId,
    answer:
      'Indexes avoid scanning every row because a tree narrows the search.',
    evaluation,
  });
  const revised = {
    ...evaluation,
    status: 'demonstrated',
    concepts: [
      {
        name: 'Index lookup',
        assessment: 'demonstrated',
        evidenceOrdinal: 0,
      },
    ],
  };

  sessions.recordChallenge({
    requestId: '00000000-0000-4000-8000-000000000099',
    sessionId: session.id,
    questionId: session.currentQuestionId,
    evaluationId: saved.turns[0].evaluationHistory[0].id,
    rationale: 'The answer explains the lookup behavior precisely.',
    evaluation: revised,
  });
  const snapshot = graph.getSnapshot();

  assert.deepEqual(
    snapshot.nodes.map((node) => node.label),
    ['Index lookup'],
  );
  assert.equal(snapshot.edges.length, 0);
  assert.equal(snapshot.nodes[0].latestEvidence.status, 'demonstrated');
  assert.equal(
    database.prepare('SELECT COUNT(*) AS count FROM concepts').get().count,
    1,
  );

  sessions.deleteSession(session.id);
  assert.equal(
    database.prepare('SELECT COUNT(*) AS count FROM concepts').get().count,
    0,
  );
  database.close();
});

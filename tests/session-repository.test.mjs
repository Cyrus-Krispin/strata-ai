import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { chmodSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  migrateLearningDatabase,
  openLearningDatabase,
  verifyLearningDatabase,
} from '../src/main/persistence/database.ts';
import { LearningSessionRepository } from '../src/main/persistence/sessionRepository.ts';

const diagnosticQuestion = {
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
  ],
  concepts: [
    {
      name: 'Database indexes',
      assessment: 'partial',
      evidenceOrdinal: 0,
    },
  ],
  unresolvedGap: 'The write and storage costs are not yet explained.',
  uncertainty: 'low',
  proposedNextMove: 'probe',
  nextQuestion: 'What costs does an index add to writes?',
  nextQuestionRationale: 'Probes the missing tradeoff in the answer.',
};

function createRepository() {
  const database = openLearningDatabase(':memory:');
  let id = 0;
  let time = 0;
  const repository = new LearningSessionRepository(database, {
    createId: () => `00000000-0000-4000-8000-${String(++id).padStart(12, '0')}`,
    now: () => new Date(Date.UTC(2026, 7, 30, 0, 0, time++)).toISOString(),
  });
  return { database, repository };
}

test('opens a migrated database with safety pragmas enabled', () => {
  const { database } = createRepository();

  const migration = database
    .prepare('SELECT MAX(version) AS version FROM schema_migrations')
    .get();
  const foreignKeys = database.prepare('PRAGMA foreign_keys').get();

  assert.equal(migration.version, 3);
  assert.equal(foreignKeys.foreign_keys, 1);
  database.close();
});

test('repairs private permissions for the database directory and WAL files', () => {
  const directory = mkdtempSync(join(tmpdir(), 'strata-database-test-'));
  chmodSync(directory, 0o777);
  const path = join(directory, 'strata-ai.sqlite3');
  const database = openLearningDatabase(path);

  assert.equal(statSync(directory).mode & 0o777, 0o700);
  for (const candidate of [path, `${path}-wal`, `${path}-shm`]) {
    assert.equal(statSync(candidate).mode & 0o777, 0o600);
  }

  database.close();
  rmSync(directory, { recursive: true });
});

test('migrates a version-1 database without rewriting existing sessions', () => {
  const database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL) STRICT;
    INSERT INTO schema_migrations VALUES (1, '2026-08-30T00:00:00.000Z');
    CREATE TABLE learning_sessions (id TEXT PRIMARY KEY) STRICT;
    CREATE TABLE questions (id TEXT PRIMARY KEY) STRICT;
    CREATE TABLE evaluations (id TEXT PRIMARY KEY) STRICT;
    INSERT INTO learning_sessions VALUES ('existing-session');
  `);

  migrateLearningDatabase(database);

  assert.equal(
    database
      .prepare('SELECT MAX(version) AS version FROM schema_migrations')
      .get().version,
    3,
  );
  assert.equal(
    database.prepare('SELECT id FROM learning_sessions').get().id,
    'existing-session',
  );
  assert.ok(
    database
      .prepare("SELECT name FROM sqlite_master WHERE name = 'help_requests'")
      .get(),
  );
  assert.ok(
    database.prepare("SELECT name FROM sqlite_master WHERE name = 'concepts'").get(),
  );
  assert.ok(
    database
      .prepare(
        "SELECT name FROM sqlite_master WHERE name = 'evaluation_challenges'",
      )
      .get(),
  );
  database.close();
});

test('rejects gapped and newer migration histories', () => {
  for (const versions of [[2], [1, 2, 3, 4]]) {
    const database = new DatabaseSync(':memory:');
    database.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      ) STRICT;
    `);
    const insert = database.prepare(
      'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
    );
    versions.forEach((version) =>
      insert.run(version, '2026-08-31T00:00:00.000Z'),
    );

    assert.throws(
      () => migrateLearningDatabase(database),
      /unsupported migration history/i,
    );
    database.close();
  }
});

test('rejects foreign-key corruption during verification', () => {
  const database = openLearningDatabase(':memory:');
  database.exec('PRAGMA foreign_keys = OFF');
  database
    .prepare(
      `INSERT INTO questions
        (id, session_id, turn_number, prompt, intent, parent_evaluation_id, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?)`,
    )
    .run(
      crypto.randomUUID(),
      crypto.randomUUID(),
      1,
      'Why do indexes help lookups?',
      'Checks the learner understanding of indexed access.',
      new Date().toISOString(),
    );

  assert.throws(
    () => verifyLearningDatabase(database),
    /invalid relationships/i,
  );
  database.close();
});

test('creates and reloads an active session at its current question', () => {
  const { database, repository } = createRepository();

  const created = repository.createSession(
    '  Database indexes  ',
    diagnosticQuestion,
  );
  const reloaded = repository.getSession(created.id);

  assert.equal(created.topic, 'Database indexes');
  assert.equal(created.status, 'active');
  assert.equal(created.currentQuestionId, created.turns[0].questionId);
  assert.deepEqual(reloaded, created);
  assert.deepEqual(created.turns[0], {
    questionId: created.currentQuestionId,
    turn: 1,
    question: diagnosticQuestion.question,
    intent: diagnosticQuestion.intent,
    answer: null,
    evaluation: null,
    evaluationHistory: [],
    help: [],
  });
  database.close();
});

test('persists ordered help and replays an acknowledged request id', () => {
  const { database, repository } = createRepository();
  const session = repository.createSession(
    'Database indexes',
    diagnosticQuestion,
  );
  const input = {
    requestId: '00000000-0000-4000-8000-000000000090',
    sessionId: session.id,
    questionId: session.currentQuestionId,
    response: {
      level: 'hint',
      content: 'Focus on how the lookup avoids visiting every row.',
    },
  };

  const first = repository.recordHelp(input);
  const retry = repository.recordHelp(input);

  assert.deepEqual(retry, first);
  assert.equal(first.turns[0].help.length, 1);
  assert.equal(first.turns[0].help[0].level, 'hint');
  assert.equal(
    database.prepare('SELECT COUNT(*) AS count FROM help_requests').get().count,
    1,
  );
  database.close();
});

test('appends a challenge revision and updates only the unanswered child question', () => {
  const { database, repository } = createRepository();
  const session = repository.createSession(
    'Database indexes',
    diagnosticQuestion,
  );
  const evaluated = repository.recordEvaluation({
    sessionId: session.id,
    questionId: session.currentQuestionId,
    answer: 'They avoid scanning every row for each lookup.',
    evaluation,
  });
  const challengedEvaluationId = evaluated.turns[0].evaluationHistory[0].id;
  const revised = {
    ...evaluation,
    status: 'demonstrated',
    proposedNextMove: 'advance',
    nextQuestion: 'How can an index slow down a write?',
    nextQuestionRationale: 'Advances to the write-side tradeoff.',
  };

  const saved = repository.recordChallenge({
    requestId: '00000000-0000-4000-8000-000000000091',
    sessionId: session.id,
    questionId: session.currentQuestionId,
    evaluationId: challengedEvaluationId,
    rationale: 'My answer identified the avoided scan.',
    evaluation: revised,
  });

  assert.equal(saved.turns[0].evaluation.status, 'demonstrated');
  assert.equal(saved.turns[0].evaluationHistory.length, 2);
  assert.equal(
    saved.turns[0].evaluationHistory[1].challengeRationale,
    'My answer identified the avoided scan.',
  );
  assert.equal(saved.turns[1].question, revised.nextQuestion);
  assert.equal(
    saved.turns[0].evaluationHistory[0].evaluation.nextQuestion,
    evaluation.nextQuestion,
  );
  assert.deepEqual(repository.listSessions(1)[0].evaluationCounts, {
    demonstrated: 1,
    partial: 0,
    misconception: 0,
    uncertain: 0,
  });
  database.close();
});

test('reloads help and challenge provenance after a database restart', () => {
  const directory = mkdtempSync(join(tmpdir(), 'strata-adaptive-'));
  const path = join(directory, 'learning.sqlite3');
  let database = openLearningDatabase(path);
  let repository = new LearningSessionRepository(database);
  const session = repository.createSession(
    'Database indexes',
    diagnosticQuestion,
  );
  repository.recordHelp({
    requestId: crypto.randomUUID(),
    sessionId: session.id,
    questionId: session.currentQuestionId,
    response: {
      level: 'rephrase',
      content: 'Which lookup structure narrows the rows to inspect?',
    },
  });
  const evaluated = repository.recordEvaluation({
    sessionId: session.id,
    questionId: session.currentQuestionId,
    answer: 'They avoid scanning every row for each lookup.',
    evaluation,
  });
  repository.recordChallenge({
    requestId: crypto.randomUUID(),
    sessionId: session.id,
    questionId: session.currentQuestionId,
    evaluationId: evaluated.turns[0].evaluationHistory[0].id,
    rationale: 'The answer identifies the avoided scan.',
    evaluation: { ...evaluation, status: 'demonstrated' },
  });
  database.close();

  database = openLearningDatabase(path);
  repository = new LearningSessionRepository(database);
  const reloaded = repository.getSession(session.id);

  assert.equal(reloaded.turns[0].help.length, 1);
  assert.equal(reloaded.turns[0].evaluationHistory.length, 2);
  assert.equal(
    reloaded.turns[0].evaluationHistory[1].challengeRationale,
    'The answer identifies the avoided scan.',
  );
  database.close();
  rmSync(directory, { recursive: true });
});

test('atomically records immutable evidence and advances the current question', () => {
  const { database, repository } = createRepository();
  const session = repository.createSession(
    'Database indexes',
    diagnosticQuestion,
  );

  const saved = repository.recordEvaluation({
    sessionId: session.id,
    questionId: session.currentQuestionId,
    answer: 'They avoid scanning every row for each lookup.',
    evaluation,
  });

  assert.equal(saved.turns.length, 2);
  assert.equal(saved.currentQuestionId, saved.turns[1].questionId);
  assert.equal(saved.pendingFeedbackQuestionId, saved.turns[0].questionId);
  assert.equal(
    saved.turns[0].answer,
    'They avoid scanning every row for each lookup.',
  );
  assert.deepEqual(saved.turns[0].evaluation, evaluation);
  assert.equal(saved.turns[1].question, evaluation.nextQuestion);
  assert.equal(saved.turns[1].intent, evaluation.nextQuestionRationale);

  assert.throws(
    () =>
      repository.recordEvaluation({
        sessionId: session.id,
        questionId: session.currentQuestionId,
        answer: 'A different answer must not overwrite history.',
        evaluation,
      }),
    /already has a different acknowledged answer/u,
  );
  database.close();
});

test('keeps evaluated feedback pending across reload until it is acknowledged', () => {
  const { database, repository } = createRepository();
  const session = repository.createSession(
    'Database indexes',
    diagnosticQuestion,
  );

  const evaluated = repository.recordEvaluation({
    sessionId: session.id,
    questionId: session.currentQuestionId,
    answer: 'They avoid scanning every row for each lookup.',
    evaluation,
  });
  const reloaded = repository.getSession(session.id);

  assert.equal(
    reloaded.pendingFeedbackQuestionId,
    evaluated.turns[0].questionId,
  );
  assert.equal(reloaded.currentQuestionId, evaluated.turns[1].questionId);

  const acknowledged = repository.acknowledgeFeedback(
    session.id,
    evaluated.turns[0].questionId,
  );
  const replayed = repository.acknowledgeFeedback(
    session.id,
    evaluated.turns[0].questionId,
  );

  assert.equal(acknowledged.pendingFeedbackQuestionId, null);
  assert.equal(acknowledged.currentQuestionId, evaluated.turns[1].questionId);
  assert.deepEqual(replayed, acknowledged);
  database.close();
});

test('returns the saved result when an acknowledged submission is retried', () => {
  const { database, repository } = createRepository();
  const session = repository.createSession(
    'Database indexes',
    diagnosticQuestion,
  );
  const input = {
    sessionId: session.id,
    questionId: session.currentQuestionId,
    answer: 'They avoid scanning every row for each lookup.',
    evaluation,
  };

  const first = repository.recordEvaluation(input);
  const retry = repository.recordEvaluation(input);
  const attemptCount = database
    .prepare('SELECT COUNT(*) AS count FROM attempts')
    .get();

  assert.deepEqual(retry, first);
  assert.equal(attemptCount.count, 1);
  database.close();
});

test('ends without changing history, clears pending feedback, and rejects later submissions', () => {
  const { database, repository } = createRepository();
  const session = repository.createSession(
    'Database indexes',
    diagnosticQuestion,
  );

  const ended = repository.endSession(session.id);

  assert.equal(ended.status, 'ended');
  assert.equal(ended.pendingFeedbackQuestionId, null);
  assert.ok(ended.endedAt);
  assert.throws(
    () =>
      repository.recordEvaluation({
        sessionId: session.id,
        questionId: session.currentQuestionId,
        answer: 'They avoid scanning every row for each lookup.',
        evaluation,
      }),
    /not active/u,
  );
  database.close();
});

test('lists evidence-based summaries and deletes only the selected session', () => {
  const { database, repository } = createRepository();
  const first = repository.createSession(
    'Database indexes',
    diagnosticQuestion,
  );
  repository.recordEvaluation({
    sessionId: first.id,
    questionId: first.currentQuestionId,
    answer: 'They avoid scanning every row for each lookup.',
    evaluation,
  });
  const second = repository.createSession('Neural networks', {
    question: 'What role does a loss function play?',
    intent: 'Tests whether the learner can connect loss to optimization.',
  });

  const summaries = repository.listSessions(10);

  assert.equal(summaries.length, 2);
  assert.equal(summaries[0].id, second.id);
  assert.deepEqual(summaries[1].evaluationCounts, {
    demonstrated: 0,
    partial: 1,
    misconception: 0,
    uncertain: 0,
  });
  assert.equal(summaries[1].answeredTurns, 1);
  assert.equal(summaries[1].totalQuestions, 2);

  assert.equal(repository.deleteSession(first.id), true);
  assert.equal(repository.getSession(first.id), null);
  assert.ok(repository.getSession(second.id));
  assert.equal(
    database.prepare('SELECT COUNT(*) AS count FROM attempts').get().count,
    0,
  );
  database.close();
});

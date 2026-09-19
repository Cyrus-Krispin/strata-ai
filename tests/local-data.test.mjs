import assert from 'node:assert/strict';
import {
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  learningBackupFormat,
  learningBackupFormatVersion,
  learningBackupSchema,
  toLocalDataSession,
} from '../src/learning/localData.ts';
import {
  readLearningBackup,
  writeLearningBackup,
} from '../src/main/localDataFileService.ts';
import { openLearningDatabase } from '../src/main/persistence/database.ts';
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
  ],
  concepts: [
    {
      name: 'Index lookup',
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

function populatedRepository() {
  const database = openLearningDatabase(':memory:');
  const repository = new LearningSessionRepository(database);
  const session = repository.createSession('Database indexes', question);
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
    answer: 'Indexes avoid scanning every row.',
    evaluation,
  });
  repository.recordChallenge({
    requestId: crypto.randomUUID(),
    sessionId: session.id,
    questionId: session.currentQuestionId,
    evaluationId: evaluated.turns[0].evaluationHistory[0].id,
    rationale: 'My answer named the avoided scan.',
    evaluation: { ...evaluation, status: 'demonstrated' },
  });
  return { database, repository };
}

test('validates and restores complete learning provenance without credentials', () => {
  const source = populatedRepository();
  const sessions = source.repository.listAllSessions().map(toLocalDataSession);
  const backup = learningBackupSchema.parse({
    format: learningBackupFormat,
    formatVersion: learningBackupFormatVersion,
    appVersion: '0.1.0',
    createdAt: new Date().toISOString(),
    sessions,
  });
  assert.doesNotMatch(JSON.stringify(backup), /requestId|apiKey|filePath/);

  const targetDatabase = openLearningDatabase(':memory:');
  const target = new LearningSessionRepository(targetDatabase);
  assert.deepEqual(target.importSessions(backup.sessions), {
    imported: 1,
    skipped: 0,
  });
  assert.deepEqual(
    target.listAllSessions().map(toLocalDataSession),
    backup.sessions,
  );
  assert.deepEqual(target.importSessions(backup.sessions), {
    imported: 0,
    skipped: 1,
  });

  targetDatabase.close();
  source.database.close();
});

test('round-trips a session ended while feedback was awaiting acknowledgement', () => {
  const source = populatedRepository();
  const active = source.repository.listAllSessions()[0];
  assert.ok(active.pendingFeedbackQuestionId);
  const ended = source.repository.endSession(active.id);
  assert.equal(ended.pendingFeedbackQuestionId, null);

  const sessions = learningBackupSchema.parse({
    format: learningBackupFormat,
    formatVersion: learningBackupFormatVersion,
    appVersion: '0.1.0',
    createdAt: new Date().toISOString(),
    sessions: [toLocalDataSession(ended)],
  }).sessions;
  const targetDatabase = openLearningDatabase(':memory:');
  const target = new LearningSessionRepository(targetDatabase);
  assert.deepEqual(target.importSessions(sessions), {
    imported: 1,
    skipped: 0,
  });
  assert.deepEqual(target.listAllSessions().map(toLocalDataSession), sessions);

  targetDatabase.close();
  source.database.close();
});

test('keeps version-1 backups from before graph annotations restorable', () => {
  const source = populatedRepository();
  const session = toLocalDataSession(source.repository.listAllSessions()[0]);
  for (const turn of session.turns) {
    if (turn.evaluation) delete turn.evaluation.concepts;
    for (const revision of turn.evaluationHistory) {
      delete revision.evaluation.concepts;
    }
  }

  const backup = learningBackupSchema.parse({
    format: learningBackupFormat,
    formatVersion: 1,
    appVersion: '0.1.0',
    createdAt: new Date().toISOString(),
    sessions: [session],
  });

  assert.deepEqual(backup.sessions[0].turns[0].evaluation.concepts, []);
  assert.deepEqual(
    backup.sessions[0].turns[0].evaluationHistory[0].evaluation.concepts,
    [],
  );
  source.database.close();
});

test('rejects backups that violate generated-learning provenance', () => {
  const source = populatedRepository();
  const session = toLocalDataSession(source.repository.listAllSessions()[0]);
  const parse = (candidate) =>
    learningBackupSchema.safeParse({
      format: learningBackupFormat,
      formatVersion: learningBackupFormatVersion,
      appVersion: '0.1.0',
      createdAt: new Date().toISOString(),
      sessions: [candidate],
    });

  const noEvidence = structuredClone(session);
  noEvidence.turns[0].evaluation.evidence = [];
  noEvidence.turns[0].evaluationHistory.at(-1).evaluation.evidence = [];
  assert.equal(parse(noEvidence).success, false);

  const fabricatedEvidence = structuredClone(session);
  fabricatedEvidence.turns[0].evaluation.evidence[0].excerpt =
    'fabricated quote';
  fabricatedEvidence.turns[0].evaluationHistory.at(
    -1,
  ).evaluation.evidence[0].excerpt = 'fabricated quote';
  assert.equal(parse(fabricatedEvidence).success, false);

  const malformedQuestion = structuredClone(session);
  malformedQuestion.turns[0].question = 'This is not a question';
  assert.equal(parse(malformedQuestion).success, false);

  const invalidHelp = structuredClone(session);
  invalidHelp.turns[0].help[0].content = 'This rephrase is not a question';
  assert.equal(parse(invalidHelp).success, false);

  const brokenCausality = structuredClone(session);
  brokenCausality.turns[1].intent =
    'A different but otherwise valid diagnostic intention.';
  assert.equal(parse(brokenCausality).success, false);

  const stalePending = structuredClone(session);
  stalePending.pendingFeedbackQuestionId = stalePending.turns[0].questionId;
  stalePending.turns.push({
    ...structuredClone(stalePending.turns.at(-1)),
    questionId: crypto.randomUUID(),
    turn: 3,
  });
  stalePending.currentQuestionId = stalePending.turns.at(-1).questionId;
  assert.equal(parse(stalePending).success, false);

  const answeredCurrent = structuredClone(session);
  answeredCurrent.turns = [answeredCurrent.turns[0]];
  answeredCurrent.currentQuestionId = answeredCurrent.turns[0].questionId;
  answeredCurrent.pendingFeedbackQuestionId = null;
  assert.equal(parse(answeredCurrent).success, false);

  const skippedHelpLevel = structuredClone(session);
  skippedHelpLevel.turns[0].help[0].level = 'hint';
  assert.equal(parse(skippedHelpLevel).success, false);

  source.database.close();
});

test('rejects a conflicting session without changing current history', () => {
  const source = populatedRepository();
  const sessions = source.repository.listAllSessions().map(toLocalDataSession);
  const targetDatabase = openLearningDatabase(':memory:');
  const target = new LearningSessionRepository(targetDatabase);
  target.importSessions(sessions);

  assert.throws(
    () =>
      target.importSessions([{ ...sessions[0], topic: 'Conflicting topic' }]),
    /conflicts with current local history/i,
  );
  assert.deepEqual(target.listAllSessions().map(toLocalDataSession), sessions);

  targetDatabase.close();
  source.database.close();
});

test('writes owner-private backups atomically and rejects invalid files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'strata-backup-test-'));
  const path = join(directory, 'learning.strata-backup.json');
  const backup = learningBackupSchema.parse({
    format: learningBackupFormat,
    formatVersion: learningBackupFormatVersion,
    appVersion: '0.1.0',
    createdAt: new Date().toISOString(),
    sessions: [],
  });

  await writeLearningBackup(path, backup);
  assert.deepEqual(await readLearningBackup(path), backup);
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  assert.match(await readFile(path, 'utf8'), /strata-ai-learning-backup/);

  await assert.rejects(
    writeLearningBackup(join(directory, 'invalid.json'), {
      ...backup,
      appVersion: 'invalid',
    }),
  );
  await assert.rejects(stat(join(directory, 'invalid.json')), {
    code: 'ENOENT',
  });

  await writeFile(path, '{"format":"wrong"}', 'utf8');
  await assert.rejects(readLearningBackup(path));
  const linkedPath = join(directory, 'linked-backup.json');
  await symlink(path, linkedPath);
  await assert.rejects(readLearningBackup(linkedPath), /regular file/i);
  await rm(directory, { recursive: true });
});

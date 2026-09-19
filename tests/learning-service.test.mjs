import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getHelpPolicy,
  maximumHelpResponses,
} from '../src/learning/helpPolicy.ts';
import { LearningService } from '../src/main/learningService.ts';
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

test('help policy reserves a final direct explanation after all repeats', () => {
  const repeatedEarlierLevels = [
    'rephrase',
    'rephrase',
    'smaller_question',
    'smaller_question',
    'hint',
    'hint',
    'partial_example',
    'partial_example',
  ].map((level) => ({ level }));

  const beforeDirectExplanation = getHelpPolicy(repeatedEarlierLevels);
  assert.equal(maximumHelpResponses, 9);
  assert.equal(beforeDirectExplanation.next, 'direct_explanation');
  assert.equal(beforeDirectExplanation.canAdvance, true);
  assert.equal(beforeDirectExplanation.terminal, false);

  const afterDirectExplanation = getHelpPolicy([
    ...repeatedEarlierLevels,
    { level: 'direct_explanation' },
  ]);
  assert.equal(afterDirectExplanation.canRepeat, false);
  assert.equal(afterDirectExplanation.canAdvance, false);
  assert.equal(afterDirectExplanation.terminal, true);
});

function setup() {
  const database = openLearningDatabase(':memory:');
  const repository = new LearningSessionRepository(database);
  const calls = {
    questions: 0,
    evaluations: 0,
    help: 0,
    challenges: 0,
    contexts: [],
  };
  const provider = {
    async createDiagnosticQuestion() {
      calls.questions += 1;
      return question;
    },
    async evaluateAttempt(context) {
      calls.evaluations += 1;
      calls.contexts.push(context);
      return evaluation;
    },
    async createHelpResponse(context) {
      calls.help += 1;
      return {
        level: context.level,
        content: 'What lookup structure can avoid visiting every row?',
      };
    },
    async reconsiderEvaluation() {
      calls.challenges += 1;
      return {
        ...evaluation,
        status: 'demonstrated',
        proposedNextMove: 'advance',
      };
    },
  };
  const service = new LearningService(repository, () => provider);
  return { calls, database, repository, service };
}

test('starts only after a diagnostic question succeeds', async () => {
  const { calls, database, service } = setup();

  const session = await service.startSession('Database indexes');

  assert.equal(calls.questions, 1);
  assert.equal(session.topic, 'Database indexes');
  assert.equal(service.listSessions(20).length, 1);
  database.close();
});

test('enforces and persists graduated help with idempotent request ids', async () => {
  const { calls, database, service } = setup();
  const session = await service.startSession('Database indexes');
  const input = {
    requestId: crypto.randomUUID(),
    sessionId: session.id,
    questionId: session.currentQuestionId,
    level: 'rephrase',
  };

  const saved = await service.requestHelp(input);
  await service.requestHelp(input);

  assert.equal(calls.help, 1);
  assert.equal(saved.turns[0].help[0].level, 'rephrase');
  await assert.rejects(
    service.requestHelp({
      ...input,
      requestId: crypto.randomUUID(),
      level: 'hint',
    }),
    /help level is not available/i,
  );
  let current = saved;
  for (const level of [
    'smaller_question',
    'hint',
    'partial_example',
    'direct_explanation',
  ]) {
    current = await service.requestHelp({
      ...input,
      requestId: crypto.randomUUID(),
      level,
    });
  }
  assert.deepEqual(
    current.turns[0].help.map((item) => item.level),
    [
      'rephrase',
      'smaller_question',
      'hint',
      'partial_example',
      'direct_explanation',
    ],
  );
  assert.equal(current.currentQuestionId, session.currentQuestionId);
  database.close();
});

test('appends a challenged evaluation and preserves its rationale', async () => {
  const { calls, database, service } = setup();
  const session = await service.startSession('Database indexes');
  const evaluated = await service.submitAttempt({
    sessionId: session.id,
    questionId: session.currentQuestionId,
    answer: 'They avoid scanning every row for each lookup.',
  });
  const evaluationId = evaluated.turns[0].evaluationHistory[0].id;
  const challenge = {
    requestId: crypto.randomUUID(),
    sessionId: session.id,
    questionId: session.currentQuestionId,
    evaluationId,
    rationale: 'I identified the avoided scan.',
  };
  const [saved, replayed] = await Promise.all([
    service.challengeEvaluation(challenge),
    service.challengeEvaluation(challenge),
  ]);

  assert.equal(calls.challenges, 1);
  assert.equal(saved.turns[0].evaluationHistory.length, 2);
  assert.equal(saved.turns[0].evaluation.status, 'demonstrated');
  assert.deepEqual(replayed, saved);
  database.close();
});

test('serializes feedback acknowledgement behind an in-flight challenge', async () => {
  const database = openLearningDatabase(':memory:');
  const repository = new LearningSessionRepository(database);
  let releaseChallenge;
  let challengeStarted;
  const started = new Promise((resolve) => {
    challengeStarted = resolve;
  });
  const gate = new Promise((resolve) => {
    releaseChallenge = resolve;
  });
  const provider = {
    async createDiagnosticQuestion() {
      return question;
    },
    async evaluateAttempt() {
      return evaluation;
    },
    async reconsiderEvaluation() {
      challengeStarted();
      await gate;
      return { ...evaluation, status: 'demonstrated' };
    },
  };
  const service = new LearningService(repository, () => provider);
  const session = await service.startSession('Database indexes');
  const evaluated = await service.submitAttempt({
    sessionId: session.id,
    questionId: session.currentQuestionId,
    answer: 'They avoid scanning every row for each lookup.',
  });
  const challengePromise = service.challengeEvaluation({
    requestId: crypto.randomUUID(),
    sessionId: session.id,
    questionId: session.currentQuestionId,
    evaluationId: evaluated.turns[0].evaluationHistory[0].id,
    rationale: 'I identified the avoided scan.',
  });
  await started;

  let acknowledgementSettled = false;
  const acknowledgementPromise = service
    .acknowledgeFeedback({
      sessionId: session.id,
      questionId: session.currentQuestionId,
    })
    .then((result) => {
      acknowledgementSettled = true;
      return result;
    });
  await Promise.resolve();
  assert.equal(acknowledgementSettled, false);

  releaseChallenge();
  const [challenged, acknowledged] = await Promise.all([
    challengePromise,
    acknowledgementPromise,
  ]);

  assert.equal(challenged.turns[0].evaluationHistory.length, 2);
  assert.equal(acknowledged.pendingFeedbackQuestionId, null);
  assert.equal(acknowledged.turns[0].evaluationHistory.length, 2);
  database.close();
});

test('serializes deletion behind an in-flight evaluation', async () => {
  const database = openLearningDatabase(':memory:');
  const repository = new LearningSessionRepository(database);
  let releaseEvaluation;
  let evaluationStarted;
  const started = new Promise((resolve) => {
    evaluationStarted = resolve;
  });
  const gate = new Promise((resolve) => {
    releaseEvaluation = resolve;
  });
  const provider = {
    async createDiagnosticQuestion() {
      return question;
    },
    async evaluateAttempt() {
      evaluationStarted();
      await gate;
      return evaluation;
    },
  };
  const service = new LearningService(repository, () => provider);
  const session = await service.startSession('Database indexes');
  const evaluationPromise = service.submitAttempt({
    sessionId: session.id,
    questionId: session.currentQuestionId,
    answer: 'They avoid scanning every row for each lookup.',
  });
  await started;

  let deletionSettled = false;
  const deletionPromise = service.deleteSession(session.id).then((result) => {
    deletionSettled = true;
    return result;
  });
  await Promise.resolve();
  assert.equal(deletionSettled, false);

  releaseEvaluation();
  const [evaluated, deleted] = await Promise.all([
    evaluationPromise,
    deletionPromise,
  ]);

  assert.equal(evaluated.turns[0].evaluation.status, 'partial');
  assert.equal(deleted, true);
  assert.equal(service.getSession(session.id), null);
  database.close();
});

test('does not leave a partial session when question generation fails', async () => {
  const { database, repository } = setup();
  const service = new LearningService(repository, () => ({
    async createDiagnosticQuestion() {
      throw new Error('provider unavailable');
    },
    async evaluateAttempt() {
      throw new Error('not reached');
    },
  }));

  await assert.rejects(service.startSession('Database indexes'));
  assert.equal(repository.listSessions(20).length, 0);
  database.close();
});

test('allows only one provider operation at a time across sessions', async () => {
  const database = openLearningDatabase(':memory:');
  const repository = new LearningSessionRepository(database);
  let activeCalls = 0;
  let maximumActiveCalls = 0;
  let releaseFirst;
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  let calls = 0;
  const provider = {
    async createDiagnosticQuestion() {
      calls += 1;
      activeCalls += 1;
      maximumActiveCalls = Math.max(maximumActiveCalls, activeCalls);
      if (calls === 1) await firstGate;
      activeCalls -= 1;
      return question;
    },
  };
  const service = new LearningService(repository, () => provider);

  const first = service.startSession('Indexes');
  await new Promise((resolve) => setImmediate(resolve));
  const second = service.startSession('Transactions');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);

  releaseFirst();
  await Promise.all([first, second]);
  assert.equal(calls, 2);
  assert.equal(maximumActiveCalls, 1);
  database.close();
});

test('evaluates the persisted current question and saves one acknowledged attempt', async () => {
  const { calls, database, service } = setup();
  const session = await service.startSession('Database indexes');
  const input = {
    sessionId: session.id,
    questionId: session.currentQuestionId,
    answer: 'They avoid scanning every row for each lookup.',
  };

  const saved = await service.submitAttempt(input);
  const retried = await service.submitAttempt(input);

  assert.equal(calls.evaluations, 1);
  assert.deepEqual(calls.contexts[0], {
    topic: 'Database indexes',
    question: question.question,
    answer: input.answer,
    recentEvidence: [],
  });
  assert.deepEqual(retried, saved);
  assert.equal(saved.turns[0].answer, input.answer);
  database.close();
});

test('adapts with only the latest three bounded evidence summaries', async () => {
  const { calls, database, service } = setup();
  let current = await service.startSession('Database indexes');

  for (let index = 0; index < 5; index += 1) {
    const answeredQuestionId = current.currentQuestionId;
    current = await service.submitAttempt({
      sessionId: current.id,
      questionId: answeredQuestionId,
      answer: `Turn ${index + 1}: indexes avoid scanning every row.`,
    });
    if (index < 4) {
      current = await service.acknowledgeFeedback({
        sessionId: current.id,
        questionId: answeredQuestionId,
      });
    }
  }

  const context = calls.contexts.at(-1);
  assert.equal(context.recentEvidence.length, 3);
  assert.deepEqual(
    context.recentEvidence.map((item) => item.status),
    ['partial', 'partial', 'partial'],
  );
  assert.ok(
    context.recentEvidence.every(
      (item) =>
        !('answer' in item) &&
        item.evidenceFindings.length === 1 &&
        item.question.length <= 140,
    ),
  );
  database.close();
});

test('caps repeated help before another provider call', async () => {
  const { calls, database, service } = setup();
  const session = await service.startSession('Database indexes');
  const base = {
    sessionId: session.id,
    questionId: session.currentQuestionId,
    level: 'rephrase',
  };

  await service.requestHelp({ ...base, requestId: crypto.randomUUID() });
  await service.requestHelp({ ...base, requestId: crypto.randomUUID() });
  await assert.rejects(
    service.requestHelp({ ...base, requestId: crypto.randomUUID() }),
    /help limit/i,
  );

  assert.equal(calls.help, 2);
  database.close();
});

test('caps evaluation reconsiderations before another provider call', async () => {
  const { calls, database, service } = setup();
  const session = await service.startSession('Database indexes');
  let current = await service.submitAttempt({
    sessionId: session.id,
    questionId: session.currentQuestionId,
    answer: 'They avoid scanning every row for each lookup.',
  });

  for (let index = 0; index < 2; index += 1) {
    current = await service.challengeEvaluation({
      requestId: crypto.randomUUID(),
      sessionId: session.id,
      questionId: session.currentQuestionId,
      evaluationId: current.turns[0].evaluationHistory.at(-1).id,
      rationale: `Please reconsider reason ${index + 1}.`,
    });
  }

  await assert.rejects(
    service.challengeEvaluation({
      requestId: crypto.randomUUID(),
      sessionId: session.id,
      questionId: session.currentQuestionId,
      evaluationId: current.turns[0].evaluationHistory.at(-1).id,
      rationale: 'Please reconsider once more.',
    }),
    /challenge limit/i,
  );
  assert.equal(calls.challenges, 2);
  database.close();
});

test('requires feedback acknowledgement before accepting the next answer', async () => {
  const { database, service } = setup();
  const session = await service.startSession('Database indexes');
  const evaluated = await service.submitAttempt({
    sessionId: session.id,
    questionId: session.currentQuestionId,
    answer: 'They avoid scanning every row for each lookup.',
  });
  const nextQuestionId = evaluated.currentQuestionId;

  await assert.rejects(
    service.submitAttempt({
      sessionId: session.id,
      questionId: nextQuestionId,
      answer: 'Indexes also add work to writes.',
    }),
    /feedback.*acknowledged/i,
  );

  const continued = await service.acknowledgeFeedback({
    sessionId: session.id,
    questionId: session.currentQuestionId,
  });
  assert.equal(continued.pendingFeedbackQuestionId, null);
  assert.equal(continued.currentQuestionId, nextQuestionId);
  database.close();
});

test('exposes local list, load, end, and delete operations without a provider call', async () => {
  const { calls, database, service } = setup();
  const session = await service.startSession('Database indexes');

  assert.equal(service.getSession(session.id)?.id, session.id);
  assert.equal((await service.endSession(session.id)).status, 'ended');
  assert.equal(service.listSessions(20)[0].status, 'ended');
  assert.equal(await service.deleteSession(session.id), true);
  assert.equal(service.getSession(session.id), null);
  assert.equal(calls.questions, 1);
  assert.equal(calls.evaluations, 0);
  database.close();
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  initialLearningSession,
  learningSessionReducer,
} from '../src/learning/session.ts';

const question = {
  question: 'What role does a loss function play during model training?',
  intent: 'Check whether the learner understands the optimization objective.',
};

const evaluation = {
  status: 'partial',
  evidence: [
    {
      excerpt: 'a number the model tries to reduce',
      finding: 'Connects loss to an optimization target.',
    },
  ],
  concepts: [
    {
      name: 'Loss functions',
      assessment: 'partial',
      evidenceOrdinal: 0,
    },
  ],
  unresolvedGap: 'The answer does not connect loss to parameter updates.',
  uncertainty: 'low',
  proposedNextMove: 'probe',
  nextQuestion: 'How does reducing loss cause model parameters to change?',
  nextQuestionRationale: 'This probes the missing update mechanism.',
};

test('starts a session and receives the first AI question', () => {
  const starting = learningSessionReducer(initialLearningSession, {
    type: 'start',
    topic: 'Model training',
  });
  const ready = learningSessionReducer(starting, {
    type: 'question_received',
    question,
  });

  assert.equal(starting.status, 'loading_question');
  assert.equal(ready.status, 'answering');
  assert.equal(ready.topic, 'Model training');
  assert.equal(ready.currentQuestion, question.question);
});

test('preserves the exact learner answer while evaluation is pending', () => {
  const state = {
    ...initialLearningSession,
    status: 'answering',
    topic: 'Model training',
    currentQuestion: question.question,
    questionIntent: question.intent,
  };
  const answer = '  It is a number the model tries to reduce.  ';
  const typing = learningSessionReducer(state, {
    type: 'answer_changed',
    answer,
  });
  const evaluating = learningSessionReducer(typing, { type: 'submit' });

  assert.equal(evaluating.status, 'evaluating');
  assert.equal(evaluating.answer, answer);
});

test('keeps the answer recoverable when evaluation fails', () => {
  const state = {
    ...initialLearningSession,
    status: 'evaluating',
    topic: 'Model training',
    currentQuestion: question.question,
    answer: 'Loss is a number the model reduces.',
  };
  const failed = learningSessionReducer(state, {
    type: 'request_failed',
    message: 'DeepSeek could not complete this step.',
  });

  assert.equal(failed.status, 'error');
  assert.equal(failed.answer, 'Loss is a number the model reduces.');
});

test('continues with the AI next question and clears the answer', () => {
  const state = {
    ...initialLearningSession,
    status: 'feedback',
    topic: 'Model training',
    currentQuestion: question.question,
    answer: 'It is a number the model tries to reduce.',
    evaluation,
    turn: 1,
  };
  const session = persistedSession('active');
  session.currentQuestionId = '00000000-0000-4000-8000-000000000003';
  session.turns.push({
    questionId: session.currentQuestionId,
    turn: 2,
    question: evaluation.nextQuestion,
    intent: evaluation.nextQuestionRationale,
    answer: null,
    evaluation: null,
    evaluationHistory: [],
    help: [],
  });
  const next = learningSessionReducer(state, {
    type: 'feedback_acknowledged',
    session,
  });

  assert.equal(next.status, 'answering');
  assert.equal(next.currentQuestion, evaluation.nextQuestion);
  assert.equal(next.answer, '');
  assert.equal(next.turn, 2);
});

test('does not submit a blank answer', () => {
  const state = {
    ...initialLearningSession,
    status: 'answering',
    topic: 'Calculus',
    currentQuestion: 'What does a derivative measure?',
    answer: '   ',
  };

  assert.equal(
    learningSessionReducer(state, { type: 'submit' }).status,
    'answering',
  );
});

test('hydrates a persisted active session at its current question', () => {
  const state = learningSessionReducer(initialLearningSession, {
    type: 'session_loaded',
    session: persistedSession('active'),
  });

  assert.equal(state.status, 'answering');
  assert.equal(state.sessionId, '00000000-0000-4000-8000-000000000001');
  assert.equal(state.questionId, '00000000-0000-4000-8000-000000000002');
  assert.equal(
    state.currentQuestion,
    'Why do database indexes speed up reads?',
  );
});

test('hydrates unacknowledged persisted feedback before the next question', () => {
  const session = persistedSession('active');
  const answeredQuestionId = session.currentQuestionId;
  session.turns[0].answer = 'They avoid scanning every row.';
  session.turns[0].evaluation = evaluation;
  session.turns[0].evaluationHistory = [
    {
      id: 'evaluation-1',
      revision: 1,
      evaluation,
      challengeRationale: null,
      createdAt: session.updatedAt,
    },
  ];
  session.turns.push({
    questionId: '00000000-0000-4000-8000-000000000003',
    turn: 2,
    question: evaluation.nextQuestion,
    intent: evaluation.nextQuestionRationale,
    answer: null,
    evaluation: null,
    evaluationHistory: [],
    help: [],
  });
  session.currentQuestionId = session.turns[1].questionId;
  session.pendingFeedbackQuestionId = answeredQuestionId;

  const state = learningSessionReducer(initialLearningSession, {
    type: 'session_loaded',
    session,
  });

  assert.equal(state.status, 'feedback');
  assert.equal(state.questionId, answeredQuestionId);
  assert.equal(state.nextQuestionId, session.currentQuestionId);
  assert.equal(state.answer, 'They avoid scanning every row.');
  assert.deepEqual(state.evaluation, evaluation);
});

test('opens an ended persisted session as read-only history', () => {
  const state = learningSessionReducer(initialLearningSession, {
    type: 'session_loaded',
    session: persistedSession('ended'),
  });

  assert.equal(state.status, 'reviewing');
  assert.equal(state.history.length, 1);
});

test('keeps the draft answer when persisted help arrives', () => {
  const session = persistedSession('active');
  session.turns[0].help = [
    {
      id: 'help-1',
      requestId: 'request-1',
      ordinal: 1,
      level: 'rephrase',
      content: 'Which structure narrows the rows to inspect?',
      createdAt: session.updatedAt,
    },
  ];
  const state = {
    ...initialLearningSession,
    status: 'answering',
    answer: 'My draft',
    sessionId: session.id,
    questionId: session.currentQuestionId,
  };

  const updated = learningSessionReducer(state, {
    type: 'help_persisted',
    session,
  });

  assert.equal(updated.answer, 'My draft');
  assert.equal(updated.history[0].help.length, 1);
});

function persistedSession(status) {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    topic: 'Database indexes',
    status,
    startedAt: '2026-08-30T00:00:00.000Z',
    updatedAt: '2026-08-30T00:05:00.000Z',
    endedAt: status === 'ended' ? '2026-08-30T00:05:00.000Z' : null,
    currentQuestionId: '00000000-0000-4000-8000-000000000002',
    pendingFeedbackQuestionId: null,
    turns: [
      {
        questionId: '00000000-0000-4000-8000-000000000002',
        turn: 1,
        question: 'Why do database indexes speed up reads?',
        intent:
          'Tests whether the learner understands indexed lookup tradeoffs.',
        answer: null,
        evaluation: null,
        evaluationHistory: [],
        help: [],
      },
    ],
  };
}

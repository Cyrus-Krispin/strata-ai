import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseListSessionsRequest,
  parseProviderCredentialRequest,
  parseKnowledgeGraphRequest,
  parseHelpRequest,
  parseChallengeRequest,
  parseSessionRequest,
  parseSubmitAttemptRequest,
  parseTopicRequest,
  toPublicLearningError,
} from '../src/learning/ipc.ts';
import { LearningFailure } from '../src/learning/errors.ts';

test('trims a valid topic request', () => {
  assert.deepEqual(parseTopicRequest({ topic: '  Model training  ' }), {
    topic: 'Model training',
  });
});

test('rejects an empty topic request', () => {
  assert.throws(() => parseTopicRequest({ topic: '   ' }));
});

test('trims and bounds provider credentials without accepting extra fields', () => {
  assert.deepEqual(
    parseProviderCredentialRequest({ apiKey: '  sk-test-key  ' }),
    {
      apiKey: 'sk-test-key',
    },
  );
  assert.throws(() => parseProviderCredentialRequest({ apiKey: 'short' }));
  assert.throws(() =>
    parseProviderCredentialRequest({ apiKey: 'sk-test-key', model: 'other' }),
  );
  assert.throws(() =>
    parseProviderCredentialRequest({ apiKey: 'x'.repeat(513) }),
  );
});

test('accepts bounded persisted-session requests', () => {
  const sessionId = '00000000-0000-4000-8000-000000000001';
  const questionId = '00000000-0000-4000-8000-000000000002';

  assert.deepEqual(parseSessionRequest({ sessionId }), { sessionId });
  assert.deepEqual(
    parseSubmitAttemptRequest({
      sessionId,
      questionId,
      answer: '  Evidence  ',
    }),
    { sessionId, questionId, answer: '  Evidence  ' },
  );
  assert.deepEqual(parseListSessionsRequest({}), { limit: 20 });
  assert.deepEqual(parseListSessionsRequest({ limit: 7 }), { limit: 7 });
  assert.deepEqual(parseKnowledgeGraphRequest({}), { limit: 80 });
  assert.deepEqual(parseKnowledgeGraphRequest({ limit: 24 }), { limit: 24 });
  const requestId = '00000000-0000-4000-8000-000000000003';
  assert.equal(
    parseHelpRequest({ requestId, sessionId, questionId, level: 'rephrase' })
      .level,
    'rephrase',
  );
  assert.equal(
    parseChallengeRequest({
      requestId,
      sessionId,
      questionId,
      evaluationId: requestId,
      rationale: 'The quoted evidence supports my answer.',
    }).rationale,
    'The quoted evidence supports my answer.',
  );
});

test('rejects unbounded or malformed persisted-session requests', () => {
  assert.throws(() => parseSessionRequest({ sessionId: 'not-a-uuid' }));
  assert.throws(() => parseListSessionsRequest({ limit: 1000 }));
  assert.throws(() => parseKnowledgeGraphRequest({ limit: 121 }));
  assert.throws(() =>
    parseSubmitAttemptRequest({
      sessionId: '00000000-0000-4000-8000-000000000001',
      questionId: '00000000-0000-4000-8000-000000000002',
      answer: '',
    }),
  );
});

test('does not expose provider error details to the renderer', () => {
  const result = toPublicLearningError(
    new Error('Authorization failed for secret sk-private-value'),
  );

  assert.deepEqual(result, {
    code: 'provider_failed',
    message:
      'DeepSeek could not complete this step. Your answer is still here; please try again.',
  });
});

test('explains when the local key is missing', () => {
  const result = toPublicLearningError(
    new LearningFailure(
      'not_configured',
      'DeepSeek is not configured.',
      'DeepSeek is not configured. Add your API key in Strata AI provider settings.',
    ),
  );

  assert.equal(result.code, 'not_configured');
  assert.match(result.message, /provider settings/i);
});

test('turns provider authentication status into actionable key recovery', () => {
  assert.deepEqual(toPublicLearningError({ status: 401, message: 'secret' }), {
    code: 'invalid_credential',
    message: 'DeepSeek rejected this API key. Update it in provider settings.',
  });
});

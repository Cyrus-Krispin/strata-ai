import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseDiagnosticQuestion,
  parseEvaluation,
  parseHelpResponse,
} from '../src/learning/contracts.ts';

test('accepts one concise diagnostic question', () => {
  const result = parseDiagnosticQuestion(
    JSON.stringify({
      question:
        'What changes inside a neural network when it learns from an error?',
      intent: 'Check whether the learner connects loss to parameter updates.',
    }),
  );

  assert.equal(
    result.question,
    'What changes inside a neural network when it learns from an error?',
  );
});

test('rejects an empty diagnostic response', () => {
  assert.throws(
    () => parseDiagnosticQuestion(''),
    /DeepSeek returned an empty response/,
  );
});

test('rejects a diagnostic question longer than 16 words', () => {
  assert.throws(() =>
    parseDiagnosticQuestion(
      JSON.stringify({
        question:
          'Can you explain how a neural network changes its internal parameters after observing an error during one training example?',
        intent:
          'Check whether the learner connects errors to parameter updates.',
      }),
    ),
  );
});

test('rejects a diagnostic response containing multiple questions', () => {
  assert.throws(() =>
    parseDiagnosticQuestion(
      JSON.stringify({
        question: 'What is a gradient? How does it change a parameter?',
        intent: 'Check the learner understanding of gradients and updates.',
      }),
    ),
  );
});

test('accepts evidence quoted exactly from the learner answer', () => {
  const answer =
    'The gradient shows how the loss changes, so the optimizer moves the parameters in the opposite direction.';
  const result = parseEvaluation(
    JSON.stringify({
      status: 'partial',
      evidence: [
        {
          excerpt: 'optimizer moves the parameters in the opposite direction',
          finding: 'Correctly connects the gradient to the update direction.',
        },
      ],
      concepts: [
        {
          name: 'Gradient direction',
          assessment: 'partial',
          evidenceOrdinal: 0,
        },
      ],
      unresolvedGap: 'The role of gradient magnitude is not explained.',
      uncertainty: 'low',
      proposedNextMove: 'probe',
      nextQuestion:
        'What does the magnitude of a gradient change about one optimization step?',
      nextQuestionRationale:
        'This tests the missing relationship between gradient size and update size.',
    }),
    answer,
  );

  assert.equal(result.status, 'partial');
  assert.equal(result.proposedNextMove, 'probe');
});

test('rejects evidence fabricated by the model', () => {
  const answer = 'The optimizer changes the weights.';

  assert.throws(
    () =>
      parseEvaluation(
        JSON.stringify({
          status: 'demonstrated',
          evidence: [
            {
              excerpt: 'The optimizer follows the negative gradient.',
              finding: 'Explains the update direction.',
            },
          ],
          concepts: [
            {
              name: 'Gradient direction',
              assessment: 'demonstrated',
              evidenceOrdinal: 0,
            },
          ],
          unresolvedGap: 'No major gap identified.',
          uncertainty: 'low',
          proposedNextMove: 'advance',
          nextQuestion: 'How does learning rate affect that update?',
          nextQuestionRationale: 'This advances from direction to step size.',
        }),
        answer,
      ),
    /Evidence must quote the learner answer exactly/,
  );
});

test('rejects a verbose next question', () => {
  const answer = 'The optimizer changes the weights.';

  assert.throws(() =>
    parseEvaluation(
      JSON.stringify({
        status: 'partial',
        evidence: [
          {
            excerpt: 'changes the weights',
            finding: 'Identifies that training updates model weights.',
          },
        ],
        concepts: [
          {
            name: 'Parameter updates',
            assessment: 'partial',
            evidenceOrdinal: 0,
          },
        ],
        unresolvedGap: 'The update direction is not explained.',
        uncertainty: 'low',
        proposedNextMove: 'probe',
        nextQuestion:
          'Can you explain how the gradient indicates which direction every weight should move during the next optimization step?',
        nextQuestionRationale: 'This isolates the missing update direction.',
      }),
      answer,
    ),
  );
});

test('rejects a response with more than the allowed fields', () => {
  const answer = 'Loss measures the error.';

  assert.throws(() =>
    parseEvaluation(
      JSON.stringify({
        status: 'partial',
        evidence: [
          {
            excerpt: 'Loss measures the error',
            finding: 'Identifies the purpose of loss.',
          },
        ],
        concepts: [
          {
            name: 'Loss functions',
            assessment: 'partial',
            evidenceOrdinal: 0,
          },
        ],
        unresolvedGap: 'The answer does not connect loss to learning.',
        uncertainty: 'low',
        proposedNextMove: 'probe',
        nextQuestion: 'How does the loss influence parameter updates?',
        nextQuestionRationale: 'This probes the missing causal connection.',
        fullExplanation: 'Here is the complete answer...',
      }),
      answer,
    ),
  );
});

test('accepts a bounded help response for the requested level', () => {
  const result = parseHelpResponse(
    JSON.stringify({
      level: 'hint',
      content:
        'Focus on what changes the search space before any rows are read.',
    }),
    'hint',
  );

  assert.equal(result.level, 'hint');
});

test('rejects a help response for a different level', () => {
  assert.throws(() =>
    parseHelpResponse(
      JSON.stringify({
        level: 'direct_explanation',
        content: 'An index stores a searchable structure that points to rows.',
      }),
      'hint',
    ),
  );
});

test('requires rephrases and smaller questions to contain one question', () => {
  assert.throws(() =>
    parseHelpResponse(
      JSON.stringify({
        level: 'rephrase',
        content: 'Think about lookup structures. What changes? Why?',
      }),
      'rephrase',
    ),
  );
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DeepSeekLearningProvider,
  deepSeekClientOptions,
} from '../src/main/ai/deepseek.ts';

function fakeClient(content) {
  const requests = [];

  return {
    requests,
    chat: {
      completions: {
        async create(request) {
          requests.push(request);
          return {
            choices: [{ message: { content } }],
          };
        },
      },
    },
  };
}

test('disables automatic retries and bounds provider timeout', () => {
  const options = deepSeekClientOptions('test-api-key');
  assert.equal(options.maxRetries, 0);
  assert.equal(options.timeout, 30_000);
  assert.equal(options.baseURL, 'https://api.deepseek.com');
});

test('requests a JSON diagnostic question from DeepSeek', async () => {
  const client = fakeClient(
    JSON.stringify({
      question: 'Why does training a model require a loss function?',
      intent: 'Check whether the learner understands the optimization target.',
    }),
  );
  const provider = new DeepSeekLearningProvider(client, 'deepseek-v4-flash');

  const result = await provider.createDiagnosticQuestion('Model training');

  assert.equal(
    result.question,
    'Why does training a model require a loss function?',
  );
  assert.equal(client.requests.length, 1);
  assert.deepEqual(client.requests[0].response_format, {
    type: 'json_object',
  });
  assert.equal(client.requests[0].model, 'deepseek-v4-flash');
  assert.deepEqual(client.requests[0].thinking, { type: 'disabled' });
  assert.match(client.requests[0].messages[0].content, /at most 16 words/i);
  assert.match(client.requests[0].messages[0].content, /one small step/i);
  assert.match(client.requests[0].messages[1].content, /Model training/);
});

test('evaluates an attempt and proposes exactly one next question', async () => {
  const answer = 'The loss gives the model a number to reduce during training.';
  const client = fakeClient(
    JSON.stringify({
      status: 'partial',
      evidence: [
        {
          excerpt: 'a number to reduce during training',
          finding: 'Connects loss to the optimization objective.',
        },
      ],
      concepts: [
        {
          name: 'Loss functions',
          assessment: 'partial',
          evidenceOrdinal: 0,
        },
      ],
      unresolvedGap: 'The answer does not explain how parameters are updated.',
      uncertainty: 'low',
      proposedNextMove: 'probe',
      nextQuestion: 'How does the loss lead to a change in model parameters?',
      nextQuestionRationale: 'This probes the missing update mechanism.',
    }),
  );
  const provider = new DeepSeekLearningProvider(client, 'deepseek-v4-flash');

  const result = await provider.evaluateAttempt({
    topic: 'Model training',
    question: 'Why does training a model require a loss function?',
    answer,
    recentEvidence: [
      {
        question: 'What does a model optimize?',
        status: 'partial',
        evidenceFindings: ['Connects training to an objective.'],
        unresolvedGap: 'The update mechanism remains unclear.',
      },
    ],
  });

  assert.equal(result.status, 'partial');
  assert.equal(client.requests.length, 1);
  assert.match(client.requests[0].messages[1].content, new RegExp(answer));
  assert.match(client.requests[0].messages[1].content, /recentEvidence/);
  assert.doesNotMatch(client.requests[0].messages[1].content, /prior answer/i);
  assert.deepEqual(client.requests[0].response_format, {
    type: 'json_object',
  });
  assert.deepEqual(client.requests[0].thinking, { type: 'disabled' });
  assert.match(client.requests[0].messages[0].content, /at most 16 words/i);
  assert.match(client.requests[0].messages[0].content, /smallest unresolved/i);
  assert.match(client.requests[0].messages[0].content, /concepts/i);
});

test('fails closed when DeepSeek returns empty content', async () => {
  const client = fakeClient(null);
  const provider = new DeepSeekLearningProvider(client, 'deepseek-v4-flash');

  await assert.rejects(
    provider.createDiagnosticQuestion('Calculus'),
    /DeepSeek returned an empty response/,
  );
});

test('generates only the requested graduated-help level', async () => {
  const client = fakeClient(
    JSON.stringify({
      level: 'hint',
      content:
        'Focus on the structure used to locate rows before scanning them.',
    }),
  );
  const provider = new DeepSeekLearningProvider(client, 'deepseek-v4-flash');

  const result = await provider.createHelpResponse({
    topic: 'Database indexes',
    question: 'Why do indexes speed up reads?',
    level: 'hint',
    priorHelp: [],
  });

  assert.equal(result.level, 'hint');
  assert.match(
    client.requests[0].messages[0].content,
    /do not provide the complete answer/i,
  );
  assert.match(client.requests[0].messages[1].content, /"level":"hint"/);
});

test('reconsiders an evaluation with the learner challenge', async () => {
  const answer =
    'Indexes avoid scanning every row by using a lookup structure.';
  const revised = {
    status: 'demonstrated',
    evidence: [
      {
        excerpt: 'using a lookup structure',
        finding: 'Identifies the indexed access mechanism.',
      },
    ],
    concepts: [
      {
        name: 'Database indexes',
        assessment: 'demonstrated',
        evidenceOrdinal: 0,
      },
    ],
    unresolvedGap: 'The learner has not discussed write costs.',
    uncertainty: 'low',
    proposedNextMove: 'advance',
    nextQuestion: 'What cost does maintaining an index add to writes?',
    nextQuestionRationale: 'Advances from read behavior to the main tradeoff.',
  };
  const client = fakeClient(JSON.stringify(revised));
  const provider = new DeepSeekLearningProvider(client, 'deepseek-v4-flash');

  const result = await provider.reconsiderEvaluation({
    topic: 'Database indexes',
    question: 'Why do indexes speed up reads?',
    answer,
    evaluation: { ...revised, status: 'partial' },
    rationale: 'I did identify the lookup structure.',
  });

  assert.equal(result.status, 'demonstrated');
  assert.match(
    client.requests[0].messages[1].content,
    /I did identify the lookup structure/,
  );
});

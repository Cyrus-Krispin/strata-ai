const cases = [
  {
    name: 'connects loss, gradients, and parameter updates',
    quality: 'demonstrated',
    answer:
      'The loss measures error, backpropagation computes its gradient, and the optimizer moves parameters against that gradient.',
    excerpt:
      'backpropagation computes its gradient, and the optimizer moves parameters against that gradient',
    finding:
      'Correctly connects loss, gradient computation, and update direction.',
    gap: 'The effect of learning rate remains untested.',
    move: 'advance',
    question: 'How does learning rate change the parameter update?',
    rationale: 'This advances from update direction to update size.',
  },
  {
    name: 'explains backpropagation through the chain rule',
    quality: 'demonstrated',
    answer:
      'Backpropagation applies the chain rule from the output toward earlier layers to compute each parameter gradient.',
    excerpt: 'applies the chain rule from the output toward earlier layers',
    finding:
      'Correctly describes the direction and mechanism of backpropagation.',
    gap: 'Gradient behavior in deep networks remains untested.',
    move: 'advance',
    question: 'Why can gradients shrink across many layers?',
    rationale:
      'This advances to a common consequence of repeated chain-rule products.',
  },
  {
    name: 'explains minibatch gradient estimation',
    quality: 'demonstrated',
    answer:
      'A minibatch averages gradients from several examples, giving a cheaper but noisier estimate than the full dataset.',
    excerpt: 'cheaper but noisier estimate than the full dataset',
    finding: 'Correctly identifies the computational and statistical tradeoff.',
    gap: 'The effect of batch size remains untested.',
    move: 'advance',
    question: 'What changes when the minibatch becomes much larger?',
    rationale:
      'This advances from gradient estimation to the batch-size tradeoff.',
  },
  {
    name: 'identifies update direction but omits step size',
    quality: 'partial',
    answer:
      'Training moves weights opposite the gradient so the loss should decrease.',
    excerpt: 'moves weights opposite the gradient',
    finding: 'Correctly identifies the usual update direction.',
    gap: 'The answer does not explain what determines update size.',
    move: 'probe',
    question: 'What determines how far the weights move?',
    rationale:
      'This probes the missing role of learning rate and gradient magnitude.',
  },
  {
    name: 'describes backward flow without the chain rule',
    quality: 'partial',
    answer:
      'Backpropagation sends the error backward through the network to find gradients.',
    excerpt: 'sends the error backward through the network',
    finding: 'Recognizes the backward direction of gradient computation.',
    gap: 'The mechanism connecting derivatives across layers is missing.',
    move: 'probe',
    question: 'How are derivatives connected across adjacent layers?',
    rationale: 'This probes for the missing chain-rule mechanism.',
  },
  {
    name: 'names optimizer updates without their signal',
    quality: 'partial',
    answer: 'The optimizer updates the weights after every batch.',
    excerpt: 'updates the weights after every batch',
    finding: 'Identifies when parameter updates occur.',
    gap: 'The signal that determines each update is missing.',
    move: 'probe',
    question: 'What information tells the optimizer how to update?',
    rationale:
      'This probes the missing connection between gradients and updates.',
  },
  {
    name: 'reverses the meaning of the gradient direction',
    quality: 'misconception',
    answer:
      'The gradient points downhill, so the optimizer follows it to reduce loss.',
    excerpt: 'The gradient points downhill',
    finding: 'Reverses the gradient direction relative to increasing loss.',
    gap: 'The learner needs the directional derivative relationship.',
    move: 'prerequisite',
    question: 'Which direction makes a function increase fastest?',
    rationale: 'This revisits the prerequisite meaning of a gradient.',
  },
  {
    name: 'confuses gradient computation with parameter updates',
    quality: 'misconception',
    answer:
      'Backpropagation changes each weight while moving backward through the layers.',
    excerpt: 'Backpropagation changes each weight',
    finding: 'Confuses gradient computation with the optimizer update.',
    gap: 'The roles of backpropagation and the optimizer need separation.',
    move: 'prerequisite',
    question: 'What does backpropagation produce before any weight changes?',
    rationale:
      'This restores the prerequisite separation between gradients and updates.',
  },
  {
    name: 'disconnects loss from learning',
    quality: 'misconception',
    answer:
      'Loss is just the model accuracy shown after training and does not affect the weights.',
    excerpt: 'does not affect the weights',
    finding:
      'Incorrectly disconnects the training objective from parameter updates.',
    gap: 'The learner needs the purpose of a differentiable training objective.',
    move: 'prerequisite',
    question: 'What signal tells training whether a prediction improved?',
    rationale: 'This revisits why training requires an objective signal.',
  },
  {
    name: 'offers an unsupported guess about weight changes',
    quality: 'uncertain',
    answer: 'I think the weights somehow learn which direction is better.',
    excerpt: 'somehow learn which direction is better',
    finding: 'Suggests direction matters but provides no mechanism.',
    gap: 'The learner has not identified a signal for update direction.',
    move: 'hint',
    question: 'Which measured quantity could indicate a better direction?',
    rationale: 'This gives a small prompt toward the role of loss.',
  },
  {
    name: 'uses backward language without a testable claim',
    quality: 'uncertain',
    answer: 'Maybe backpropagation means the network thinks backward.',
    excerpt: 'the network thinks backward',
    finding: 'Uses metaphorical language without describing a computation.',
    gap: 'No testable account of what moves backward is present.',
    move: 'hint',
    question: 'What numerical quantity could move backward through layers?',
    rationale:
      'This supplies a narrow cue toward derivatives without explaining them.',
  },
  {
    name: 'makes an ambiguous batch-size claim',
    quality: 'uncertain',
    answer: 'The batch probably makes training more stable somehow.',
    excerpt: 'more stable somehow',
    finding:
      'Suggests stability but does not define the mechanism or comparison.',
    gap: 'The learner has not connected batches to gradient estimates.',
    move: 'hint',
    question: 'What gets averaged across examples in a batch?',
    rationale: 'This gives a minimal cue toward minibatch gradient estimation.',
  },
];

const forbiddenClaimsByQuality = {
  demonstrated: ['Do not claim the demonstrated mechanism is missing.'],
  partial: ['Do not classify the answer as fully demonstrated.'],
  misconception: ['Do not endorse the quoted misconception as correct.'],
  uncertain: ['Do not infer a precise mechanism absent from the answer.'],
};

export const founderEvaluationCases = cases.map((fixture) => ({
  name: fixture.name,
  quality: fixture.quality,
  answer: fixture.answer,
  requiredConceptEvidence: [fixture.excerpt],
  forbiddenClaims: forbiddenClaimsByQuality[fixture.quality],
  acceptableNextMoves: [fixture.move],
  evaluation: {
    status: fixture.quality,
    evidence: [{ excerpt: fixture.excerpt, finding: fixture.finding }],
    concepts: [
      {
        name: 'Gradient-based learning',
        assessment: fixture.quality,
        evidenceOrdinal: 0,
      },
    ],
    unresolvedGap: fixture.gap,
    uncertainty: fixture.quality === 'uncertain' ? 'high' : 'low',
    proposedNextMove: fixture.move,
    nextQuestion: fixture.question,
    nextQuestionRationale: fixture.rationale,
  },
}));

const validBase = founderEvaluationCases[0];

export const invalidEvaluationCases = [
  {
    name: 'concept points beyond available evidence',
    answer: validBase.answer,
    evaluation: {
      ...validBase.evaluation,
      concepts: [
        {
          name: 'Gradient-based learning',
          assessment: 'demonstrated',
          evidenceOrdinal: 3,
        },
      ],
    },
    error: /Concept evidence must reference an available evidence item/,
  },
  {
    name: 'concept name is too broad to be useful',
    answer: validBase.answer,
    evaluation: {
      ...validBase.evaluation,
      concepts: [
        {
          name: 'AI, ML, gradients, optimization, and everything else',
          assessment: 'demonstrated',
          evidenceOrdinal: 0,
        },
      ],
    },
    error: /concepts/,
  },
  {
    name: 'fabricated evidence excerpt',
    answer: validBase.answer,
    evaluation: {
      ...validBase.evaluation,
      evidence: [
        {
          excerpt: 'The optimizer always finds the global minimum.',
          finding: 'Makes an unsupported optimization guarantee.',
        },
      ],
    },
    error: /Evidence must quote the learner answer exactly/,
  },
  {
    name: 'multiple next questions',
    answer: validBase.answer,
    evaluation: {
      ...validBase.evaluation,
      nextQuestion: 'What sets update size? How does momentum change it?',
    },
    error: /Question must be one sentence with one question mark/,
  },
  {
    name: 'missing uncertainty',
    answer: validBase.answer,
    evaluation: Object.fromEntries(
      Object.entries(validBase.evaluation).filter(
        ([key]) => key !== 'uncertainty',
      ),
    ),
    error: /uncertainty/,
  },
  {
    name: 'premature answer disclosure',
    answer: validBase.answer,
    evaluation: {
      ...validBase.evaluation,
      fullAnswer:
        'The learning rate scales the gradient before the optimizer updates each parameter.',
    },
    error: /fullAnswer/,
  },
];

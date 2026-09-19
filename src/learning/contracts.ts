import { z } from 'zod';

export const shortQuestionSchema = z
  .string()
  .trim()
  .min(5)
  .max(140)
  .refine((question) => question.split(/\s+/u).length <= 16, {
    message: 'Question must contain at most 16 words.',
  })
  .refine(
    (question) =>
      !question.includes('\n') &&
      question.endsWith('?') &&
      question.match(/\?/gu)?.length === 1,
    { message: 'Question must be one sentence with one question mark.' },
  );

export const diagnosticQuestionSchema = z
  .object({
    question: shortQuestionSchema,
    intent: z.string().trim().min(10).max(240),
  })
  .strict();

const conceptAssessmentSchema = z.enum([
  'demonstrated',
  'partial',
  'misconception',
  'uncertain',
]);

export const evaluationSchema = z
  .object({
    status: conceptAssessmentSchema,
    evidence: z
      .array(
        z
          .object({
            excerpt: z.string().min(1).max(320),
            finding: z.string().trim().min(5).max(280),
          })
          .strict(),
      )
      .min(1)
      .max(3),
    concepts: z
      .array(
        z
          .object({
            name: z
              .string()
              .trim()
              .min(2)
              .max(48)
              .refine((name) => name.split(/\s+/u).length <= 5),
            assessment: conceptAssessmentSchema,
            evidenceOrdinal: z.number().int().min(0).max(2),
          })
          .strict(),
      )
      .min(1)
      .max(4),
    unresolvedGap: z.string().trim().min(5).max(320),
    uncertainty: z.enum(['low', 'medium', 'high']),
    proposedNextMove: z.enum(['probe', 'advance', 'prerequisite', 'hint']),
    nextQuestion: shortQuestionSchema,
    nextQuestionRationale: z.string().trim().min(5).max(280),
  })
  .strict()
  .superRefine((evaluation, context) => {
    for (const [index, concept] of evaluation.concepts.entries()) {
      if (concept.evidenceOrdinal >= evaluation.evidence.length) {
        context.addIssue({
          code: 'custom',
          path: ['concepts', index, 'evidenceOrdinal'],
          message:
            'Concept evidence must reference an available evidence item.',
        });
      }
    }
  });

export const helpLevels = [
  'rephrase',
  'smaller_question',
  'hint',
  'partial_example',
  'direct_explanation',
] as const;

export const helpResponseSchema = z.discriminatedUnion('level', [
  z
    .object({ level: z.literal('rephrase'), content: shortQuestionSchema })
    .strict(),
  z
    .object({
      level: z.literal('smaller_question'),
      content: shortQuestionSchema,
    })
    .strict(),
  z
    .object({
      level: z.literal('hint'),
      content: z.string().trim().min(5).max(360),
    })
    .strict(),
  z
    .object({
      level: z.literal('partial_example'),
      content: z.string().trim().min(5).max(600),
    })
    .strict(),
  z
    .object({
      level: z.literal('direct_explanation'),
      content: z.string().trim().min(5).max(1200),
    })
    .strict(),
]);

export type DiagnosticQuestion = z.infer<typeof diagnosticQuestionSchema>;
export type EvaluationResult = z.infer<typeof evaluationSchema>;
export type HelpLevel = (typeof helpLevels)[number];
export type HelpResponse = z.infer<typeof helpResponseSchema>;

function parseJsonResponse(content: string): unknown {
  if (!content.trim()) {
    throw new Error('DeepSeek returned an empty response.');
  }

  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new Error('DeepSeek returned invalid JSON.');
  }
}

export function parseDiagnosticQuestion(content: string): DiagnosticQuestion {
  return diagnosticQuestionSchema.parse(parseJsonResponse(content));
}

export function parseEvaluation(
  content: string,
  learnerAnswer: string,
): EvaluationResult {
  const evaluation = evaluationSchema.parse(parseJsonResponse(content));

  for (const evidence of evaluation.evidence) {
    if (!learnerAnswer.includes(evidence.excerpt)) {
      throw new Error('Evidence must quote the learner answer exactly.');
    }
  }

  return evaluation;
}

export function parseHelpResponse(
  content: string,
  expectedLevel: HelpLevel,
): HelpResponse {
  const response = helpResponseSchema.parse(parseJsonResponse(content));
  if (response.level !== expectedLevel) {
    throw new Error('Help response must match the requested level.');
  }
  return response;
}

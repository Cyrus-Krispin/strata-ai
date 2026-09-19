import { z } from 'zod';

import type { PersistedLearningSession } from './history.ts';
import {
  diagnosticQuestionSchema,
  evaluationSchema,
  helpLevels,
  helpResponseSchema,
} from './contracts.ts';

export const learningBackupFormat = 'strata-ai-learning-backup';
export const learningBackupFormatVersion = 1;

// Version-1 backups predate graph annotations. Keep them restorable while the
// live provider contract continues to require at least one grounded concept.
const storedEvaluationSchema = z
  .object({
    ...evaluationSchema.shape,
    concepts: z
      .array(evaluationSchema.shape.concepts.element)
      .max(4)
      .default([]),
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

const evaluationRevisionSchema = z
  .object({
    id: z.uuid(),
    revision: z.number().int().min(1).max(3),
    evaluation: storedEvaluationSchema,
    challengeRationale: z.string().min(2).max(1000).nullable(),
    createdAt: z.iso.datetime(),
  })
  .strict();

const helpSchema = z
  .object({
    id: z.uuid(),
    ordinal: z.number().int().min(1).max(9),
    level: z.enum([
      'rephrase',
      'smaller_question',
      'hint',
      'partial_example',
      'direct_explanation',
    ]),
    content: z.string().min(5).max(1200),
    createdAt: z.iso.datetime(),
  })
  .strict()
  .superRefine((help, context) => {
    const parsed = helpResponseSchema.safeParse({
      level: help.level,
      content: help.content,
    });
    if (!parsed.success) {
      context.addIssue({
        code: 'custom',
        message: 'Help content does not match its requested level.',
      });
    }
  });

const turnSchema = z
  .object({
    questionId: z.uuid(),
    turn: z.number().int().min(1).max(10_000),
    question: diagnosticQuestionSchema.shape.question,
    intent: diagnosticQuestionSchema.shape.intent,
    answer: z.string().min(1).max(12_000).nullable(),
    evaluation: storedEvaluationSchema.nullable(),
    evaluationHistory: z.array(evaluationRevisionSchema).max(3),
    help: z.array(helpSchema).max(9),
  })
  .strict();

export const localDataSessionSchema = z
  .object({
    id: z.uuid(),
    topic: z.string().min(2).max(160),
    status: z.enum(['active', 'ended']),
    startedAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    endedAt: z.iso.datetime().nullable(),
    currentQuestionId: z.uuid(),
    pendingFeedbackQuestionId: z.uuid().nullable(),
    turns: z.array(turnSchema).min(1).max(10_000),
  })
  .strict()
  .superRefine((session, context) => {
    const questionIds = new Set(session.turns.map((turn) => turn.questionId));
    if (questionIds.size !== session.turns.length) {
      context.addIssue({
        code: 'custom',
        message: 'Question IDs must be unique.',
      });
    }
    if (!questionIds.has(session.currentQuestionId)) {
      context.addIssue({
        code: 'custom',
        message: 'The current question must be included in the session.',
      });
    }
    if (session.turns.at(-1)?.questionId !== session.currentQuestionId) {
      context.addIssue({
        code: 'custom',
        message: 'The current question must be the latest turn.',
      });
    }
    if ((session.status === 'ended') !== (session.endedAt !== null)) {
      context.addIssue({
        code: 'custom',
        message: 'Session end state is inconsistent.',
      });
    }
    if (
      session.pendingFeedbackQuestionId &&
      !questionIds.has(session.pendingFeedbackQuestionId)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Pending feedback must refer to an included question.',
      });
    }
    const pendingTurn = session.turns.find(
      (turn) => turn.questionId === session.pendingFeedbackQuestionId,
    );
    const currentTurn = session.turns.at(-1)!;
    const previousTurn = session.turns.at(-2);
    if (currentTurn.answer !== null) {
      context.addIssue({
        code: 'custom',
        message: 'The current question must still be unanswered.',
      });
    }
    if (
      session.pendingFeedbackQuestionId &&
      (session.status !== 'active' ||
        !pendingTurn?.answer ||
        session.pendingFeedbackQuestionId !== previousTurn?.questionId)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Pending feedback state is inconsistent.',
      });
    }
    session.turns.forEach((turn, index) => {
      if (turn.turn !== index + 1) {
        context.addIssue({
          code: 'custom',
          message: 'Turns must be sequential.',
        });
      }
      const latest = turn.evaluationHistory.at(-1)?.evaluation ?? null;
      if (
        (turn.answer === null) !== (turn.evaluation === null) ||
        JSON.stringify(latest) !== JSON.stringify(turn.evaluation)
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Attempt and evaluation history are inconsistent.',
        });
      }
      turn.evaluationHistory.forEach((revision, revisionIndex) => {
        if (
          revision.revision !== revisionIndex + 1 ||
          (revisionIndex === 0) !== (revision.challengeRationale === null)
        ) {
          context.addIssue({
            code: 'custom',
            message: 'Evaluation revisions are inconsistent.',
          });
        }
        if (
          turn.answer &&
          revision.evaluation.evidence.some(
            (evidence) => !turn.answer!.includes(evidence.excerpt),
          )
        ) {
          context.addIssue({
            code: 'custom',
            message:
              'Evaluation evidence must quote the learner answer exactly.',
          });
        }
      });
      turn.help.forEach((help, helpIndex) => {
        if (help.ordinal !== helpIndex + 1) {
          context.addIssue({
            code: 'custom',
            message: 'Help responses must be sequential.',
          });
        }
        const previousHelp = turn.help[helpIndex - 1];
        const levelIndex = helpLevels.indexOf(help.level);
        const previousLevelIndex = previousHelp
          ? helpLevels.indexOf(previousHelp.level)
          : -1;
        const levelCount = turn.help
          .slice(0, helpIndex + 1)
          .filter((item) => item.level === help.level).length;
        if (
          (helpIndex === 0 && help.level !== 'rephrase') ||
          (helpIndex > 0 &&
            levelIndex !== previousLevelIndex &&
            levelIndex !== previousLevelIndex + 1) ||
          levelCount > (help.level === 'direct_explanation' ? 1 : 2)
        ) {
          context.addIssue({
            code: 'custom',
            message: 'Help responses do not follow the graduated help policy.',
          });
        }
      });
      if (index > 0) {
        const parentEvaluation =
          session.turns[index - 1]!.evaluationHistory.at(-1)?.evaluation;
        if (
          !parentEvaluation ||
          turn.question !== parentEvaluation.nextQuestion ||
          turn.intent !== parentEvaluation.nextQuestionRationale
        ) {
          context.addIssue({
            code: 'custom',
            message:
              'Each follow-up question must match its parent evaluation.',
          });
        }
      }
    });
  });

export const learningBackupSchema = z
  .object({
    format: z.literal(learningBackupFormat),
    formatVersion: z.literal(learningBackupFormatVersion),
    appVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    createdAt: z.iso.datetime(),
    sessions: z.array(localDataSessionSchema).max(10_000),
  })
  .strict()
  .superRefine((backup, context) => {
    const ids = new Set(backup.sessions.map((session) => session.id));
    if (ids.size !== backup.sessions.length) {
      context.addIssue({
        code: 'custom',
        message: 'Session IDs must be unique.',
      });
    }
  });

export type LocalDataSession = z.infer<typeof localDataSessionSchema>;
export type LearningBackup = z.infer<typeof learningBackupSchema>;

export type LocalDataOperationResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: 'export_failed' | 'invalid_backup' | 'restore_failed';
        message: string;
      };
    };

export type ExportLearningDataResult =
  { status: 'saved'; sessionCount: number } | { status: 'cancelled' };

export type RestoreLearningDataResult =
  | { status: 'restored'; imported: number; skipped: number }
  | { status: 'cancelled' };

export function toLocalDataSession(
  session: PersistedLearningSession,
): LocalDataSession {
  return {
    ...session,
    turns: session.turns.map((turn) => ({
      ...turn,
      help: turn.help.map(({ id, ordinal, level, content, createdAt }) => ({
        id,
        ordinal,
        level,
        content,
        createdAt,
      })),
    })),
  };
}

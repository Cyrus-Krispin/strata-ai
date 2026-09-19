import type {
  DiagnosticQuestion,
  EvaluationResult,
  HelpLevel,
  HelpResponse,
} from '../../learning/contracts.ts';
import { LearningFailure } from '../../learning/errors.ts';

export const e2eFakeProviderMarker = 'STRATA_E2E_BUILD_ONLY_PROVIDER';

export class E2eFakeLearningProvider {
  private evaluationAttempts = 0;

  async createDiagnosticQuestion(): Promise<DiagnosticQuestion> {
    return {
      question: 'Why can an index avoid scanning every row?',
      intent: 'Checks whether the learner understands indexed lookup.',
    };
  }

  async createHelpResponse(context: {
    level: HelpLevel;
  }): Promise<HelpResponse> {
    if (context.level === 'rephrase') {
      return {
        level: 'rephrase',
        content: 'What lets a database narrow the rows it checks?',
      };
    }
    throw new Error(`${e2eFakeProviderMarker}: unexpected help level`);
  }

  async evaluateAttempt(context: {
    answer: string;
  }): Promise<EvaluationResult> {
    this.evaluationAttempts += 1;
    if (this.evaluationAttempts === 1) {
      throw new LearningFailure(
        'provider_failed',
        `${e2eFakeProviderMarker}: planned first evaluation failure`,
        'The test provider paused once. Your answer is still here.',
      );
    }
    return this.evaluation(context.answer, 'partial');
  }

  async reconsiderEvaluation(context: {
    answer: string;
  }): Promise<EvaluationResult> {
    return this.evaluation(context.answer, 'demonstrated');
  }

  private evaluation(
    answer: string,
    status: EvaluationResult['status'],
  ): EvaluationResult {
    return {
      status,
      evidence: [
        {
          excerpt: answer,
          finding: 'Connects the index to avoiding a full row scan.',
        },
      ],
      concepts: [
        {
          name: 'Index lookup',
          assessment: status,
          evidenceOrdinal: 0,
        },
      ],
      unresolvedGap:
        status === 'partial'
          ? 'The lookup structure itself is not yet named.'
          : 'The write cost of maintaining the index remains open.',
      uncertainty: 'low',
      proposedNextMove: 'probe',
      nextQuestion: 'What write cost does maintaining an index add?',
      nextQuestionRationale:
        'Checks the main tradeoff after the lookup benefit.',
    };
  }
}

export function createBuildOnlyE2eProvider(): E2eFakeLearningProvider {
  return new E2eFakeLearningProvider();
}

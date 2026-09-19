import type {
  DiagnosticQuestion,
  EvaluationResult,
  HelpLevel,
  HelpResponse,
} from '../learning/contracts.ts';
import type {
  LearningSessionSummary,
  PersistedLearningSession,
} from '../learning/history.ts';
import type { RecentLearningEvidence } from '../learning/providerContext.ts';
import { LearningFailure } from '../learning/errors.ts';
import { maximumHelpResponses } from '../learning/helpPolicy.ts';
import type { KnowledgeGraphSnapshot } from '../learning/knowledgeGraph.ts';
import type { LearningSessionRepository } from './persistence/sessionRepository.ts';

type LearningProvider = {
  createDiagnosticQuestion(topic: string): Promise<DiagnosticQuestion>;
  evaluateAttempt(context: {
    topic: string;
    question: string;
    answer: string;
    recentEvidence: RecentLearningEvidence[];
  }): Promise<EvaluationResult>;
  createHelpResponse(context: {
    topic: string;
    question: string;
    level: HelpLevel;
    priorHelp: HelpResponse[];
  }): Promise<HelpResponse>;
  reconsiderEvaluation(context: {
    topic: string;
    question: string;
    answer: string;
    evaluation: EvaluationResult;
    rationale: string;
  }): Promise<EvaluationResult>;
};

type HelpInput = {
  requestId: string;
  sessionId: string;
  questionId: string;
  level: HelpLevel;
};
type ChallengeInput = {
  requestId: string;
  sessionId: string;
  questionId: string;
  evaluationId: string;
  rationale: string;
};

type SubmitAttemptInput = {
  sessionId: string;
  questionId: string;
  answer: string;
};

type AcknowledgeFeedbackInput = {
  sessionId: string;
  questionId: string;
};

export class LearningService {
  private readonly repository: LearningSessionRepository;
  private readonly createProvider: () =>
    LearningProvider | Promise<LearningProvider>;
  private readonly sessionOperationTails = new Map<string, Promise<void>>();
  private providerOperationTail: Promise<void> = Promise.resolve();

  constructor(
    repository: LearningSessionRepository,
    createProvider: () => LearningProvider | Promise<LearningProvider>,
  ) {
    this.repository = repository;
    this.createProvider = createProvider;
  }

  async startSession(topic: string): Promise<PersistedLearningSession> {
    const question = await this.runProviderOperation(async () => {
      const provider = await this.createProvider();
      return provider.createDiagnosticQuestion(topic);
    });
    return this.repository.createSession(topic, question);
  }

  async submitAttempt(
    input: SubmitAttemptInput,
  ): Promise<PersistedLearningSession> {
    return this.runSessionOperation(input.sessionId, async () => {
      const session = this.repository.getSession(input.sessionId);
      if (!session) throw new Error('Learning session not found.');
      const turn = session.turns.find(
        (item) => item.questionId === input.questionId,
      );
      if (!turn)
        throw new Error('Question not found in this learning session.');

      if (turn.answer !== null) {
        if (turn.answer !== input.answer) {
          throw new Error(
            'This question already has a different acknowledged answer.',
          );
        }
        return session;
      }

      if (session.pendingFeedbackQuestionId) {
        throw new Error('Feedback must be acknowledged before continuing.');
      }
      if (session.status !== 'active') {
        throw new Error('Learning session is not active.');
      }
      if (session.currentQuestionId !== input.questionId) {
        throw new Error(
          'The question is not current for this learning session.',
        );
      }

      const evaluation = await this.runProviderOperation(async () => {
        const provider = await this.createProvider();
        return provider.evaluateAttempt({
          topic: session.topic,
          question: turn.question,
          answer: input.answer,
          recentEvidence: session.turns
            .filter(
              (candidate) =>
                candidate.questionId !== input.questionId &&
                candidate.answer !== null &&
                candidate.evaluation !== null,
            )
            .slice(-3)
            .map((candidate) => ({
              question: candidate.question,
              status: candidate.evaluation!.status,
              evidenceFindings: candidate.evaluation!.evidence.map(
                (item) => item.finding,
              ),
              unresolvedGap: candidate.evaluation!.unresolvedGap,
            })),
        });
      });
      return this.repository.recordEvaluation({ ...input, evaluation });
    });
  }

  async requestHelp(input: HelpInput): Promise<PersistedLearningSession> {
    return this.runSessionOperation(input.sessionId, async () => {
      const acknowledged = this.repository.findSessionByHelpRequest(
        input.requestId,
      );
      if (acknowledged) return acknowledged;
      const session = this.repository.getSession(input.sessionId);
      if (
        !session ||
        session.status !== 'active' ||
        session.pendingFeedbackQuestionId ||
        session.currentQuestionId !== input.questionId
      )
        throw new Error(
          'The question is not current for this learning session.',
        );
      const turn = session.turns.find(
        (item) => item.questionId === input.questionId,
      )!;
      const levels: HelpLevel[] = [
        'rephrase',
        'smaller_question',
        'hint',
        'partial_example',
        'direct_explanation',
      ];
      const previous = turn.help.at(-1)?.level;
      const sameLevelCount = turn.help.filter(
        (item) => item.level === input.level,
      ).length;
      if (
        turn.help.length >= maximumHelpResponses ||
        sameLevelCount >= (input.level === 'direct_explanation' ? 1 : 2)
      ) {
        throw new LearningFailure(
          'invalid_request',
          'Help limit reached for this question.',
          'This help level has reached its limit. Try an answer or move to the next available level.',
        );
      }
      const allowed = previous
        ? [previous, levels[levels.indexOf(previous) + 1]].filter(Boolean)
        : ['rephrase'];
      if (!allowed.includes(input.level))
        throw new Error('This help level is not available yet.');
      const response = await this.runProviderOperation(async () => {
        const provider = await this.createProvider();
        return provider.createHelpResponse({
          topic: session.topic,
          question: turn.question,
          level: input.level,
          priorHelp: turn.help
            .slice(-5)
            .map(({ level, content }) => ({ level, content }) as HelpResponse),
        });
      });
      return this.repository.recordHelp({ ...input, response });
    });
  }

  async challengeEvaluation(
    input: ChallengeInput,
  ): Promise<PersistedLearningSession> {
    return this.runSessionOperation(input.sessionId, async () => {
      const acknowledged = this.repository.findSessionByChallengeRequest(
        input.requestId,
      );
      if (acknowledged) return acknowledged;
      const session = this.repository.getSession(input.sessionId);
      const turn = session?.turns.find(
        (item) => item.questionId === input.questionId,
      );
      const latest = turn?.evaluationHistory.at(-1);
      if (
        !session ||
        session.status !== 'active' ||
        session.pendingFeedbackQuestionId !== input.questionId ||
        !turn?.answer ||
        !latest ||
        latest.id !== input.evaluationId
      )
        throw new Error('The challenged evaluation is stale.');
      if (turn.evaluationHistory.length >= 3) {
        throw new LearningFailure(
          'invalid_request',
          'Challenge limit reached for this answer.',
          'This answer has reached the reconsideration limit. Continue with the latest saved judgment.',
        );
      }
      const answer = turn.answer;
      const evaluation = await this.runProviderOperation(async () => {
        const provider = await this.createProvider();
        return provider.reconsiderEvaluation({
          topic: session.topic,
          question: turn.question,
          answer,
          evaluation: latest.evaluation,
          rationale: input.rationale,
        });
      });
      return this.repository.recordChallenge({ ...input, evaluation });
    });
  }

  getSession(sessionId: string): PersistedLearningSession | null {
    return this.repository.getSession(sessionId);
  }

  listSessions(limit: number): LearningSessionSummary[] {
    return this.repository.listSessions(limit);
  }

  async endSession(sessionId: string): Promise<PersistedLearningSession> {
    return this.runSessionOperation(sessionId, () =>
      this.repository.endSession(sessionId),
    );
  }

  getKnowledgeGraph(limit: number): KnowledgeGraphSnapshot {
    return this.repository.getKnowledgeGraph(limit);
  }

  async acknowledgeFeedback(
    input: AcknowledgeFeedbackInput,
  ): Promise<PersistedLearningSession> {
    return this.runSessionOperation(input.sessionId, () =>
      this.repository.acknowledgeFeedback(input.sessionId, input.questionId),
    );
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    return this.runSessionOperation(sessionId, () =>
      this.repository.deleteSession(sessionId),
    );
  }

  private async runSessionOperation<T>(
    sessionId: string,
    work: () => Promise<T> | T,
  ): Promise<T> {
    const previous =
      this.sessionOperationTails.get(sessionId) ?? Promise.resolve();
    let release = () => {};
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.catch(() => undefined).then(() => current);
    this.sessionOperationTails.set(sessionId, tail);

    await previous.catch(() => undefined);
    try {
      return await work();
    } finally {
      release();
      if (this.sessionOperationTails.get(sessionId) === tail) {
        this.sessionOperationTails.delete(sessionId);
      }
    }
  }

  private runProviderOperation<T>(work: () => Promise<T>): Promise<T> {
    const operation = this.providerOperationTail.then(work, work);
    this.providerOperationTail = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }
}

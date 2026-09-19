import { z } from 'zod';

import type {
  LearningSessionSummary,
  PersistedLearningSession,
} from './history.ts';
import type { KnowledgeGraphSnapshot } from './knowledgeGraph.ts';
import { helpLevels } from './contracts.ts';
import { LearningFailure, type LearningErrorCode } from './errors.ts';
import type {
  ExportLearningDataResult,
  LocalDataOperationResult,
  RestoreLearningDataResult,
} from './localData.ts';

export type ProviderCredentialSource = 'secure_store' | 'environment';

export type ProviderStatus = {
  configured: boolean;
  model: string;
  source: ProviderCredentialSource | null;
  secureStorageAvailable: boolean | null;
  hasStoredCredential: boolean;
  problem?: string;
};

const topicRequestSchema = z
  .object({
    topic: z.string().trim().min(2).max(160),
  })
  .strict();

const providerCredentialRequestSchema = z
  .object({
    apiKey: z.string().trim().min(8).max(512),
  })
  .strict();

const sessionRequestSchema = z
  .object({
    sessionId: z.uuid(),
  })
  .strict();

const feedbackAcknowledgementRequestSchema = z
  .object({
    sessionId: z.uuid(),
    questionId: z.uuid(),
  })
  .strict();

const submitAttemptRequestSchema = z
  .object({
    sessionId: z.uuid(),
    questionId: z.uuid(),
    answer: z.string().min(1).max(12_000),
  })
  .strict();

const listSessionsRequestSchema = z
  .object({
    limit: z.number().int().min(1).max(50).default(20),
  })
  .strict();

const knowledgeGraphRequestSchema = z
  .object({
    limit: z.number().int().min(1).max(120).default(80),
  })
  .strict();

const helpRequestSchema = z
  .object({
    requestId: z.uuid(),
    sessionId: z.uuid(),
    questionId: z.uuid(),
    level: z.enum(helpLevels),
  })
  .strict();
const challengeRequestSchema = z
  .object({
    requestId: z.uuid(),
    sessionId: z.uuid(),
    questionId: z.uuid(),
    evaluationId: z.uuid(),
    rationale: z.string().trim().min(2).max(1000),
  })
  .strict();

export type TopicRequest = z.infer<typeof topicRequestSchema>;
export type ProviderCredentialRequest = z.infer<
  typeof providerCredentialRequestSchema
>;
export type SessionRequest = z.infer<typeof sessionRequestSchema>;
export type FeedbackAcknowledgementRequest = z.infer<
  typeof feedbackAcknowledgementRequestSchema
>;
export type SubmitAttemptRequest = z.infer<typeof submitAttemptRequestSchema>;
export type ListSessionsRequest = z.infer<typeof listSessionsRequestSchema>;
export type KnowledgeGraphRequest = z.infer<typeof knowledgeGraphRequestSchema>;
export type HelpRequest = z.infer<typeof helpRequestSchema>;
export type ChallengeRequest = z.infer<typeof challengeRequestSchema>;

export type LearningError = {
  code: LearningErrorCode;
  message: string;
};

export type LearningResult<T> =
  { ok: true; data: T } | { ok: false; error: LearningError };

export type StrataAiApi = {
  getProviderStatus(): Promise<ProviderStatus>;
  saveProviderCredential(
    request: ProviderCredentialRequest,
  ): Promise<LearningResult<ProviderStatus>>;
  removeProviderCredential(): Promise<LearningResult<ProviderStatus>>;
  openDeepSeekKeys(): Promise<void>;
  startSession(
    request: TopicRequest,
  ): Promise<LearningResult<PersistedLearningSession>>;
  submitAttempt(
    request: SubmitAttemptRequest,
  ): Promise<LearningResult<PersistedLearningSession>>;
  requestHelp(
    request: HelpRequest,
  ): Promise<LearningResult<PersistedLearningSession>>;
  challengeEvaluation(
    request: ChallengeRequest,
  ): Promise<LearningResult<PersistedLearningSession>>;
  acknowledgeFeedback(
    request: FeedbackAcknowledgementRequest,
  ): Promise<LearningResult<PersistedLearningSession>>;
  getSession(
    request: SessionRequest,
  ): Promise<LearningResult<PersistedLearningSession | null>>;
  listSessions(
    request?: Partial<ListSessionsRequest>,
  ): Promise<LearningResult<LearningSessionSummary[]>>;
  getKnowledgeGraph(
    request?: Partial<KnowledgeGraphRequest>,
  ): Promise<LearningResult<KnowledgeGraphSnapshot>>;
  endSession(
    request: SessionRequest,
  ): Promise<LearningResult<PersistedLearningSession>>;
  deleteSession(request: SessionRequest): Promise<LearningResult<boolean>>;
  exportLearningData(): Promise<
    LocalDataOperationResult<ExportLearningDataResult>
  >;
  restoreLearningData(): Promise<
    LocalDataOperationResult<RestoreLearningDataResult>
  >;
};

export function parseTopicRequest(value: unknown): TopicRequest {
  return topicRequestSchema.parse(value);
}

export function parseProviderCredentialRequest(
  value: unknown,
): ProviderCredentialRequest {
  return providerCredentialRequestSchema.parse(value);
}

export function normalizeProviderApiKey(value: string): string {
  return providerCredentialRequestSchema.shape.apiKey.parse(value);
}

export function parseSessionRequest(value: unknown): SessionRequest {
  return sessionRequestSchema.parse(value);
}

export function parseFeedbackAcknowledgementRequest(
  value: unknown,
): FeedbackAcknowledgementRequest {
  return feedbackAcknowledgementRequestSchema.parse(value);
}

export function parseSubmitAttemptRequest(
  value: unknown,
): SubmitAttemptRequest {
  return submitAttemptRequestSchema.parse(value);
}

export function parseListSessionsRequest(value: unknown): ListSessionsRequest {
  return listSessionsRequestSchema.parse(value ?? {});
}

export function parseKnowledgeGraphRequest(
  value: unknown,
): KnowledgeGraphRequest {
  return knowledgeGraphRequestSchema.parse(value ?? {});
}

export function parseHelpRequest(value: unknown): HelpRequest {
  return helpRequestSchema.parse(value);
}
export function parseChallengeRequest(value: unknown): ChallengeRequest {
  return challengeRequestSchema.parse(value);
}

export function toPublicLearningError(error: unknown): LearningError {
  if (error instanceof LearningFailure) {
    return {
      code: error.publicCode,
      message: error.publicMessage,
    };
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error.status === 401 || error.status === 403)
  ) {
    return {
      code: 'invalid_credential',
      message:
        'DeepSeek rejected this API key. Update it in provider settings.',
    };
  }

  if (error instanceof z.ZodError) {
    return {
      code: 'invalid_request',
      message: 'This learning step contains invalid or incomplete information.',
    };
  }

  return {
    code: 'provider_failed',
    message:
      'DeepSeek could not complete this step. Your answer is still here; please try again.',
  };
}

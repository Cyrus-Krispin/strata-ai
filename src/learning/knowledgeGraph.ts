import type { EvaluationResult } from './contracts.ts';

export type ConceptAssessment =
  EvaluationResult['concepts'][number]['assessment'];
export type KnowledgeSignalState =
  | 'strong'
  | 'developing'
  | 'fragile'
  | 'needs_attention';
export type KnowledgeTrend = 'improving' | 'steady' | 'slipping';

export type KnowledgeSignalEvidence = {
  status: ConceptAssessment;
  uncertainty: EvaluationResult['uncertainty'];
  observedAt: string;
};

export type KnowledgeGraphEvidence = KnowledgeSignalEvidence & {
  sessionId: string;
  questionId: string;
  topic: string;
  question: string;
  excerpt: string;
};

export type KnowledgeGraphNode = {
  id: string;
  label: string;
  signal: number;
  state: KnowledgeSignalState;
  trend: KnowledgeTrend;
  evidenceCount: number;
  sessionCount: number;
  lastSeenAt: string;
  latestEvidence: KnowledgeGraphEvidence;
};

export type KnowledgeGraphEdge = {
  source: string;
  target: string;
  evidenceCount: number;
  sessionCount: number;
  strength: number;
};

export type KnowledgeFrontier = {
  conceptId: string;
  reason: string;
} | null;

export type KnowledgeGraphSnapshot = {
  generatedAt: string;
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  frontier: KnowledgeFrontier;
  stats: {
    concepts: number;
    connections: number;
    observations: number;
    sessions: number;
  };
};

const statusValue: Record<ConceptAssessment, number> = {
  demonstrated: 0.9,
  partial: 0.58,
  uncertain: 0.38,
  misconception: 0.14,
};

const uncertaintyWeight: Record<
  EvaluationResult['uncertainty'],
  number
> = {
  low: 1,
  medium: 0.78,
  high: 0.55,
};

export function normalizeConceptName(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ');
}

function stateForScore(score: number): KnowledgeSignalState {
  if (score >= 0.78) return 'strong';
  if (score >= 0.52) return 'developing';
  if (score >= 0.28) return 'fragile';
  return 'needs_attention';
}

export function scoreKnowledgeSignal(
  evidence: KnowledgeSignalEvidence[],
  now = new Date(),
): {
  score: number;
  state: KnowledgeSignalState;
  trend: KnowledgeTrend;
} {
  if (evidence.length === 0) {
    return { score: 0, state: 'needs_attention', trend: 'steady' };
  }

  const ordered = [...evidence].sort((left, right) =>
    left.observedAt.localeCompare(right.observedAt),
  );
  const total = ordered.reduce((sum, item) => {
    const ageMilliseconds = Math.max(
      0,
      now.getTime() - new Date(item.observedAt).getTime(),
    );
    const ageDays = ageMilliseconds / 86_400_000;
    const freshness = 0.5 ** (ageDays / 60);
    return (
      sum +
      statusValue[item.status] *
        uncertaintyWeight[item.uncertainty] *
        (0.55 + 0.45 * freshness)
    );
  }, 0);
  const evidenceLift = Math.min(0.08, Math.log2(ordered.length) * 0.025);
  const score = Math.min(0.98, total / ordered.length + evidenceLift);
  const latest = ordered.at(-1)!;
  const previous = ordered.at(-2);
  const delta = previous
    ? statusValue[latest.status] - statusValue[previous.status]
    : 0;
  const trend: KnowledgeTrend =
    delta > 0.12 ? 'improving' : delta < -0.12 ? 'slipping' : 'steady';

  return {
    score: Number(score.toFixed(3)),
    state: stateForScore(score),
    trend,
  };
}

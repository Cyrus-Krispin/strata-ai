import type { EvaluationResult } from './contracts.ts';

export type ConceptAssessment =
  EvaluationResult['concepts'][number]['assessment'];
export type KnowledgeSignalState =
  'strong' | 'developing' | 'fragile' | 'needs_attention';
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

export type KnowledgeGraphPoint = {
  id: string;
  x: number;
  y: number;
};

const statusValue: Record<ConceptAssessment, number> = {
  demonstrated: 0.9,
  partial: 0.58,
  uncertain: 0.38,
  misconception: 0.14,
};

const uncertaintyWeight: Record<EvaluationResult['uncertainty'], number> = {
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

export function layoutKnowledgeGraph(
  nodes: KnowledgeGraphNode[],
  edges: KnowledgeGraphEdge[],
): KnowledgeGraphPoint[] {
  const width = 900;
  const height = 560;
  const ordered = [...nodes].sort((left, right) =>
    left.label.localeCompare(right.label),
  );
  const positions = new Map<string, { x: number; y: number }>(
    ordered.map((node, index): [string, { x: number; y: number }] => {
      const angle = index * 2.399963;
      const radius = 36 + Math.sqrt(index) * 72;
      return [
        node.id,
        {
          x: width / 2 + Math.cos(angle) * radius,
          y: height / 2 + Math.sin(angle) * radius * 0.72,
        },
      ];
    }),
  );

  for (let iteration = 0; iteration < 70; iteration += 1) {
    const movement = new Map(ordered.map((node) => [node.id, { x: 0, y: 0 }]));
    for (let leftIndex = 0; leftIndex < ordered.length; leftIndex += 1) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < ordered.length;
        rightIndex += 1
      ) {
        const left = positions.get(ordered[leftIndex].id)!;
        const right = positions.get(ordered[rightIndex].id)!;
        const dx = left.x - right.x;
        const dy = left.y - right.y;
        const distanceSquared = Math.max(900, dx * dx + dy * dy);
        const force = 5_200 / distanceSquared;
        movement.get(ordered[leftIndex].id)!.x += dx * force;
        movement.get(ordered[leftIndex].id)!.y += dy * force;
        movement.get(ordered[rightIndex].id)!.x -= dx * force;
        movement.get(ordered[rightIndex].id)!.y -= dy * force;
      }
    }
    for (const edge of edges) {
      const source = positions.get(edge.source);
      const target = positions.get(edge.target);
      if (!source || !target) continue;
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const force = (distance - 170) * 0.0023 * edge.strength;
      movement.get(edge.source)!.x += dx * force;
      movement.get(edge.source)!.y += dy * force;
      movement.get(edge.target)!.x -= dx * force;
      movement.get(edge.target)!.y -= dy * force;
    }
    for (const node of ordered) {
      const point = positions.get(node.id)!;
      const delta = movement.get(node.id)!;
      point.x = Math.min(
        width - 50,
        Math.max(50, point.x + delta.x + (width / 2 - point.x) * 0.006),
      );
      point.y = Math.min(
        height - 50,
        Math.max(50, point.y + delta.y + (height / 2 - point.y) * 0.006),
      );
    }
  }

  return ordered.map((node) => {
    const point = positions.get(node.id)!;
    return {
      id: node.id,
      x: Number(point.x.toFixed(2)),
      y: Number(point.y.toFixed(2)),
    };
  });
}

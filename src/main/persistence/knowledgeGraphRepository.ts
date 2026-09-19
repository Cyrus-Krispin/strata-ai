import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import type { EvaluationResult } from '../../learning/contracts.ts';
import {
  normalizeConceptName,
  scoreKnowledgeSignal,
  type KnowledgeGraphEdge,
  type KnowledgeGraphEvidence,
  type KnowledgeGraphNode,
  type KnowledgeGraphSnapshot,
} from '../../learning/knowledgeGraph.ts';

type ReplaceEvidenceInput = {
  sessionId: string;
  questionId: string;
  evaluationId: string;
  evaluation: EvaluationResult;
  observedAt: string;
};

type EvidenceRow = {
  concept_id: string;
  display_name: string;
  session_id: string;
  question_id: string;
  topic: string;
  question: string;
  status: KnowledgeGraphEvidence['status'];
  uncertainty: KnowledgeGraphEvidence['uncertainty'];
  evidence_excerpt: string;
  observed_at: string;
};

type EdgeRow = {
  source_concept_id: string;
  target_concept_id: string;
  evidence_count: number;
  session_count: number;
};

export class KnowledgeGraphRepository {
  private readonly database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.database = database;
  }

  replaceQuestionEvidence(input: ReplaceEvidenceInput): void {
    this.database
      .prepare('DELETE FROM concept_edges WHERE question_id = ?')
      .run(input.questionId);
    this.database
      .prepare('DELETE FROM concept_evidence WHERE question_id = ?')
      .run(input.questionId);

    const concepts = new Map<string, EvaluationResult['concepts'][number]>();
    for (const concept of input.evaluation.concepts ?? []) {
      const normalizedName = normalizeConceptName(concept.name);
      if (normalizedName.length >= 2 && !concepts.has(normalizedName)) {
        concepts.set(normalizedName, concept);
      }
    }

    const conceptIds: string[] = [];
    for (const [normalizedName, concept] of concepts) {
      const existing = this.database
        .prepare('SELECT id FROM concepts WHERE normalized_name = ?')
        .get(normalizedName) as { id: string } | undefined;
      const conceptId = existing?.id ?? randomUUID();
      if (existing) {
        this.database
          .prepare('UPDATE concepts SET updated_at = ? WHERE id = ?')
          .run(input.observedAt, conceptId);
      } else {
        this.database
          .prepare(
            `INSERT INTO concepts
              (id, normalized_name, display_name, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .run(
            conceptId,
            normalizedName,
            concept.name.trim(),
            input.observedAt,
            input.observedAt,
          );
      }

      const evidence = input.evaluation.evidence[concept.evidenceOrdinal];
      if (!evidence) continue;
      this.database
        .prepare(
          `INSERT INTO concept_evidence
            (concept_id, session_id, question_id, evaluation_id, status,
             uncertainty, evidence_excerpt, observed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          conceptId,
          input.sessionId,
          input.questionId,
          input.evaluationId,
          concept.assessment,
          input.evaluation.uncertainty,
          evidence.excerpt,
          input.observedAt,
        );
      conceptIds.push(conceptId);
    }

    const sortedIds = [...conceptIds].sort();
    const edgeStatement = this.database.prepare(
      `INSERT INTO concept_edges
        (question_id, source_concept_id, target_concept_id, session_id,
         evaluation_id, observed_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (let source = 0; source < sortedIds.length; source += 1) {
      for (let target = source + 1; target < sortedIds.length; target += 1) {
        edgeStatement.run(
          input.questionId,
          sortedIds[source],
          sortedIds[target],
          input.sessionId,
          input.evaluationId,
          input.observedAt,
        );
      }
    }
  }

  getSnapshot(
    options: { limit?: number; now?: Date } = {},
  ): KnowledgeGraphSnapshot {
    const now = options.now ?? new Date();
    const limit = Math.max(1, Math.min(options.limit ?? 80, 120));
    const evidenceRows = this.database
      .prepare(
        `SELECT ce.concept_id, c.display_name, ce.session_id, ce.question_id,
                s.topic, q.prompt AS question, ce.status, ce.uncertainty,
                ce.evidence_excerpt, ce.observed_at
         FROM concept_evidence ce
         JOIN concepts c ON c.id = ce.concept_id
         JOIN learning_sessions s ON s.id = ce.session_id
         JOIN questions q ON q.id = ce.question_id
         ORDER BY ce.observed_at ASC`,
      )
      .all() as EvidenceRow[];

    const grouped = new Map<string, EvidenceRow[]>();
    for (const row of evidenceRows) {
      const rows = grouped.get(row.concept_id) ?? [];
      rows.push(row);
      grouped.set(row.concept_id, rows);
    }

    const allNodes: KnowledgeGraphNode[] = [...grouped.entries()].map(
      ([conceptId, rows]) => {
        const latest = rows.at(-1)!;
        const signal = scoreKnowledgeSignal(
          rows.map((row) => ({
            status: row.status,
            uncertainty: row.uncertainty,
            observedAt: row.observed_at,
          })),
          now,
        );
        return {
          id: conceptId,
          label: latest.display_name,
          signal: signal.score,
          state: signal.state,
          trend: signal.trend,
          evidenceCount: rows.length,
          sessionCount: new Set(rows.map((row) => row.session_id)).size,
          lastSeenAt: latest.observed_at,
          latestEvidence: {
            sessionId: latest.session_id,
            questionId: latest.question_id,
            topic: latest.topic,
            question: latest.question,
            excerpt: latest.evidence_excerpt,
            status: latest.status,
            uncertainty: latest.uncertainty,
            observedAt: latest.observed_at,
          },
        };
      },
    );
    const nodes = allNodes
      .sort(
        (left, right) =>
          right.evidenceCount - left.evidenceCount ||
          right.lastSeenAt.localeCompare(left.lastSeenAt) ||
          left.label.localeCompare(right.label),
      )
      .slice(0, limit);
    const visibleIds = new Set(nodes.map((node) => node.id));
    const edgeRows = this.database
      .prepare(
        `SELECT source_concept_id, target_concept_id,
                COUNT(*) AS evidence_count,
                COUNT(DISTINCT session_id) AS session_count
         FROM concept_edges
         GROUP BY source_concept_id, target_concept_id`,
      )
      .all() as EdgeRow[];
    const edges: KnowledgeGraphEdge[] = edgeRows
      .filter(
        (row) =>
          visibleIds.has(row.source_concept_id) &&
          visibleIds.has(row.target_concept_id),
      )
      .map((row) => ({
        source: row.source_concept_id,
        target: row.target_concept_id,
        evidenceCount: row.evidence_count,
        sessionCount: row.session_count,
        strength: Number(
          Math.min(
            1,
            0.28 +
              Math.log2(row.evidence_count + 1) * 0.24 +
              row.session_count * 0.06,
          ).toFixed(3),
        ),
      }));

    return {
      generatedAt: now.toISOString(),
      nodes,
      edges,
      frontier: this.findFrontier(nodes, edges),
      stats: {
        concepts: nodes.length,
        connections: edges.length,
        observations: evidenceRows.length,
        sessions: new Set(evidenceRows.map((row) => row.session_id)).size,
      },
    };
  }

  private findFrontier(
    nodes: KnowledgeGraphNode[],
    edges: KnowledgeGraphEdge[],
  ): KnowledgeGraphSnapshot['frontier'] {
    if (nodes.length === 0) return null;
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const neighbours = new Map<string, KnowledgeGraphNode[]>();
    for (const edge of edges) {
      const source = byId.get(edge.source);
      const target = byId.get(edge.target);
      if (!source || !target) continue;
      neighbours.set(source.id, [...(neighbours.get(source.id) ?? []), target]);
      neighbours.set(target.id, [...(neighbours.get(target.id) ?? []), source]);
    }

    const ranked = nodes
      .filter((node) => node.state !== 'strong')
      .map((node) => {
        const connected = neighbours.get(node.id) ?? [];
        const strongest = connected.sort(
          (left, right) => right.signal - left.signal,
        )[0];
        return {
          node,
          strongest,
          priority:
            (1 - node.signal) *
            (0.7 + (strongest?.signal ?? 0)) *
            (1 + connected.length * 0.08),
        };
      })
      .sort(
        (left, right) =>
          right.priority - left.priority ||
          left.node.label.localeCompare(right.node.label),
      );
    const selected = ranked[0] ?? {
      node: [...nodes].sort((left, right) => left.signal - right.signal)[0],
      strongest: undefined,
    };
    const connection = selected.strongest;
    const statePhrase =
      selected.node.state === 'needs_attention'
        ? 'needs attention'
        : `is ${selected.node.state}`;
    return {
      conceptId: selected.node.id,
      reason: connection
        ? `${selected.node.label} ${statePhrase} and connects to stronger evidence in ${connection.label}.`
        : `${selected.node.label} has the least secure current evidence and is ready for another retrieval attempt.`,
    };
  }
}

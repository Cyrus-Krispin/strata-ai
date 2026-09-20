import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import type {
  DiagnosticQuestion,
  EvaluationResult,
  HelpResponse,
} from '../../learning/contracts.ts';
import type {
  LearningSessionSummary,
  PersistedLearningSession,
  PersistedSessionStatus,
  PersistedTurn,
} from '../../learning/history.ts';
import {
  toLocalDataSession,
  type LocalDataSession,
} from '../../learning/localData.ts';
import type { KnowledgeGraphSnapshot } from '../../learning/knowledgeGraph.ts';
import { KnowledgeGraphRepository } from './knowledgeGraphRepository.ts';

type RepositoryOptions = {
  createId?: () => string;
  now?: () => string;
};

type SessionRow = {
  id: string;
  topic: string;
  status: PersistedSessionStatus;
  started_at: string;
  updated_at: string;
  ended_at: string | null;
  current_question_id: string;
  pending_feedback_question_id: string | null;
};

type TurnRow = {
  question_id: string;
  turn_number: number;
  prompt: string;
  intent: string;
  answer: string | null;
  evaluation_id: string | null;
  status: EvaluationResult['status'] | null;
  uncertainty: EvaluationResult['uncertainty'] | null;
  proposed_next_move: EvaluationResult['proposedNextMove'] | null;
  unresolved_gap: string | null;
  next_question: string | null;
  next_question_rationale: string | null;
};

type EvaluationRow = TurnRow & {
  revision: number;
  created_at: string;
  challenge_rationale: string | null;
};

type SummaryRow = SessionRow & {
  answered_turns: number;
  total_questions: number;
  demonstrated_count: number;
  partial_count: number;
  misconception_count: number;
  uncertain_count: number;
};

export type RecordEvaluationInput = {
  sessionId: string;
  questionId: string;
  answer: string;
  evaluation: EvaluationResult;
};

export type RecordHelpInput = {
  requestId: string;
  sessionId: string;
  questionId: string;
  response: HelpResponse;
};

export type RecordChallengeInput = {
  requestId: string;
  sessionId: string;
  questionId: string;
  evaluationId: string;
  rationale: string;
  evaluation: EvaluationResult;
};

export class LearningSessionRepository {
  private readonly database: DatabaseSync;
  private readonly createId: () => string;
  private readonly now: () => string;
  private readonly knowledgeGraph: KnowledgeGraphRepository;

  constructor(database: DatabaseSync, options: RepositoryOptions = {}) {
    this.database = database;
    this.createId = options.createId ?? randomUUID;
    this.now = options.now ?? (() => new Date().toISOString());
    this.knowledgeGraph = new KnowledgeGraphRepository(database);
  }

  createSession(
    topicValue: string,
    diagnosticQuestion: DiagnosticQuestion,
  ): PersistedLearningSession {
    const topic = topicValue.trim();
    const sessionId = this.createId();
    const questionId = this.createId();
    const timestamp = this.now();

    this.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO learning_sessions
             (id, topic, status, current_question_id, started_at, updated_at, ended_at)
           VALUES (?, ?, 'active', NULL, ?, ?, NULL)`,
        )
        .run(sessionId, topic, timestamp, timestamp);
      this.database
        .prepare(
          `INSERT INTO questions
             (id, session_id, turn_number, prompt, intent, parent_evaluation_id, created_at)
           VALUES (?, ?, 1, ?, ?, NULL, ?)`,
        )
        .run(
          questionId,
          sessionId,
          diagnosticQuestion.question,
          diagnosticQuestion.intent,
          timestamp,
        );
      this.database
        .prepare(
          'UPDATE learning_sessions SET current_question_id = ? WHERE id = ?',
        )
        .run(questionId, sessionId);
    });

    return this.requireSession(sessionId);
  }

  findSessionByHelpRequest(requestId: string): PersistedLearningSession | null {
    const row = this.database
      .prepare('SELECT session_id FROM help_requests WHERE request_id = ?')
      .get(requestId) as { session_id: string } | undefined;
    return row ? this.requireSession(row.session_id) : null;
  }

  findSessionByChallengeRequest(
    requestId: string,
  ): PersistedLearningSession | null {
    const row = this.database
      .prepare(
        'SELECT session_id FROM evaluation_challenges WHERE request_id = ?',
      )
      .get(requestId) as { session_id: string } | undefined;
    return row ? this.requireSession(row.session_id) : null;
  }

  recordEvaluation(input: RecordEvaluationInput): PersistedLearningSession {
    const existing = this.database
      .prepare('SELECT answer FROM attempts WHERE question_id = ?')
      .get(input.questionId) as { answer: string } | undefined;
    if (existing) {
      if (existing.answer !== input.answer) {
        throw new Error(
          'This question already has a different acknowledged answer.',
        );
      }
      return this.requireSession(input.sessionId);
    }

    const session = this.getSessionRow(input.sessionId);
    if (!session) throw new Error('Learning session not found.');
    if (session.status !== 'active')
      throw new Error('Learning session is not active.');
    if (session.pending_feedback_question_id) {
      throw new Error('Feedback must be acknowledged before continuing.');
    }
    if (session.current_question_id !== input.questionId) {
      throw new Error('The question is not current for this learning session.');
    }

    const currentTurn = this.database
      .prepare(
        'SELECT turn_number FROM questions WHERE id = ? AND session_id = ?',
      )
      .get(input.questionId, input.sessionId) as
      { turn_number: number } | undefined;
    if (!currentTurn)
      throw new Error('Question not found in this learning session.');

    const attemptId = this.createId();
    const evaluationId = this.createId();
    const nextQuestionId = this.createId();
    const timestamp = this.now();

    this.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO attempts (id, session_id, question_id, answer, submitted_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          attemptId,
          input.sessionId,
          input.questionId,
          input.answer,
          timestamp,
        );
      this.database
        .prepare(
          `INSERT INTO evaluations
             (id, attempt_id, revision, status, uncertainty, proposed_next_move,
              unresolved_gap, next_question, next_question_rationale, created_at)
           VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          evaluationId,
          attemptId,
          input.evaluation.status,
          input.evaluation.uncertainty,
          input.evaluation.proposedNextMove,
          input.evaluation.unresolvedGap,
          input.evaluation.nextQuestion,
          input.evaluation.nextQuestionRationale,
          timestamp,
        );
      const evidenceStatement = this.database.prepare(
        `INSERT INTO evaluation_evidence (evaluation_id, ordinal, excerpt, finding)
         VALUES (?, ?, ?, ?)`,
      );
      input.evaluation.evidence.forEach((evidence, ordinal) => {
        evidenceStatement.run(
          evaluationId,
          ordinal,
          evidence.excerpt,
          evidence.finding,
        );
      });
      this.knowledgeGraph.replaceQuestionEvidence({
        sessionId: input.sessionId,
        questionId: input.questionId,
        evaluationId,
        evaluation: input.evaluation,
        observedAt: timestamp,
      });
      this.database
        .prepare(
          `INSERT INTO questions
             (id, session_id, turn_number, prompt, intent, parent_evaluation_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          nextQuestionId,
          input.sessionId,
          currentTurn.turn_number + 1,
          input.evaluation.nextQuestion,
          input.evaluation.nextQuestionRationale,
          evaluationId,
          timestamp,
        );
      this.database
        .prepare(
          `UPDATE learning_sessions
           SET current_question_id = ?, pending_feedback_question_id = ?,
               updated_at = ?
           WHERE id = ?`,
        )
        .run(nextQuestionId, input.questionId, timestamp, input.sessionId);
    });

    return this.requireSession(input.sessionId);
  }

  recordHelp(input: RecordHelpInput): PersistedLearningSession {
    const acknowledged = this.database
      .prepare('SELECT session_id FROM help_requests WHERE request_id = ?')
      .get(input.requestId) as { session_id: string } | undefined;
    if (acknowledged) return this.requireSession(acknowledged.session_id);

    const session = this.getSessionRow(input.sessionId);
    if (!session || session.status !== 'active')
      throw new Error('Learning session is not active.');
    if (session.pending_feedback_question_id)
      throw new Error('Feedback must be acknowledged before continuing.');
    if (session.current_question_id !== input.questionId)
      throw new Error('The question is not current for this learning session.');
    const ordinal =
      (
        this.database
          .prepare(
            'SELECT COUNT(*) AS count FROM help_requests WHERE question_id = ?',
          )
          .get(input.questionId) as { count: number }
      ).count + 1;
    this.database
      .prepare(
        `INSERT INTO help_requests
      (id, request_id, session_id, question_id, ordinal, level, content, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        this.createId(),
        input.requestId,
        input.sessionId,
        input.questionId,
        ordinal,
        input.response.level,
        input.response.content,
        this.now(),
      );
    return this.requireSession(input.sessionId);
  }

  recordChallenge(input: RecordChallengeInput): PersistedLearningSession {
    const acknowledged = this.database
      .prepare(
        'SELECT session_id FROM evaluation_challenges WHERE request_id = ?',
      )
      .get(input.requestId) as { session_id: string } | undefined;
    if (acknowledged) return this.requireSession(acknowledged.session_id);
    const session = this.getSessionRow(input.sessionId);
    if (!session || session.status !== 'active')
      throw new Error('Learning session is not active.');
    if (session.pending_feedback_question_id !== input.questionId)
      throw new Error('The challenged evaluation is no longer current.');
    const current = this.database
      .prepare(
        `SELECT e.id, e.attempt_id, e.revision
      FROM evaluations e JOIN attempts a ON a.id = e.attempt_id
      WHERE a.question_id = ? ORDER BY e.revision DESC LIMIT 1`,
      )
      .get(input.questionId) as
      { id: string; attempt_id: string; revision: number } | undefined;
    if (!current || current.id !== input.evaluationId)
      throw new Error('The challenged evaluation is stale.');
    const child = this.database
      .prepare(
        `SELECT id FROM questions
      WHERE session_id = ? AND parent_evaluation_id = ?`,
      )
      .get(input.sessionId, input.evaluationId) as { id: string } | undefined;
    if (!child || child.id !== session.current_question_id)
      throw new Error('The next question is no longer available for revision.');
    const attempted = this.database
      .prepare('SELECT 1 AS found FROM attempts WHERE question_id = ?')
      .get(child.id);
    if (attempted) throw new Error('An attempted question cannot be revised.');

    const evaluationId = this.createId();
    const challengeId = this.createId();
    const timestamp = this.now();
    this.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO evaluations
        (id, attempt_id, revision, status, uncertainty, proposed_next_move, unresolved_gap, next_question, next_question_rationale, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          evaluationId,
          current.attempt_id,
          current.revision + 1,
          input.evaluation.status,
          input.evaluation.uncertainty,
          input.evaluation.proposedNextMove,
          input.evaluation.unresolvedGap,
          input.evaluation.nextQuestion,
          input.evaluation.nextQuestionRationale,
          timestamp,
        );
      const evidenceStatement = this.database
        .prepare(`INSERT INTO evaluation_evidence
        (evaluation_id, ordinal, excerpt, finding) VALUES (?, ?, ?, ?)`);
      input.evaluation.evidence.forEach((item, ordinal) =>
        evidenceStatement.run(
          evaluationId,
          ordinal,
          item.excerpt,
          item.finding,
        ),
      );
      this.knowledgeGraph.replaceQuestionEvidence({
        sessionId: input.sessionId,
        questionId: input.questionId,
        evaluationId,
        evaluation: input.evaluation,
        observedAt: timestamp,
      });
      this.database
        .prepare(
          `INSERT INTO evaluation_challenges
        (id, request_id, session_id, question_id, challenged_evaluation_id, resulting_evaluation_id, rationale, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          challengeId,
          input.requestId,
          input.sessionId,
          input.questionId,
          input.evaluationId,
          evaluationId,
          input.rationale,
          timestamp,
        );
      this.database
        .prepare(
          `UPDATE questions SET prompt = ?, intent = ?, parent_evaluation_id = ? WHERE id = ?`,
        )
        .run(
          input.evaluation.nextQuestion,
          input.evaluation.nextQuestionRationale,
          evaluationId,
          child.id,
        );
      this.database
        .prepare('UPDATE learning_sessions SET updated_at = ? WHERE id = ?')
        .run(timestamp, input.sessionId);
    });
    return this.requireSession(input.sessionId);
  }

  endSession(sessionId: string): PersistedLearningSession {
    const session = this.requireSession(sessionId);
    if (session.status === 'ended') return session;
    const timestamp = this.now();
    this.database
      .prepare(
        `UPDATE learning_sessions
         SET status = 'ended', pending_feedback_question_id = NULL,
             updated_at = ?, ended_at = ?
         WHERE id = ?`,
      )
      .run(timestamp, timestamp, sessionId);
    return this.requireSession(sessionId);
  }

  acknowledgeFeedback(
    sessionId: string,
    questionId: string,
  ): PersistedLearningSession {
    const session = this.requireSession(sessionId);
    if (session.status !== 'active')
      throw new Error('Learning session is not active.');
    if (!session.pendingFeedbackQuestionId) return session;
    if (session.pendingFeedbackQuestionId !== questionId)
      throw new Error('This feedback is no longer awaiting acknowledgement.');

    this.database
      .prepare(
        `UPDATE learning_sessions
         SET pending_feedback_question_id = NULL, updated_at = ?
         WHERE id = ?`,
      )
      .run(this.now(), sessionId);
    return this.requireSession(sessionId);
  }

  getSession(sessionId: string): PersistedLearningSession | null {
    const session = this.getSessionRow(sessionId);
    if (!session) return null;

    const rows = this.database
      .prepare(
        `SELECT q.id AS question_id, q.turn_number, q.prompt, q.intent,
                a.answer, e.id AS evaluation_id, e.status, e.uncertainty,
                e.proposed_next_move, e.unresolved_gap, e.next_question,
                e.next_question_rationale
         FROM questions q
         LEFT JOIN attempts a ON a.question_id = q.id
         LEFT JOIN evaluations e ON e.id = (
           SELECT latest.id
           FROM evaluations latest
           WHERE latest.attempt_id = a.id
           ORDER BY latest.revision DESC
           LIMIT 1
         )
         WHERE q.session_id = ?
         ORDER BY q.turn_number ASC`,
      )
      .all(sessionId) as TurnRow[];

    return {
      id: session.id,
      topic: session.topic,
      status: session.status,
      startedAt: session.started_at,
      updatedAt: session.updated_at,
      endedAt: session.ended_at,
      currentQuestionId: session.current_question_id,
      pendingFeedbackQuestionId:
        session.status === 'active'
          ? session.pending_feedback_question_id
          : null,
      turns: rows.map((row) => this.toTurn(row)),
    };
  }

  listSessions(limit: number): LearningSessionSummary[] {
    const rows = this.database
      .prepare(
        `SELECT s.id, s.topic, s.status, s.started_at, s.updated_at, s.ended_at,
                s.current_question_id,
                COUNT(DISTINCT q.id) AS total_questions,
                COUNT(DISTINCT a.id) AS answered_turns,
                SUM(CASE WHEN e.status = 'demonstrated' THEN 1 ELSE 0 END)
                  AS demonstrated_count,
                SUM(CASE WHEN e.status = 'partial' THEN 1 ELSE 0 END)
                  AS partial_count,
                SUM(CASE WHEN e.status = 'misconception' THEN 1 ELSE 0 END)
                  AS misconception_count,
                SUM(CASE WHEN e.status = 'uncertain' THEN 1 ELSE 0 END)
                  AS uncertain_count
         FROM learning_sessions s
         LEFT JOIN questions q ON q.session_id = s.id
         LEFT JOIN attempts a ON a.question_id = q.id
         LEFT JOIN evaluations e ON e.id = (
           SELECT latest.id
           FROM evaluations latest
           WHERE latest.attempt_id = a.id
           ORDER BY latest.revision DESC
           LIMIT 1
         )
         GROUP BY s.id
         ORDER BY s.updated_at DESC, s.started_at DESC
         LIMIT ?`,
      )
      .all(limit) as SummaryRow[];

    return rows.map((row) => ({
      id: row.id,
      topic: row.topic,
      status: row.status,
      startedAt: row.started_at,
      updatedAt: row.updated_at,
      endedAt: row.ended_at,
      answeredTurns: row.answered_turns,
      totalQuestions: row.total_questions,
      evaluationCounts: {
        demonstrated: row.demonstrated_count,
        partial: row.partial_count,
        misconception: row.misconception_count,
        uncertain: row.uncertain_count,
      },
    }));
  }

  listAllSessions(): PersistedLearningSession[] {
    const rows = this.database
      .prepare(
        `SELECT id FROM learning_sessions
         ORDER BY updated_at DESC, started_at DESC`,
      )
      .all() as Array<{ id: string }>;
    return rows.map((row) => this.requireSession(row.id));
  }

  importSessions(sessions: LocalDataSession[]): {
    imported: number;
    skipped: number;
  } {
    const pending: LocalDataSession[] = [];
    let skipped = 0;
    for (const session of sessions) {
      const existing = this.getSession(session.id);
      if (!existing) {
        pending.push(session);
      } else if (
        JSON.stringify(toLocalDataSession(existing)) === JSON.stringify(session)
      ) {
        skipped += 1;
      } else {
        throw new Error(
          'A session in this backup conflicts with current local history.',
        );
      }
    }

    this.transaction(() => {
      pending.forEach((session) => this.insertImportedSession(session));
    });
    return { imported: pending.length, skipped };
  }

  getKnowledgeGraph(limit: number): KnowledgeGraphSnapshot {
    return this.knowledgeGraph.getSnapshot({ limit });
  }

  deleteSession(sessionId: string): boolean {
    return this.transaction(() => {
      const result = this.database
        .prepare('DELETE FROM learning_sessions WHERE id = ?')
        .run(sessionId);
      if (result.changes === 1) this.knowledgeGraph.pruneOrphanedConcepts();
      return result.changes === 1;
    });
  }

  private getSessionRow(sessionId: string): SessionRow | null {
    return (
      (this.database
        .prepare(
          `SELECT id, topic, status, started_at, updated_at, ended_at,
                  current_question_id, pending_feedback_question_id
           FROM learning_sessions WHERE id = ?`,
        )
        .get(sessionId) as SessionRow | undefined) ?? null
    );
  }

  private insertImportedSession(session: LocalDataSession): void {
    this.database
      .prepare(
        `INSERT INTO learning_sessions
          (id, topic, status, current_question_id, pending_feedback_question_id,
           started_at, updated_at, ended_at)
         VALUES (?, ?, ?, NULL, NULL, ?, ?, ?)`,
      )
      .run(
        session.id,
        session.topic,
        session.status,
        session.startedAt,
        session.updatedAt,
        session.endedAt,
      );

    const questionInsert = this.database.prepare(
      `INSERT INTO questions
        (id, session_id, turn_number, prompt, intent, parent_evaluation_id, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?)`,
    );
    session.turns.forEach((turn, index) => {
      const previous = session.turns[index - 1];
      const createdAt =
        previous?.evaluationHistory.at(-1)?.createdAt ?? session.startedAt;
      questionInsert.run(
        turn.questionId,
        session.id,
        turn.turn,
        turn.question,
        turn.intent,
        createdAt,
      );
    });

    for (const turn of session.turns) {
      for (const help of turn.help) {
        this.database
          .prepare(
            `INSERT INTO help_requests
              (id, request_id, session_id, question_id, ordinal, level, content, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            help.id,
            this.createId(),
            session.id,
            turn.questionId,
            help.ordinal,
            help.level,
            help.content,
            help.createdAt,
          );
      }
      if (!turn.answer) continue;

      const attemptId = this.createId();
      this.database
        .prepare(
          `INSERT INTO attempts
            (id, session_id, question_id, answer, submitted_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          attemptId,
          session.id,
          turn.questionId,
          turn.answer,
          turn.evaluationHistory[0]!.createdAt,
        );
      for (const revision of turn.evaluationHistory) {
        const evaluation = revision.evaluation;
        this.database
          .prepare(
            `INSERT INTO evaluations
              (id, attempt_id, revision, status, uncertainty, proposed_next_move,
               unresolved_gap, next_question, next_question_rationale, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            revision.id,
            attemptId,
            revision.revision,
            evaluation.status,
            evaluation.uncertainty,
            evaluation.proposedNextMove,
            evaluation.unresolvedGap,
            evaluation.nextQuestion,
            evaluation.nextQuestionRationale,
            revision.createdAt,
          );
        const evidenceInsert = this.database.prepare(
          `INSERT INTO evaluation_evidence
            (evaluation_id, ordinal, excerpt, finding) VALUES (?, ?, ?, ?)`,
        );
        evaluation.evidence.forEach((item, ordinal) =>
          evidenceInsert.run(revision.id, ordinal, item.excerpt, item.finding),
        );
        if (revision.revision > 1) {
          const previous = turn.evaluationHistory[revision.revision - 2]!;
          this.database
            .prepare(
              `INSERT INTO evaluation_challenges
                (id, request_id, session_id, question_id,
                 challenged_evaluation_id, resulting_evaluation_id, rationale, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              this.createId(),
              this.createId(),
              session.id,
              turn.questionId,
              previous.id,
              revision.id,
              revision.challengeRationale,
              revision.createdAt,
            );
        }
      }
      const latestRevision = turn.evaluationHistory.at(-1)!;
      this.knowledgeGraph.replaceQuestionEvidence({
        sessionId: session.id,
        questionId: turn.questionId,
        evaluationId: latestRevision.id,
        evaluation: latestRevision.evaluation,
        observedAt: latestRevision.createdAt,
      });
    }

    session.turns.slice(1).forEach((turn, index) => {
      const parent = session.turns[index]!.evaluationHistory.at(-1);
      if (parent) {
        this.database
          .prepare('UPDATE questions SET parent_evaluation_id = ? WHERE id = ?')
          .run(parent.id, turn.questionId);
      }
    });
    this.database
      .prepare(
        `UPDATE learning_sessions
         SET current_question_id = ?, pending_feedback_question_id = ?
         WHERE id = ?`,
      )
      .run(
        session.currentQuestionId,
        session.pendingFeedbackQuestionId,
        session.id,
      );
  }

  private requireSession(sessionId: string): PersistedLearningSession {
    const session = this.getSession(sessionId);
    if (!session) throw new Error('Learning session not found.');
    return session;
  }

  private toTurn(row: TurnRow): PersistedTurn {
    let evaluation: EvaluationResult | null = null;
    if (row.evaluation_id) {
      const evidenceRows = this.database
        .prepare(
          `SELECT excerpt, finding FROM evaluation_evidence
           WHERE evaluation_id = ? ORDER BY ordinal ASC`,
        )
        .all(row.evaluation_id) as EvaluationResult['evidence'];
      const evidence = evidenceRows.map((item) => ({
        excerpt: item.excerpt,
        finding: item.finding,
      }));
      evaluation = {
        status: row.status!,
        evidence,
        concepts: this.getConceptAnnotations(row.evaluation_id, evidence),
        unresolvedGap: row.unresolved_gap!,
        uncertainty: row.uncertainty!,
        proposedNextMove: row.proposed_next_move!,
        nextQuestion: row.next_question!,
        nextQuestionRationale: row.next_question_rationale!,
      };
    }
    const evaluationRows = this.database
      .prepare(
        `SELECT e.id AS evaluation_id, e.revision, e.status, e.uncertainty,
      e.proposed_next_move, e.unresolved_gap, e.next_question, e.next_question_rationale, e.created_at,
      c.rationale AS challenge_rationale
      FROM attempts a JOIN evaluations e ON e.attempt_id = a.id
      LEFT JOIN evaluation_challenges c ON c.resulting_evaluation_id = e.id
      WHERE a.question_id = ? ORDER BY e.revision ASC`,
      )
      .all(row.question_id) as EvaluationRow[];
    const evaluationHistory = evaluationRows.map((item) => ({
      id: item.evaluation_id!,
      revision: item.revision,
      evaluation: this.toEvaluation(item),
      challengeRationale: item.challenge_rationale,
      createdAt: item.created_at,
    }));
    if (evaluationHistory.length)
      evaluation = evaluationHistory.at(-1)!.evaluation;
    const help = this.database
      .prepare(
        `SELECT id, request_id, ordinal, level, content, created_at
      FROM help_requests WHERE question_id = ? ORDER BY ordinal ASC`,
      )
      .all(row.question_id) as Array<{
      id: string;
      request_id: string;
      ordinal: number;
      level: HelpResponse['level'];
      content: string;
      created_at: string;
    }>;
    return {
      questionId: row.question_id,
      turn: row.turn_number,
      question: row.prompt,
      intent: row.intent,
      answer: row.answer,
      evaluation,
      evaluationHistory,
      help: help.map((item) => ({
        id: item.id,
        requestId: item.request_id,
        ordinal: item.ordinal,
        level: item.level,
        content: item.content,
        createdAt: item.created_at,
      })),
    };
  }

  private toEvaluation(row: TurnRow): EvaluationResult {
    const evidenceRows = this.database
      .prepare(
        `SELECT excerpt, finding FROM evaluation_evidence
      WHERE evaluation_id = ? ORDER BY ordinal ASC`,
      )
      .all(row.evaluation_id) as EvaluationResult['evidence'];
    const evidence = evidenceRows.map((item) => ({
      excerpt: item.excerpt,
      finding: item.finding,
    }));
    return {
      status: row.status!,
      evidence,
      concepts: this.getConceptAnnotations(row.evaluation_id!, evidence),
      unresolvedGap: row.unresolved_gap!,
      uncertainty: row.uncertainty!,
      proposedNextMove: row.proposed_next_move!,
      nextQuestion: row.next_question!,
      nextQuestionRationale: row.next_question_rationale!,
    };
  }

  private getConceptAnnotations(
    evaluationId: string,
    evidence: EvaluationResult['evidence'],
  ): EvaluationResult['concepts'] {
    const rows = this.database
      .prepare(
        `SELECT c.display_name AS name, ce.status AS assessment,
                ce.evidence_excerpt
         FROM concept_evidence ce
         JOIN concepts c ON c.id = ce.concept_id
         WHERE ce.evaluation_id = ?
         ORDER BY c.display_name ASC`,
      )
      .all(evaluationId) as Array<{
      name: string;
      assessment: EvaluationResult['concepts'][number]['assessment'];
      evidence_excerpt: string;
    }>;
    return rows.map((row) => ({
      name: row.name,
      assessment: row.assessment,
      evidenceOrdinal: Math.max(
        0,
        evidence.findIndex((item) => item.excerpt === row.evidence_excerpt),
      ),
    }));
  }

  private transaction<T>(work: () => T): T {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      this.database.exec('COMMIT');
      return result;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }
}

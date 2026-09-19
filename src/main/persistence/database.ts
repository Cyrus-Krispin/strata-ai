import { DatabaseSync } from 'node:sqlite';
import { chmodSync } from 'node:fs';
import { dirname } from 'node:path';

const migrations = [
  {
    version: 1,
    sql: `
      CREATE TABLE learning_sessions (
        id TEXT PRIMARY KEY,
        topic TEXT NOT NULL CHECK (length(topic) BETWEEN 2 AND 160),
        status TEXT NOT NULL CHECK (status IN ('active', 'ended')),
        current_question_id TEXT,
        started_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        ended_at TEXT,
        FOREIGN KEY (current_question_id) REFERENCES questions(id) ON DELETE SET NULL
      ) STRICT;

      CREATE TABLE questions (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        turn_number INTEGER NOT NULL CHECK (turn_number > 0),
        prompt TEXT NOT NULL CHECK (length(prompt) BETWEEN 5 AND 140),
        intent TEXT NOT NULL CHECK (length(intent) BETWEEN 5 AND 280),
        parent_evaluation_id TEXT,
        created_at TEXT NOT NULL,
        UNIQUE (session_id, turn_number),
        FOREIGN KEY (session_id) REFERENCES learning_sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_evaluation_id) REFERENCES evaluations(id) ON DELETE SET NULL
      ) STRICT;

      CREATE TABLE attempts (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        question_id TEXT NOT NULL UNIQUE,
        answer TEXT NOT NULL CHECK (length(answer) BETWEEN 1 AND 12000),
        submitted_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES learning_sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
      ) STRICT;

      CREATE TABLE evaluations (
        id TEXT PRIMARY KEY,
        attempt_id TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
        status TEXT NOT NULL CHECK (status IN ('demonstrated', 'partial', 'misconception', 'uncertain')),
        uncertainty TEXT NOT NULL CHECK (uncertainty IN ('low', 'medium', 'high')),
        proposed_next_move TEXT NOT NULL CHECK (proposed_next_move IN ('probe', 'advance', 'prerequisite', 'hint')),
        unresolved_gap TEXT NOT NULL CHECK (length(unresolved_gap) BETWEEN 5 AND 320),
        next_question TEXT NOT NULL CHECK (length(next_question) BETWEEN 5 AND 140),
        next_question_rationale TEXT NOT NULL CHECK (length(next_question_rationale) BETWEEN 5 AND 280),
        created_at TEXT NOT NULL,
        UNIQUE (attempt_id, revision),
        FOREIGN KEY (attempt_id) REFERENCES attempts(id) ON DELETE CASCADE
      ) STRICT;

      CREATE TABLE evaluation_evidence (
        evaluation_id TEXT NOT NULL,
        ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
        excerpt TEXT NOT NULL CHECK (length(excerpt) BETWEEN 1 AND 320),
        finding TEXT NOT NULL CHECK (length(finding) BETWEEN 5 AND 280),
        PRIMARY KEY (evaluation_id, ordinal),
        FOREIGN KEY (evaluation_id) REFERENCES evaluations(id) ON DELETE CASCADE
      ) STRICT;

      CREATE INDEX questions_session_idx ON questions(session_id, turn_number);
      CREATE INDEX attempts_session_idx ON attempts(session_id, submitted_at);
      CREATE INDEX sessions_updated_idx ON learning_sessions(updated_at DESC);
    `,
  },
  {
    version: 2,
    sql: `
      CREATE TABLE help_requests (
        id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL UNIQUE,
        session_id TEXT NOT NULL,
        question_id TEXT NOT NULL,
        ordinal INTEGER NOT NULL CHECK (ordinal > 0),
        level TEXT NOT NULL CHECK (level IN ('rephrase', 'smaller_question', 'hint', 'partial_example', 'direct_explanation')),
        content TEXT NOT NULL CHECK (length(content) BETWEEN 5 AND 1200),
        created_at TEXT NOT NULL,
        UNIQUE (question_id, ordinal),
        FOREIGN KEY (session_id) REFERENCES learning_sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
      ) STRICT;

      CREATE TABLE evaluation_challenges (
        id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL UNIQUE,
        session_id TEXT NOT NULL,
        question_id TEXT NOT NULL,
        challenged_evaluation_id TEXT NOT NULL,
        resulting_evaluation_id TEXT NOT NULL UNIQUE,
        rationale TEXT NOT NULL CHECK (length(rationale) BETWEEN 2 AND 1000),
        created_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES learning_sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
        FOREIGN KEY (challenged_evaluation_id) REFERENCES evaluations(id) ON DELETE CASCADE,
        FOREIGN KEY (resulting_evaluation_id) REFERENCES evaluations(id) ON DELETE CASCADE
      ) STRICT;

      CREATE INDEX help_question_idx ON help_requests(question_id, ordinal);
      CREATE INDEX challenges_question_idx ON evaluation_challenges(question_id, created_at);
    `,
  },
  {
    version: 3,
    sql: `
      ALTER TABLE learning_sessions
        ADD COLUMN pending_feedback_question_id TEXT
        REFERENCES questions(id) ON DELETE SET NULL;

      CREATE INDEX sessions_pending_feedback_idx
        ON learning_sessions(pending_feedback_question_id);
    `,
  },
  {
    version: 4,
    sql: `
      CREATE TABLE concepts (
        id TEXT PRIMARY KEY,
        normalized_name TEXT NOT NULL UNIQUE CHECK (length(normalized_name) BETWEEN 2 AND 80),
        display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 2 AND 48),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE concept_evidence (
        concept_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        question_id TEXT NOT NULL,
        evaluation_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('demonstrated', 'partial', 'misconception', 'uncertain')),
        uncertainty TEXT NOT NULL CHECK (uncertainty IN ('low', 'medium', 'high')),
        evidence_excerpt TEXT NOT NULL CHECK (length(evidence_excerpt) BETWEEN 1 AND 320),
        observed_at TEXT NOT NULL,
        PRIMARY KEY (question_id, concept_id),
        FOREIGN KEY (concept_id) REFERENCES concepts(id) ON DELETE CASCADE,
        FOREIGN KEY (session_id) REFERENCES learning_sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
        FOREIGN KEY (evaluation_id) REFERENCES evaluations(id) ON DELETE CASCADE
      ) STRICT;

      CREATE TABLE concept_edges (
        question_id TEXT NOT NULL,
        source_concept_id TEXT NOT NULL,
        target_concept_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        evaluation_id TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        PRIMARY KEY (question_id, source_concept_id, target_concept_id),
        CHECK (source_concept_id < target_concept_id),
        FOREIGN KEY (source_concept_id) REFERENCES concepts(id) ON DELETE CASCADE,
        FOREIGN KEY (target_concept_id) REFERENCES concepts(id) ON DELETE CASCADE,
        FOREIGN KEY (session_id) REFERENCES learning_sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
        FOREIGN KEY (evaluation_id) REFERENCES evaluations(id) ON DELETE CASCADE
      ) STRICT;

      CREATE INDEX concept_evidence_concept_idx
        ON concept_evidence(concept_id, observed_at DESC);
      CREATE INDEX concept_evidence_session_idx
        ON concept_evidence(session_id);
      CREATE INDEX concept_edges_source_idx
        ON concept_edges(source_concept_id, target_concept_id);
      CREATE INDEX concept_edges_target_idx
        ON concept_edges(target_concept_id, source_concept_id);
    `,
  },
] as const;

export function migrateLearningDatabase(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    ) STRICT;
  `);

  const applied = database
    .prepare('SELECT version FROM schema_migrations ORDER BY version ASC')
    .all() as Array<{ version: number }>;
  const versions = applied.map((item) => item.version);
  const contiguous = versions.every((version, index) => version === index + 1);
  const currentVersion = versions.at(-1) ?? 0;
  if (!contiguous || currentVersion > migrations.length) {
    throw new Error(
      'This learning database uses an unsupported migration history.',
    );
  }

  for (const migration of migrations) {
    if (migration.version <= currentVersion) continue;

    database.exec('BEGIN IMMEDIATE');
    try {
      database.exec(migration.sql);
      database
        .prepare(
          'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
        )
        .run(migration.version, new Date().toISOString());
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }
}

export function verifyLearningDatabase(database: DatabaseSync): void {
  const integrity = database.prepare('PRAGMA quick_check').all() as Array<{
    quick_check: string;
  }>;
  if (
    integrity.length !== 1 ||
    integrity[0]?.quick_check.toLowerCase() !== 'ok'
  ) {
    throw new Error('The learning database failed its integrity check.');
  }

  const foreignKeyViolations = database
    .prepare('PRAGMA foreign_key_check')
    .all();
  if (foreignKeyViolations.length > 0) {
    throw new Error('The learning database contains invalid relationships.');
  }
}

function verifyDatabaseIntegrity(database: DatabaseSync): void {
  const integrity = database.prepare('PRAGMA quick_check').all() as Array<{
    quick_check: string;
  }>;
  if (
    integrity.length !== 1 ||
    integrity[0]?.quick_check.toLowerCase() !== 'ok'
  ) {
    throw new Error('The learning database failed its integrity check.');
  }
}

function protectDatabaseFiles(path: string): void {
  chmodSync(dirname(path), 0o700);
  for (const candidate of [path, `${path}-wal`, `${path}-shm`]) {
    try {
      chmodSync(candidate, 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

export function openLearningDatabase(path: string): DatabaseSync {
  const database = new DatabaseSync(path);
  try {
    verifyDatabaseIntegrity(database);
    if (path !== ':memory:') protectDatabaseFiles(path);
    database.exec('PRAGMA foreign_keys = ON');
    database.exec('PRAGMA busy_timeout = 5000');
    database.exec('PRAGMA synchronous = NORMAL');
    if (path !== ':memory:') database.exec('PRAGMA journal_mode = WAL');
    migrateLearningDatabase(database);
    verifyLearningDatabase(database);
    if (path !== ':memory:') protectDatabaseFiles(path);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

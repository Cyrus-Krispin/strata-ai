# Strata AI

Strata AI is an early-stage, local-first desktop learning partner that finds the edge of a learner's understanding through adaptive Socratic questions. It asks one question at a time, evaluates the learner's own answer, and offers only the smallest useful amount of help.

The application contains a provider-backed learning loop: topic entry, an AI
diagnostic question, a learner answer, evidence-based AI feedback, and one
adaptive next question. Sessions, immutable attempts, and evaluation evidence
persist locally in SQLite and can be resumed, reviewed, ended, or deleted.
Learners can request progressively stronger help and challenge a model judgment;
both histories remain attributable and survive restart.

Every evaluated answer also grows a local, evidence-backed knowledge graph.
Concept signals account for uncertainty and age, repeated relationships
strengthen across sessions, and an explainable learning frontier highlights the
most useful concept to revisit next.

## Private alpha requirements

- macOS 13 Ventura or later on an Apple Silicon Mac
- An internet connection for the AI-backed learning actions
- A learner-owned DeepSeek account and API key; DeepSeek may charge for usage

Download the Apple Silicon ZIP from the release, unzip it, and move
**Strata AI.app** to Applications. Intel Macs are not supported. Internal alpha
builds are ad-hoc signed, not Apple-notarized. If macOS blocks the first launch,
use Finder to Control-click the app and choose **Open**; do not disable Gatekeeper.
Compare the release version and artifact verification result before opening a
build from another source.

Finder's **Get Info** panel must identify the current build as **Application
(Apple silicon)**. If macOS shows an Intel-app support warning, quit and remove any
older Strata AI copy before installing the current Apple Silicon artifact.

Export a backup from **Local data** before every upgrade. Report private-alpha
feedback and reproducible problems through
[GitHub Issues](https://github.com/Cyrus-Krispin/strata-ai/issues); never attach an
API key or an unredacted learning backup.

## Development prerequisites

- Node.js 24 or newer
- npm 11 or newer

## Development

Create your local environment file and add your DeepSeek API key:

```bash
cp .env.example .env
```

```dotenv
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-v4-flash
```

`.env` and `.env.*` are ignored by Git. Only `.env.example`, which contains no
secret, is committed. Restart Strata AI after changing the key.

Then install and start the application:

```bash
npm install
npm start
```

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run format:check
npm run package:e2e
npm run verify:packaged-flow
npm run package
npm run verify:artifact
npm run verify:packaged-onboarding
```

Create a local distributable after packaging succeeds:

```bash
npm run make
```

Internal builds are ad-hoc signed and intended only for local evaluation. Public
distribution requires Developer ID signing and Apple notarization; see the release
guide.

## Documentation

- [Product direction](docs/product-direction.md)
- [Product specification](docs/product-spec.md)
- [Architecture](docs/architecture.md)
- [Roadmap](docs/roadmap.md)
- [Decision log](docs/decision-log.md)
- [Privacy and data](docs/privacy-and-data.md)
- [Release, recovery, and rollback](docs/release-and-recovery.md)
- [Dependency security audit](docs/security-audit.md)
- [Changelog](CHANGELOG.md)
- [Local session persistence](docs/local-session-persistence.md)
- [Proposed adaptive learning controls](docs/adaptive-learning-controls.md)
- [Self-growing knowledge graph](docs/self-growing-knowledge-graph.md)
- [Implementation plan](tasks/plan.md)
- [Task checklist](tasks/todo.md)

## Current boundaries

- DeepSeek V4 Flash is the only provider and runs in non-thinking mode for the
  first fast, cost-conscious iteration
- Session history is stored locally in Electron's per-user application-data
  directory and remains available after an app restart
- Versioned learning backups can be exported and restored; there is no automatic
  backup or cloud sync
- Graph relationships currently mean observed co-occurrence, not inferred
  prerequisite or causal truth
- No accounts, cloud backend, or synchronization
- Local secrets remain ignored; a key is transiently entered in the trusted renderer,
  sent once over validated IPC, and only encrypted data is persisted

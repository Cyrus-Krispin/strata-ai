import { useEffect, useReducer, useRef, useState } from 'react';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import type { SxProps, Theme } from '@mui/material/styles';

import { FeedbackView } from './components/FeedbackView';
import { KnowledgeGraphView } from './components/KnowledgeGraphView';
import { QuestionView } from './components/QuestionView';
import { ProviderSettings } from './components/ProviderSettings';
import { SessionReview } from './components/SessionReview';
import { StartView } from './components/StartView';
import { StrataAiMark } from './components/StrataAiMark';
import {
  initialLearningSession,
  learningSessionReducer,
} from './learning/session.ts';
import type { LearningSessionSummary } from './learning/history.ts';
import type { KnowledgeGraphSnapshot } from './learning/knowledgeGraph.ts';
import type { HelpLevel } from './learning/contracts.ts';
import type { LearningError, ProviderStatus } from './learning/ipc.ts';
import { deleteLocalSession } from './learning/historyOperations.ts';
import { ProviderRequestGate } from './learning/providerRequestGate.ts';
import type {
  ExportLearningDataResult,
  LocalDataOperationResult,
  RestoreLearningDataResult,
} from './learning/localData.ts';

type ProviderState = ProviderStatus & {
  loading: boolean;
};

const centeredStateSx: SxProps<Theme> = {
  minHeight: 'calc(100vh - 4.5rem)',
  px: { xs: 2.5, sm: 6 },
  py: 6,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
};

const displayHeadingSx: SxProps<Theme> = {
  maxWidth: '16ch',
  fontSize: { xs: '2.6rem', sm: 'clamp(3rem, 5vw, 4.5rem)' },
  lineHeight: 1,
};

export function App() {
  const [provider, setProvider] = useState<ProviderState>({
    loading: true,
    configured: false,
    model: 'deepseek-v4-flash',
    source: null,
    secureStorageAvailable: null,
    hasStoredCredential: false,
  });
  const [session, dispatch] = useReducer(
    learningSessionReducer,
    initialLearningSession,
  );
  const [recentSessions, setRecentSessions] = useState<
    LearningSessionSummary[]
  >([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const [knowledgeGraph, setKnowledgeGraph] =
    useState<KnowledgeGraphSnapshot | null>(null);
  const [graphLoading, setGraphLoading] = useState(true);
  const [graphError, setGraphError] = useState('');
  const [showKnowledgeGraph, setShowKnowledgeGraph] = useState(false);
  const [localError, setLocalError] = useState('');
  const [providerBusy, setProviderBusy] = useState(false);
  const [providerError, setProviderError] = useState('');
  const [providerSettingsRequested, setProviderSettingsRequested] =
    useState(false);
  const [showProviderSettings, setShowProviderSettings] = useState(false);
  const [helpBusy, setHelpBusy] = useState(false);
  const [challengeBusy, setChallengeBusy] = useState(false);
  const [challengeError, setChallengeError] = useState('');
  const [continueBusy, setContinueBusy] = useState(false);
  const [continueError, setContinueError] = useState('');
  const [endError, setEndError] = useState('');
  const [providerRequestGate] = useState(() => new ProviderRequestGate());
  const helpRequest = useRef<{ level: HelpLevel; id: string } | null>(null);
  const challengeRequest = useRef<{
    evaluationId: string;
    rationale: string;
    id: string;
  } | null>(null);

  useEffect(() => {
    let active = true;
    void window.strataAi
      .getProviderStatus()
      .then((status) => {
        if (active) setProvider({ loading: false, ...status });
      })
      .catch(() => {
        if (active) {
          setProvider({
            loading: false,
            configured: false,
            model: 'deepseek-v4-flash',
            source: null,
            secureStorageAvailable: null,
            hasStoredCredential: false,
            problem: 'Provider settings could not be loaded. Reopen Strata AI.',
          });
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    void refreshKnowledgeGraph();
  }, []);

  useEffect(() => {
    let active = true;
    void window.strataAi
      .listSessions()
      .then((result) => {
        if (!active) return;
        if (result.ok) {
          setRecentSessions(result.data);
          setHistoryError('');
        } else {
          setHistoryError(
            "Couldn't load current local history. Retry to show the latest saved sessions.",
          );
        }
      })
      .catch(() => {
        if (active) {
          setHistoryError(
            "Couldn't load current local history. Retry to show the latest saved sessions.",
          );
        }
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [session.status, showKnowledgeGraph]);

  async function refreshSessions(): Promise<void> {
    setHistoryLoading(true);
    try {
      const result = await window.strataAi.listSessions();
      if (result.ok) {
        setRecentSessions(result.data);
        setHistoryError('');
      } else {
        setHistoryError(
          "Couldn't load current local history. Retry to show the latest saved sessions.",
        );
      }
    } catch {
      setHistoryError(
        "Couldn't load current local history. Retry to show the latest saved sessions.",
      );
    } finally {
      setHistoryLoading(false);
    }
  }

  async function refreshKnowledgeGraph(): Promise<void> {
    setGraphLoading(true);
    const result = await window.strataAi.getKnowledgeGraph();
    if (result.ok) {
      setKnowledgeGraph(result.data);
      setGraphError('');
    } else {
      setGraphError('The local knowledge map could not be loaded.');
    }
    setGraphLoading(false);
  }

  async function requestSessionStart(topic: string): Promise<void> {
    const result = await window.strataAi.startSession({ topic });
    if (result.ok) {
      dispatch({ type: 'session_started', session: result.data });
      await refreshSessions();
    } else {
      handleProviderFailure(result.error);
      dispatch({ type: 'request_failed', message: result.error.message });
    }
  }

  function handleProviderFailure(error: LearningError): void {
    if (!['invalid_credential', 'not_configured'].includes(error.code)) return;
    setProviderSettingsRequested(true);
    setProviderError(error.message);
  }

  async function saveProviderCredential(apiKey: string): Promise<boolean> {
    setProviderBusy(true);
    setProviderError('');
    try {
      const result = await window.strataAi.saveProviderCredential({ apiKey });
      if (result.ok) {
        setProvider({ loading: false, ...result.data });
        setProviderSettingsRequested(!result.data.configured);
        setShowProviderSettings(false);
        return true;
      }
      setProviderError(result.error.message);
      return false;
    } catch {
      setProviderError('The key could not be saved. Please try again.');
      return false;
    } finally {
      setProviderBusy(false);
    }
  }

  async function removeProviderCredential(): Promise<boolean> {
    if (
      !window.confirm(
        'Remove the saved DeepSeek API key from this Mac? Local learning history will remain.',
      )
    ) {
      return false;
    }
    setProviderBusy(true);
    setProviderError('');
    try {
      const result = await window.strataAi.removeProviderCredential();
      if (result.ok) {
        setProvider({ loading: false, ...result.data });
        setProviderSettingsRequested(!result.data.configured);
        return true;
      }
      setProviderError(result.error.message);
      return false;
    } catch {
      setProviderError('The saved key could not be removed. Please try again.');
      return false;
    } finally {
      setProviderBusy(false);
    }
  }

  async function openDeepSeekKeys(): Promise<void> {
    try {
      await window.strataAi.openDeepSeekKeys();
    } catch {
      setProviderError(
        'Could not open DeepSeek. Visit platform.deepseek.com to create a key.',
      );
    }
  }

  async function runProviderRequest(work: () => Promise<void>): Promise<void> {
    await providerRequestGate.run(work);
  }

  async function startSession(topic: string): Promise<void> {
    setShowKnowledgeGraph(false);
    await runProviderRequest(async () => {
      setEndError('');
      dispatch({ type: 'start', topic });
      await requestSessionStart(topic.trim());
    });
  }

  async function requestEvaluation(): Promise<void> {
    if (!session.answer.trim()) return;

    const request = {
      sessionId: session.sessionId,
      questionId: session.questionId,
      answer: session.answer,
    };
    dispatch({ type: 'submit' });
    const result = await window.strataAi.submitAttempt(request);

    if (result.ok) {
      dispatch({
        type: 'evaluation_persisted',
        session: result.data,
        submittedQuestionId: request.questionId,
      });
      await refreshSessions();
      await refreshKnowledgeGraph();
    } else {
      handleProviderFailure(result.error);
      dispatch({ type: 'request_failed', message: result.error.message });
    }
  }

  async function evaluateAnswer(): Promise<void> {
    await runProviderRequest(requestEvaluation);
  }

  async function retryRequest(): Promise<void> {
    await runProviderRequest(async () => {
      const retryStatus = session.retryStatus;
      dispatch({ type: 'retry' });
      if (retryStatus === 'loading_question') {
        await requestSessionStart(session.topic);
      } else if (retryStatus === 'evaluating') {
        await requestEvaluation();
      }
    });
  }

  async function openSession(sessionId: string): Promise<void> {
    setLocalError('');
    const result = await window.strataAi.getSession({ sessionId });
    if (result.ok && result.data) {
      dispatch({ type: 'session_loaded', session: result.data });
      return;
    }
    setLocalError(
      result.ok ? 'That local session no longer exists.' : result.error.message,
    );
    await refreshSessions();
  }

  async function endSession(): Promise<void> {
    if (!session.sessionId || operationBusy) return;
    setEndError('');
    const result = await window.strataAi.endSession({
      sessionId: session.sessionId,
    });
    if (result.ok) {
      setLocalError('');
      dispatch({ type: 'session_ended', session: result.data });
      await refreshSessions();
    } else {
      setEndError(result.error.message);
      setLocalError(result.error.message);
    }
  }

  async function continueSession(): Promise<void> {
    if (
      !session.sessionId ||
      !session.questionId ||
      continueBusy ||
      challengeBusy
    )
      return;
    setContinueBusy(true);
    setContinueError('');
    const result = await window.strataAi.acknowledgeFeedback({
      sessionId: session.sessionId,
      questionId: session.questionId,
    });
    if (result.ok) {
      setEndError('');
      dispatch({ type: 'feedback_acknowledged', session: result.data });
    } else {
      setContinueError(
        "Couldn't open the next question. Your feedback is still here; try again.",
      );
    }
    setContinueBusy(false);
  }

  async function deleteSession(sessionId: string): Promise<boolean> {
    setLocalError('');
    const outcome = await deleteLocalSession(window.strataAi, sessionId);
    if (outcome !== 'failed') {
      setRecentSessions((sessions) =>
        sessions.filter((session) => session.id !== sessionId),
      );
      await refreshSessions();
      await refreshKnowledgeGraph();
      return true;
    } else {
      setLocalError("Couldn't delete that local session. Please try again.");
      return false;
    }
  }

  async function exportLearningData(): Promise<
    LocalDataOperationResult<ExportLearningDataResult>
  > {
    return window.strataAi.exportLearningData();
  }

  async function restoreLearningData(): Promise<
    LocalDataOperationResult<RestoreLearningDataResult>
  > {
    const result = await window.strataAi.restoreLearningData();
    if (result.ok && result.data.status === 'restored') {
      await refreshSessions();
      await refreshKnowledgeGraph();
      requestAnimationFrame(() => {
        document.getElementById('recent-sessions-heading')?.focus();
      });
    }
    return result;
  }

  async function requestHelp(level: HelpLevel): Promise<void> {
    await runProviderRequest(() => performHelpRequest(level));
  }

  async function performHelpRequest(level: HelpLevel): Promise<void> {
    if (
      level === 'direct_explanation' &&
      !window.confirm(
        'Show the direct explanation? This is the final help level.',
      )
    )
      return;
    setHelpBusy(true);
    setLocalError('');
    if (helpRequest.current?.level !== level) {
      helpRequest.current = { level, id: crypto.randomUUID() };
    }
    const result = await window.strataAi.requestHelp({
      requestId: helpRequest.current.id,
      sessionId: session.sessionId,
      questionId: session.questionId,
      level,
    });
    if (result.ok) {
      dispatch({ type: 'help_persisted', session: result.data });
      setLocalError('');
      helpRequest.current = null;
    } else {
      handleProviderFailure(result.error);
      setLocalError(result.error.message);
    }
    setHelpBusy(false);
  }

  async function challengeEvaluation(rationale: string): Promise<void> {
    await runProviderRequest(() => performChallengeEvaluation(rationale));
  }

  async function performChallengeEvaluation(rationale: string): Promise<void> {
    if (continueBusy) return;
    const turn = session.history.find(
      (item) => item.questionId === session.questionId,
    );
    const evaluationId = turn?.evaluationHistory.at(-1)?.id;
    if (!evaluationId) return;
    setChallengeBusy(true);
    setChallengeError('');
    if (
      challengeRequest.current?.evaluationId !== evaluationId ||
      challengeRequest.current.rationale !== rationale
    ) {
      challengeRequest.current = {
        evaluationId,
        rationale,
        id: crypto.randomUUID(),
      };
    }
    const result = await window.strataAi.challengeEvaluation({
      requestId: challengeRequest.current.id,
      sessionId: session.sessionId,
      questionId: session.questionId,
      evaluationId,
      rationale,
    });
    if (result.ok) {
      dispatch({
        type: 'challenge_persisted',
        session: result.data,
        questionId: session.questionId,
      });
      challengeRequest.current = null;
      await refreshKnowledgeGraph();
    } else {
      handleProviderFailure(result.error);
      setChallengeError(result.error.message);
    }
    setChallengeBusy(false);
  }

  function returnHome(): void {
    if (operationBusy) return;
    dispatch({ type: 'restart' });
    setShowKnowledgeGraph(false);
    setLocalError('');
    setEndError('');
    void refreshSessions();
  }

  const sessionIsActive =
    Boolean(session.sessionId) &&
    !['idle', 'reviewing', 'ended'].includes(session.status);
  const operationBusy =
    ['loading_question', 'evaluating'].includes(session.status) ||
    helpBusy ||
    challengeBusy ||
    continueBusy;
  const learningEnabled = provider.configured && !providerSettingsRequested;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar
        component="header"
        position="sticky"
        color="transparent"
        elevation={0}
        sx={{
          bgcolor: 'rgba(242, 240, 232, 0.94)',
          borderBottom: '1px solid',
          borderColor: 'divider',
          backdropFilter: 'blur(12px)',
        }}
      >
        <Toolbar
          sx={{
            minHeight: '4.5rem',
            px: { xs: 2, sm: 4 },
            justifyContent: 'space-between',
            gap: 2,
          }}
        >
          <Button
            color="inherit"
            onClick={returnHome}
            aria-label="Return to Strata AI home"
            disabled={operationBusy}
            sx={{ minWidth: 0, px: 0.5, gap: 1.25 }}
          >
            <StrataAiMark />
            <Typography
              component="span"
              sx={{ fontWeight: 800, letterSpacing: '-0.02em' }}
            >
              Strata
            </Typography>
          </Button>
          {sessionIsActive && !showProviderSettings && (
            <Box
              sx={{
                display: { xs: 'none', sm: 'flex' },
                alignItems: 'center',
                gap: 1,
              }}
            >
              <Box
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  bgcolor: 'secondary.main',
                }}
              />
              <Typography
                color="text.secondary"
                sx={{
                  maxWidth: '34vw',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontSize: '0.78rem',
                }}
              >
                {session.topic} · Question {session.turn}
              </Typography>
            </Box>
          )}
          <Box>
            {showProviderSettings ? (
              <Button
                variant="text"
                color="inherit"
                type="button"
                onClick={() => setShowProviderSettings(false)}
              >
                Back to session
              </Button>
            ) : (
              providerSettingsRequested && (
                <Button
                  variant="text"
                  color="error"
                  type="button"
                  onClick={() => setShowProviderSettings(true)}
                  disabled={operationBusy}
                  sx={{ mr: sessionIsActive ? 1 : 0 }}
                >
                  Update API key
                </Button>
              )
            )}
            {sessionIsActive && !showProviderSettings && (
              <Button
                variant="text"
                color="inherit"
                type="button"
                onClick={() => void endSession()}
                disabled={operationBusy}
                sx={{
                  minWidth: 0,
                  px: 1,
                  color: 'text.secondary',
                  fontSize: '0.8rem',
                }}
              >
                Finish session
              </Button>
            )}
          </Box>
        </Toolbar>
      </AppBar>

      {showProviderSettings && !provider.loading && (
        <Box component="main" sx={{ px: { xs: 2.5, sm: 6 }, py: 6 }}>
          <Box sx={{ width: 'min(100%, 56rem)', mx: 'auto' }}>
            <Typography component="h1" variant="h1" sx={displayHeadingSx}>
              Update your API key.
            </Typography>
            <ProviderSettings
              provider={provider}
              busy={providerBusy}
              error={providerError}
              expanded
              onExpandedChange={(expanded) => {
                if (!expanded) setShowProviderSettings(false);
              }}
              onSave={saveProviderCredential}
              onRemove={removeProviderCredential}
              onOpenDeepSeekKeys={openDeepSeekKeys}
            />
          </Box>
        </Box>
      )}

      {!showProviderSettings && provider.loading && (
        <Box component="main" sx={centeredStateSx} aria-busy="true">
          <Typography component="h1" variant="h1" sx={displayHeadingSx}>
            Getting ready…
          </Typography>
        </Box>
      )}

      {!showProviderSettings &&
        !provider.loading &&
        session.status === 'idle' &&
        showKnowledgeGraph && (
          <KnowledgeGraphView
            snapshot={knowledgeGraph}
            loading={graphLoading}
            error={graphError}
            onRefresh={refreshKnowledgeGraph}
            onStartLearning={() => setShowKnowledgeGraph(false)}
          />
        )}

      {!showProviderSettings &&
        !provider.loading &&
        session.status === 'idle' &&
        !showKnowledgeGraph && (
          <>
            {localError && (
              <Typography role="alert" color="error" sx={{ px: 3, pt: 2 }}>
                {localError}
              </Typography>
            )}
            <StartView
              provider={provider}
              providerBusy={providerBusy}
              providerError={providerError}
              learningEnabled={learningEnabled}
              sessions={recentSessions}
              historyLoading={historyLoading}
              historyError={historyError}
              graphConceptCount={knowledgeGraph?.stats.concepts ?? 0}
              graphLoading={graphLoading}
              onStart={startSession}
              onOpenSession={openSession}
              onRetryHistory={refreshSessions}
              onDeleteSession={deleteSession}
              onSaveProviderCredential={saveProviderCredential}
              onRemoveProviderCredential={removeProviderCredential}
              onOpenDeepSeekKeys={openDeepSeekKeys}
              onExportLearningData={exportLearningData}
              onRestoreLearningData={restoreLearningData}
              onOpenKnowledgeGraph={() => setShowKnowledgeGraph(true)}
              providerSettingsInitiallyExpanded={providerSettingsRequested}
            />
          </>
        )}

      {!showProviderSettings && session.status === 'loading_question' && (
        <Box
          component="main"
          sx={centeredStateSx}
          aria-live="polite"
          aria-busy="true"
        >
          <Typography
            variant="overline"
            color="primary.main"
            sx={{ fontWeight: 800, letterSpacing: '0.14em' }}
          >
            {session.topic}
          </Typography>
          <Typography component="h1" variant="h1" sx={displayHeadingSx}>
            Finding the right first question…
          </Typography>
          <Typography
            color="text.secondary"
            sx={{ maxWidth: '30rem', mt: 2, lineHeight: 1.6 }}
          >
            Strata is choosing a question that reveals what you already
            understand and where to go next.
          </Typography>
          <LinearProgress
            aria-hidden="true"
            sx={{ width: 'min(20rem, 70vw)', mt: 6 }}
          />
        </Box>
      )}

      {!showProviderSettings &&
        session.status === 'error' &&
        !session.currentQuestion && (
          <Box component="main" sx={centeredStateSx} role="alert">
            <Typography component="h1" variant="h1" sx={displayHeadingSx}>
              Couldn't load a question
            </Typography>
            <Typography
              color="text.secondary"
              sx={{ maxWidth: '38rem', mt: 3, lineHeight: 1.7 }}
            >
              {session.errorMessage}
            </Typography>
            {!providerSettingsRequested && (
              <Button
                variant="contained"
                type="button"
                onClick={retryRequest}
                sx={{ mt: 3 }}
              >
                Retry · uses AI
              </Button>
            )}
            {providerSettingsRequested && (
              <Button
                variant="text"
                type="button"
                onClick={() => setShowProviderSettings(true)}
                sx={{ mt: 1 }}
              >
                Update API key
              </Button>
            )}
          </Box>
        )}

      {!showProviderSettings &&
        (['answering', 'evaluating'].includes(session.status) ||
          (session.status === 'error' && Boolean(session.currentQuestion))) && (
          <QuestionView
            topic={session.topic}
            turn={session.turn}
            question={session.currentQuestion}
            answer={session.answer}
            busy={session.status === 'evaluating'}
            aiBusy={session.status === 'evaluating' || helpBusy}
            error={
              localError ||
              (session.status === 'error' ? session.errorMessage : '')
            }
            canRetry={session.status === 'error'}
            aiAvailable={!providerSettingsRequested}
            onAnswerChange={(answer) =>
              dispatch({ type: 'answer_changed', answer })
            }
            onSubmit={evaluateAnswer}
            onRetry={retryRequest}
            help={
              session.history.find(
                (item) => item.questionId === session.questionId,
              )?.help ?? []
            }
            helpBusy={helpBusy || session.status === 'evaluating'}
            onRequestHelp={(level) => void requestHelp(level)}
          />
        )}

      {!showProviderSettings &&
        session.status === 'feedback' &&
        session.evaluation && (
          <FeedbackView
            topic={session.topic}
            turn={session.turn}
            question={session.currentQuestion}
            answer={session.answer}
            evaluation={session.evaluation}
            onContinue={() => void continueSession()}
            continueBusy={continueBusy}
            continueError={continueError}
            challengeBusy={challengeBusy}
            onEnd={() => void endSession()}
            endError={endError}
            aiAvailable={!providerSettingsRequested}
            evaluationHistory={
              session.history.find(
                (item) => item.questionId === session.questionId,
              )?.evaluationHistory ?? []
            }
            challengeError={challengeError}
            onChallenge={(rationale) => void challengeEvaluation(rationale)}
          />
        )}

      {!showProviderSettings && session.status === 'reviewing' && (
        <SessionReview
          topic={session.topic}
          turns={session.history}
          onDone={returnHome}
        />
      )}

      {!showProviderSettings && session.status === 'ended' && (
        <SessionReview
          topic={session.topic}
          turns={session.history}
          headingLabel="Session complete"
          actionLabel="Start a new topic"
          onDone={returnHome}
        />
      )}
    </Box>
  );
}

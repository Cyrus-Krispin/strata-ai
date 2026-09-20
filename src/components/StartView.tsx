import { type FormEvent, useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import type { LearningSessionSummary } from '../learning/history.ts';
import type { ProviderStatus } from '../learning/ipc.ts';
import type {
  ExportLearningDataResult,
  LocalDataOperationResult,
  RestoreLearningDataResult,
} from '../learning/localData.ts';
import { LocalDataSection } from './LocalDataSection';
import { ProviderSettings } from './ProviderSettings';
import { SessionHistory } from './SessionHistory';

const suggestions = [
  'How neural networks learn',
  'What derivatives really measure',
  'Why database indexes work',
];

const steps = [
  ['01', 'Start with an attempt'],
  ['02', 'Find the exact gap'],
  ['03', 'Take one step further'],
] as const;

type StartViewProps = {
  provider: ProviderStatus;
  providerBusy: boolean;
  providerError: string;
  learningEnabled: boolean;
  sessions: LearningSessionSummary[];
  historyLoading: boolean;
  historyError: string;
  graphConceptCount: number;
  graphLoading: boolean;
  onStart(topic: string): Promise<void>;
  onOpenSession(sessionId: string): Promise<void>;
  onRetryHistory(): Promise<void>;
  onDeleteSession(sessionId: string): Promise<boolean>;
  onSaveProviderCredential(apiKey: string): Promise<boolean>;
  onRemoveProviderCredential(): Promise<boolean>;
  onOpenDeepSeekKeys(): Promise<void>;
  onExportLearningData(): Promise<
    LocalDataOperationResult<ExportLearningDataResult>
  >;
  onRestoreLearningData(): Promise<
    LocalDataOperationResult<RestoreLearningDataResult>
  >;
  onOpenKnowledgeGraph(): void;
  providerSettingsInitiallyExpanded?: boolean;
};

export function StartView({
  provider,
  providerBusy,
  providerError,
  learningEnabled,
  sessions,
  historyLoading,
  historyError,
  graphConceptCount,
  graphLoading,
  onStart,
  onOpenSession,
  onRetryHistory,
  onDeleteSession,
  onSaveProviderCredential,
  onRemoveProviderCredential,
  onOpenDeepSeekKeys,
  onExportLearningData,
  onRestoreLearningData,
  onOpenKnowledgeGraph,
  providerSettingsInitiallyExpanded = false,
}: StartViewProps) {
  const [topic, setTopic] = useState('');
  const topicInputRef = useRef<HTMLInputElement>(null);
  const [providerSettingsExpanded, setProviderSettingsExpanded] = useState(
    !provider.configured || providerSettingsInitiallyExpanded,
  );

  useEffect(() => {
    if (learningEnabled) topicInputRef.current?.focus();
  }, [learningEnabled]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (learningEnabled && topic.trim().length >= 2) void onStart(topic);
  }

  return (
    <Box component="main" sx={{ px: { xs: 2, sm: 4 }, pb: 9 }}>
      <Box sx={{ width: 'min(100%, 72rem)', mx: 'auto' }}>
        <Box
          component="section"
          aria-labelledby="start-heading"
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              md: learningEnabled ? 'minmax(0, 1fr) 25rem' : '1fr',
            },
            gap: { xs: 5, md: 9 },
            alignItems: 'center',
            pt: { xs: 6, md: 9 },
            pb: { xs: 6, md: 8 },
          }}
        >
          <Box>
            <Typography
              variant="overline"
              color="primary.main"
              sx={{ fontWeight: 800, letterSpacing: '0.16em' }}
            >
              Adaptive learning, one question at a time
            </Typography>
            <Typography
              id="start-heading"
              component="h1"
              variant="h1"
              sx={{
                maxWidth: learningEnabled ? '13ch' : '18ch',
                mt: 2,
                fontSize: { xs: '3rem', sm: 'clamp(3.6rem, 7vw, 5.6rem)' },
                lineHeight: 0.96,
              }}
            >
              {learningEnabled
                ? 'Find the edge of what you know.'
                : 'First, connect DeepSeek.'}
            </Typography>
            <Typography
              color="text.secondary"
              sx={{
                maxWidth: '34rem',
                mt: 3,
                fontSize: '1.05rem',
                lineHeight: 1.7,
              }}
            >
              {learningEnabled
                ? 'Explain a topic in your own words. Strata listens for evidence, locates the gap, and chooses the most useful next question.'
                : 'Your key is encrypted on this Mac. Once connected, Strata can begin a focused learning session.'}
            </Typography>
          </Box>

          {learningEnabled && (
            <Box
              component="form"
              onSubmit={submit}
              sx={{
                p: { xs: 2.5, sm: 3 },
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 3,
                boxShadow: '0 18px 50px rgba(29, 41, 37, 0.07)',
              }}
            >
              <Typography
                component="label"
                htmlFor="topic-input"
                sx={{ fontWeight: 750 }}
              >
                What do you want to understand?
              </Typography>
              <Typography
                color="text.secondary"
                sx={{ mt: 0.75, fontSize: '0.84rem' }}
              >
                A concept, question, or skill is enough.
              </Typography>
              <TextField
                id="topic-input"
                fullWidth
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                autoFocus
                inputRef={topicInputRef}
                disabled={providerBusy}
                placeholder="e.g. Why gradient descent works"
                slotProps={{
                  htmlInput: {
                    'aria-label': 'Topic or question',
                    maxLength: 160,
                  },
                }}
                sx={{ mt: 2 }}
              />
              <Button
                fullWidth
                variant="contained"
                type="submit"
                disabled={providerBusy || topic.trim().length < 2}
                sx={{ mt: 1.5, minHeight: 48 }}
              >
                Start diagnostic · uses AI →
              </Button>
              <Typography
                color="text.secondary"
                sx={{ mt: 2.5, fontSize: '0.72rem', fontWeight: 750 }}
              >
                TRY AN EXAMPLE
              </Typography>
              <Box
                sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.75 }}
              >
                {suggestions.map((suggestion) => (
                  <Button
                    key={suggestion}
                    variant="text"
                    color="inherit"
                    type="button"
                    disabled={providerBusy}
                    onClick={() => {
                      setTopic(suggestion);
                      topicInputRef.current?.focus();
                    }}
                    sx={{
                      minHeight: 32,
                      px: 1,
                      color: 'text.secondary',
                      fontSize: '0.76rem',
                    }}
                  >
                    {suggestion}
                  </Button>
                ))}
              </Box>
            </Box>
          )}
        </Box>

        {!learningEnabled && (
          <Box sx={{ width: 'min(100%, 44rem)', mb: 7 }}>
            <ProviderSettings
              provider={provider}
              busy={providerBusy}
              error={providerError}
              expanded
              onExpandedChange={setProviderSettingsExpanded}
              onSave={onSaveProviderCredential}
              onRemove={onRemoveProviderCredential}
              onOpenDeepSeekKeys={onOpenDeepSeekKeys}
            />
          </Box>
        )}

        {learningEnabled && (
          <Box
            component="section"
            aria-label="How Strata works"
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
              borderTop: '1px solid',
              borderBottom: '1px solid',
              borderColor: 'divider',
            }}
          >
            {steps.map(([number, label], index) => (
              <Box
                key={number}
                sx={{
                  py: 2.5,
                  px: { xs: 0, sm: 2.5 },
                  borderTop: { xs: index ? '1px solid' : 0, sm: 0 },
                  borderLeft: { xs: 0, sm: index ? '1px solid' : 0 },
                  borderColor: 'divider',
                }}
              >
                <Typography
                  component="span"
                  color="secondary.main"
                  sx={{ mr: 1.5, fontSize: '0.75rem', fontWeight: 800 }}
                >
                  {number}
                </Typography>
                <Typography component="span" sx={{ fontWeight: 700 }}>
                  {label}
                </Typography>
              </Box>
            ))}
          </Box>
        )}

        {learningEnabled && (
          <ProviderSettings
            provider={provider}
            busy={providerBusy}
            error={providerError}
            expanded={providerSettingsExpanded}
            onExpandedChange={setProviderSettingsExpanded}
            onSave={onSaveProviderCredential}
            onRemove={onRemoveProviderCredential}
            onOpenDeepSeekKeys={onOpenDeepSeekKeys}
          />
        )}
        <Box
          sx={{
            mt: 5,
            py: 2.5,
            borderTop: '1px solid',
            borderBottom: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 3,
          }}
        >
          <Box>
            <Typography sx={{ fontWeight: 700 }}>Knowledge map</Typography>
            <Typography
              color="text.secondary"
              sx={{ mt: 0.25, fontSize: '0.78rem' }}
            >
              {graphLoading
                ? 'Tracing your evidence…'
                : graphConceptCount > 0
                  ? `${graphConceptCount} evidence-backed concepts are taking shape.`
                  : 'A living map that grows from what you can explain.'}
            </Typography>
          </Box>
          <Button
            variant="outlined"
            color="inherit"
            type="button"
            onClick={onOpenKnowledgeGraph}
            sx={{ flexShrink: 0 }}
          >
            Open map
          </Button>
        </Box>
        <SessionHistory
          sessions={sessions}
          loading={historyLoading}
          error={historyError}
          onOpen={onOpenSession}
          onDelete={onDeleteSession}
          onRetry={onRetryHistory}
        />
        <LocalDataSection
          onExport={onExportLearningData}
          onRestore={onRestoreLearningData}
        />
      </Box>
    </Box>
  );
}

import type { FormEvent } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { HelpLevel } from '../learning/contracts.ts';
import type { PersistedHelpResponse } from '../learning/history.ts';
import { HelpControls } from './HelpControls';

type QuestionViewProps = {
  topic: string;
  turn: number;
  question: string;
  answer: string;
  busy: boolean;
  aiBusy: boolean;
  aiAvailable: boolean;
  error: string;
  canRetry: boolean;
  onAnswerChange(answer: string): void;
  onSubmit(): Promise<void>;
  onRetry(): Promise<void>;
  help: PersistedHelpResponse[];
  helpBusy: boolean;
  onRequestHelp(level: HelpLevel): void;
};

export function QuestionView({
  topic,
  turn,
  question,
  answer,
  busy,
  aiBusy,
  aiAvailable,
  error,
  canRetry,
  onAnswerChange,
  onSubmit,
  onRetry,
  help,
  helpBusy,
  onRequestHelp,
}: QuestionViewProps) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (aiAvailable && !aiBusy && answer.trim()) void onSubmit();
  }

  return (
    <Box component="main" sx={{ px: { xs: 2, sm: 4 }, py: { xs: 4, md: 6 } }}>
      <Box sx={{ width: 'min(100%, 72rem)', mx: 'auto' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 5 }}>
          <Typography
            color="primary.main"
            sx={{ fontSize: '0.75rem', fontWeight: 800, whiteSpace: 'nowrap' }}
          >
            QUESTION {String(turn).padStart(2, '0')}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={Math.min(90, 18 + turn * 12)}
            aria-label={`Session progress, question ${turn}`}
            sx={{
              flex: 1,
              height: 3,
              bgcolor: 'divider',
              '& .MuiLinearProgress-bar': { bgcolor: 'secondary.main' },
            }}
          />
          <Typography
            color="text.secondary"
            sx={{
              display: { xs: 'none', sm: 'block' },
              fontSize: '0.75rem',
            }}
          >
            {topic}
          </Typography>
        </Box>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 18rem' },
            gap: { xs: 5, md: 7 },
            alignItems: 'start',
          }}
        >
          <Box component="section" aria-labelledby="active-question">
            <Typography
              id="active-question"
              component="h1"
              variant="h1"
              sx={{
                maxWidth: '20ch',
                fontSize: { xs: '2.5rem', sm: 'clamp(3rem, 5.5vw, 4.5rem)' },
                lineHeight: 1.03,
              }}
            >
              {question}
            </Typography>
            <Typography
              color="text.secondary"
              sx={{ mt: 2.5, lineHeight: 1.65 }}
            >
              Explain it as you understand it now. A rough answer is more useful
              than a polished guess.
            </Typography>
            <Box component="form" onSubmit={submit} sx={{ mt: 4 }}>
              <TextField
                label="Your explanation"
                value={answer}
                onChange={(event) => onAnswerChange(event.target.value)}
                multiline
                minRows={7}
                fullWidth
                disabled={busy}
                autoFocus
                placeholder="Think out loud here…"
                slotProps={{
                  input: { sx: { fontSize: '1.05rem', lineHeight: 1.7 } },
                }}
              />
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: { xs: 'column-reverse', sm: 'row' },
                  alignItems: { xs: 'stretch', sm: 'center' },
                  justifyContent: 'space-between',
                  gap: 2,
                  mt: 2,
                }}
              >
                <Typography color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                  Strata checks your reasoning, not your writing style.
                </Typography>
                <Button
                  variant="contained"
                  type="submit"
                  disabled={!aiAvailable || aiBusy || !answer.trim()}
                  sx={{ minHeight: 48, minWidth: { sm: 190 } }}
                >
                  {busy
                    ? 'Reading your answer…'
                    : 'Check my thinking · uses AI'}
                </Button>
              </Box>
            </Box>
            {error && (
              <Alert
                severity="error"
                variant="outlined"
                role="alert"
                action={
                  canRetry && aiAvailable ? (
                    <Button
                      color="error"
                      size="small"
                      type="button"
                      onClick={() => void onRetry()}
                    >
                      Try again · uses AI
                    </Button>
                  ) : undefined
                }
                sx={{ mt: 3, bgcolor: '#FAECE6' }}
              >
                {error}
              </Alert>
            )}
          </Box>
          <Box
            component="aside"
            sx={{
              p: 2.5,
              bgcolor: 'background.paper',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 2,
              position: { md: 'sticky' },
              top: { md: '6.5rem' },
            }}
          >
            <HelpControls
              help={help}
              busy={helpBusy}
              aiAvailable={aiAvailable}
              onRequest={onRequestHelp}
            />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

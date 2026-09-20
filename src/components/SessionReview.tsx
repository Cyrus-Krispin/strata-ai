import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import type { PersistedTurn } from '../learning/history.ts';
import { SessionSummary } from './SessionSummary';

type SessionReviewProps = {
  topic: string;
  turns: PersistedTurn[];
  onDone(): void;
  headingLabel?: string;
  actionLabel?: string;
};

export function SessionReview({
  topic,
  turns,
  onDone,
  headingLabel = 'Session history',
  actionLabel = 'Back to topics',
}: SessionReviewProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <Box
      component="main"
      sx={{ px: { xs: 2, sm: 4 }, py: { xs: 5, md: 8 }, pb: 10 }}
    >
      <Box sx={{ width: 'min(100%, 64rem)', mx: 'auto' }}>
        <Typography
          variant="overline"
          color="primary.main"
          sx={{ fontWeight: 800, letterSpacing: '0.14em' }}
        >
          {headingLabel}
        </Typography>
        <Typography
          component="h1"
          variant="h1"
          ref={headingRef}
          tabIndex={-1}
          sx={{
            mt: 1.5,
            maxWidth: '18ch',
            fontSize: { xs: '3rem', sm: '4.75rem' },
            lineHeight: 0.98,
          }}
        >
          {topic}
        </Typography>
        <Typography
          color="text.secondary"
          sx={{ mt: 2.5, maxWidth: '38rem', lineHeight: 1.65 }}
        >
          A record of what you explained, where the edge appeared, and the help
          you used.
        </Typography>
        <SessionSummary turns={turns} />
        <Typography
          component="h2"
          variant="h2"
          sx={{ mt: 8, fontSize: '1.65rem' }}
        >
          Your learning trail
        </Typography>
        <Stack spacing={1.25} sx={{ mt: 3 }}>
          {turns.map((turn) => (
            <Box
              key={turn.questionId}
              component="article"
              sx={{
                p: { xs: 2.5, sm: 3 },
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2,
              }}
            >
              <Typography color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                Question {turn.turn}
              </Typography>
              <Typography
                component="h3"
                variant="h2"
                sx={{ mt: 1, fontSize: '1.45rem' }}
              >
                {turn.question}
              </Typography>
              {turn.answer ? (
                <Typography sx={{ mt: 2.5, lineHeight: 1.7 }}>
                  {turn.answer}
                </Typography>
              ) : (
                <Typography color="text.secondary" sx={{ mt: 2.5 }}>
                  Not answered
                </Typography>
              )}
              {turn.evaluation && (
                <Box sx={{ mt: 3 }}>
                  <Chip size="small" label={turn.evaluation.status} />
                  <Typography
                    color="text.secondary"
                    sx={{ mt: 1.5, lineHeight: 1.6 }}
                  >
                    Gap: {turn.evaluation.unresolvedGap}
                  </Typography>
                </Box>
              )}
              {turn.help.length > 0 && (
                <Typography color="text.secondary" sx={{ mt: 2 }}>
                  Help used:{' '}
                  {turn.help
                    .map((item) => item.level.replace('_', ' '))
                    .join(' → ')}
                </Typography>
              )}
              {turn.evaluationHistory.length > 1 && (
                <Box sx={{ mt: 2 }}>
                  <Typography color="text.secondary">
                    Evaluation revisions: {turn.evaluationHistory.length}
                  </Typography>
                  {turn.evaluationHistory.slice(1).map((revision) => (
                    <Typography
                      key={revision.id}
                      color="text.secondary"
                      sx={{ mt: 0.5 }}
                    >
                      Challenge: {revision.challengeRationale}
                    </Typography>
                  ))}
                </Box>
              )}
            </Box>
          ))}
        </Stack>
        <Button
          variant="contained"
          type="button"
          onClick={onDone}
          sx={{ mt: 4 }}
        >
          {actionLabel}
        </Button>
      </Box>
    </Box>
  );
}
import { useEffect, useRef } from 'react';

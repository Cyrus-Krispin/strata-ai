import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import type { HelpLevel } from '../learning/contracts.ts';
import { getHelpPolicy, maximumHelpResponses } from '../learning/helpPolicy.ts';
import type { PersistedHelpResponse } from '../learning/history.ts';

const labels: Record<HelpLevel, string> = {
  rephrase: 'Rephrase it',
  smaller_question: 'Make it smaller',
  hint: 'Give a hint',
  partial_example: 'Show part of an example',
  direct_explanation: 'Explain it directly',
};

const descriptions: Record<HelpLevel, string> = {
  rephrase: 'Same challenge, clearer wording.',
  smaller_question: 'Break the idea into one smaller step.',
  hint: 'A nudge without revealing the answer.',
  partial_example: 'See the setup, then finish the thinking.',
  direct_explanation: 'Reveal the complete explanation.',
};

export function HelpControls({
  help,
  busy,
  aiAvailable,
  onRequest,
}: {
  help: PersistedHelpResponse[];
  busy: boolean;
  aiAvailable: boolean;
  onRequest(level: HelpLevel): void;
}) {
  const { current, next, canRepeat, canAdvance, terminal } =
    getHelpPolicy(help);

  return (
    <Box component="section" aria-labelledby="help-heading">
      <Typography
        id="help-heading"
        component="h2"
        sx={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.08em' }}
      >
        NEED A HAND?
      </Typography>
      <Typography
        color="text.secondary"
        sx={{ mt: 1, fontSize: '0.82rem', lineHeight: 1.55 }}
      >
        Help reveals one layer at a time. Your attempt stays yours.
      </Typography>
      <Stack spacing={1.25} sx={{ mt: 2.5 }}>
        {help.map((item, index) => (
          <Box
            key={item.id}
            sx={{
              p: 2,
              bgcolor: '#EDF3EF',
              border: '1px solid',
              borderColor: '#CDDAD4',
              borderRadius: 2,
            }}
            role={index === help.length - 1 ? 'status' : undefined}
            aria-live={index === help.length - 1 ? 'polite' : undefined}
            aria-atomic={index === help.length - 1 ? 'true' : undefined}
          >
            <Typography
              color="primary.main"
              sx={{ fontSize: '0.72rem', fontWeight: 800 }}
            >
              {labels[item.level]}
            </Typography>
            <Typography sx={{ mt: 0.75, fontSize: '0.9rem', lineHeight: 1.6 }}>
              {item.content}
            </Typography>
          </Box>
        ))}
      </Stack>
      {next && canAdvance && (
        <Box sx={{ mt: 2.5 }}>
          <Button
            fullWidth
            variant="outlined"
            disabled={busy || !aiAvailable}
            onClick={() => onRequest(next)}
            sx={{ justifyContent: 'flex-start' }}
          >
            {busy ? 'Preparing help…' : `${labels[next]} · uses AI`}
          </Button>
          <Typography
            color="text.secondary"
            sx={{ mt: 0.75, fontSize: '0.73rem', lineHeight: 1.45 }}
          >
            {descriptions[next]}
          </Typography>
        </Box>
      )}
      {current && canRepeat && (
        <Button
          disabled={busy || !aiAvailable}
          color="inherit"
          onClick={() => onRequest(current)}
          sx={{ mt: 1, minHeight: 32, px: 1, fontSize: '0.75rem' }}
        >
          Repeat this help · uses AI
        </Button>
      )}
      {(help.length >= maximumHelpResponses || terminal) && (
        <Typography color="text.secondary" sx={{ mt: 2, fontSize: '0.78rem' }}>
          You have reached the final help level. Try an answer when you are
          ready.
        </Typography>
      )}
    </Box>
  );
}

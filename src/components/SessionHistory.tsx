import { useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import type { LearningSessionSummary } from '../learning/history.ts';
import { shouldShowHistoryRows } from '../learning/presentation.ts';

type SessionHistoryProps = {
  sessions: LearningSessionSummary[];
  loading: boolean;
  error: string;
  onOpen(sessionId: string): Promise<void>;
  onDelete(sessionId: string): Promise<boolean>;
  onRetry(): Promise<void>;
};

function progressLabel(session: LearningSessionSummary): string {
  const counts = session.evaluationCounts;
  const parts = [
    counts.demonstrated ? `${counts.demonstrated} clear` : '',
    counts.partial ? `${counts.partial} developing` : '',
    counts.misconception ? `${counts.misconception} to revisit` : '',
    counts.uncertain ? `${counts.uncertain} uncertain` : '',
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'No answered questions yet';
}

export function SessionHistory({
  sessions,
  loading,
  error,
  onOpen,
  onDelete,
  onRetry,
}: SessionHistoryProps) {
  const [deleteTarget, setDeleteTarget] =
    useState<LearningSessionSummary | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteMessage, setDeleteMessage] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);

  async function confirmDelete(): Promise<void> {
    if (!deleteTarget) return;
    const deletedTopic = deleteTarget.topic;
    setDeleteBusy(true);
    setDeleteError('');
    const deleted = await onDelete(deleteTarget.id);
    if (deleted) {
      setDeleteTarget(null);
      setDeleteMessage(`Deleted ${deletedTopic} session.`);
      requestAnimationFrame(() => headingRef.current?.focus());
    } else setDeleteError("Couldn't delete this session. Please try again.");
    setDeleteBusy(false);
  }

  return (
    <Box
      component="section"
      aria-labelledby="recent-sessions-heading"
      sx={{ mt: { xs: 7, md: 9 } }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 2,
        }}
      >
        <Typography
          id="recent-sessions-heading"
          ref={headingRef}
          tabIndex={-1}
          component="h2"
          variant="h2"
          sx={{ fontSize: '1.75rem' }}
        >
          Continue learning
        </Typography>
        <Typography color="text.secondary" sx={{ fontSize: '0.78rem' }}>
          Stored only on this device
        </Typography>
      </Box>
      {deleteMessage && (
        <Typography role="status" color="text.secondary" sx={{ mt: 2 }}>
          {deleteMessage}
        </Typography>
      )}
      {loading && (
        <Typography color="text.secondary" sx={{ mt: 2, fontSize: '0.82rem' }}>
          Loading local history…
        </Typography>
      )}
      {!loading && error && (
        <Box role="alert" sx={{ mt: 2 }}>
          <Typography color="error" sx={{ fontSize: '0.82rem' }}>
            {error}
          </Typography>
          <Button type="button" onClick={() => void onRetry()} sx={{ mt: 1 }}>
            Retry local history
          </Button>
        </Box>
      )}
      {!loading && !error && sessions.length === 0 && (
        <Typography color="text.secondary" sx={{ mt: 2, fontSize: '0.82rem' }}>
          Your learning evidence will appear here.
        </Typography>
      )}
      {shouldShowHistoryRows(loading, error) && (
        <Stack spacing={1.25} sx={{ mt: 2.5 }}>
          {sessions.map((session) => (
            <Box
              key={session.id}
              sx={{
                p: { xs: 2, sm: 2.5 },
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr auto' },
                gap: 2,
                alignItems: 'center',
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2,
              }}
            >
              <Box>
                <Typography sx={{ fontWeight: 650 }}>
                  {session.topic}
                </Typography>
                <Typography
                  color="text.secondary"
                  sx={{ mt: 0.6, fontSize: '0.76rem', lineHeight: 1.5 }}
                >
                  {session.status === 'active' ? 'In progress' : 'Completed'} ·{' '}
                  {session.answeredTurns} answered · {progressLabel(session)}
                </Typography>
              </Box>
              <Stack direction="row" spacing={1}>
                <Button
                  variant={
                    session.status === 'active' ? 'contained' : 'outlined'
                  }
                  color="primary"
                  type="button"
                  onClick={() => void onOpen(session.id)}
                >
                  {session.status === 'active' ? 'Continue' : 'Review'}
                </Button>
                <Button
                  variant="text"
                  color="inherit"
                  type="button"
                  onClick={() => {
                    setDeleteError('');
                    setDeleteTarget(session);
                  }}
                  aria-label={`Delete ${session.topic} session`}
                >
                  Delete
                </Button>
              </Stack>
            </Box>
          ))}
        </Stack>
      )}

      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => {
          if (!deleteBusy) {
            setDeleteError('');
            setDeleteTarget(null);
          }
        }}
      >
        <DialogTitle>Delete this local session?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {deleteTarget?.topic} and all of its answers and evaluation evidence
            will be removed from Strata AI on this device. Exported backups and
            operating-system copies are not removed.
          </DialogContentText>
          {deleteError && (
            <Typography role="alert" color="error" sx={{ mt: 2 }}>
              {deleteError}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            type="button"
            color="inherit"
            disabled={deleteBusy}
            onClick={() => {
              setDeleteError('');
              setDeleteTarget(null);
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            color="error"
            disabled={deleteBusy}
            onClick={() => void confirmDelete()}
          >
            {deleteBusy ? 'Deleting…' : 'Delete session'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';

import type {
  KnowledgeGraphNode,
  KnowledgeGraphSnapshot,
} from '../learning/knowledgeGraph.ts';

type KnowledgeConceptPanelProps = {
  node: KnowledgeGraphNode;
  snapshot: KnowledgeGraphSnapshot;
};

function sentenceCase(value: string): string {
  return value
    .replace('_', ' ')
    .replace(/^./u, (letter) => letter.toUpperCase());
}

export function KnowledgeConceptPanel({
  node,
  snapshot,
}: KnowledgeConceptPanelProps) {
  const isFrontier = snapshot.frontier?.conceptId === node.id;
  const observed = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(node.lastSeenAt));

  return (
    <Box
      component="aside"
      aria-live="polite"
      sx={{
        borderTop: { xs: '1px solid', md: 0 },
        borderLeft: { xs: 0, md: '1px solid' },
        borderColor: 'divider',
        pt: { xs: 3, md: 0 },
        pl: { xs: 0, md: 4 },
      }}
    >
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        <Chip
          label={sentenceCase(node.state)}
          size="small"
          variant="outlined"
        />
        {isFrontier && <Chip label="Learning frontier" size="small" />}
      </Box>
      <Typography component="h2" variant="h4" sx={{ letterSpacing: '-0.03em' }}>
        {node.label}
      </Typography>
      <Box sx={{ mt: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Knowledge signal
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 750 }}>
            {Math.round(node.signal * 100)}
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={node.signal * 100}
          aria-label={`${node.label} knowledge signal`}
          sx={{ height: 7, borderRadius: 0 }}
        />
        <Typography
          color="text.secondary"
          sx={{ mt: 1.25, fontSize: '0.76rem' }}
        >
          Evidence-weighted, uncertainty-adjusted, and time-aware—not a mastery
          percentage.
        </Typography>
      </Box>

      {isFrontier && snapshot.frontier && (
        <Box sx={{ mt: 3, p: 2, bgcolor: 'rgba(36, 38, 34, 0.055)' }}>
          <Typography variant="overline" sx={{ fontWeight: 750 }}>
            Why this is next
          </Typography>
          <Typography sx={{ mt: 0.5, lineHeight: 1.6, fontSize: '0.88rem' }}>
            {snapshot.frontier.reason}
          </Typography>
        </Box>
      )}

      <Divider sx={{ my: 3 }} />
      <Typography
        variant="overline"
        color="text.secondary"
        sx={{ fontWeight: 750 }}
      >
        Latest evidence
      </Typography>
      <Typography sx={{ mt: 1, fontSize: '0.82rem', color: 'text.secondary' }}>
        {node.latestEvidence.topic} · {observed}
      </Typography>
      <Typography sx={{ mt: 1.5, fontSize: '0.88rem', lineHeight: 1.55 }}>
        {node.latestEvidence.question}
      </Typography>
      <Box
        component="blockquote"
        sx={{
          m: 0,
          mt: 2,
          pl: 2,
          borderLeft: '2px solid',
          borderColor: 'primary.main',
          fontFamily: 'Georgia, serif',
          fontSize: '1rem',
          lineHeight: 1.55,
        }}
      >
        “{node.latestEvidence.excerpt}”
      </Box>

      <Divider sx={{ my: 3 }} />
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
        <Box>
          <Typography variant="h5">{node.evidenceCount}</Typography>
          <Typography color="text.secondary" sx={{ fontSize: '0.75rem' }}>
            observations
          </Typography>
        </Box>
        <Box>
          <Typography variant="h5">{node.sessionCount}</Typography>
          <Typography color="text.secondary" sx={{ fontSize: '0.75rem' }}>
            learning sessions
          </Typography>
        </Box>
        <Box>
          <Typography variant="h5">{sentenceCase(node.trend)}</Typography>
          <Typography color="text.secondary" sx={{ fontSize: '0.75rem' }}>
            evidence trend
          </Typography>
        </Box>
        <Box>
          <Typography variant="h5">
            {sentenceCase(node.latestEvidence.status)}
          </Typography>
          <Typography color="text.secondary" sx={{ fontSize: '0.75rem' }}>
            latest assessment
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';

import type {
  KnowledgeGraphNode,
  KnowledgeGraphSnapshot,
  KnowledgeSignalState,
} from '../learning/knowledgeGraph.ts';
import { KnowledgeConceptPanel } from './KnowledgeConceptPanel';
import { KnowledgeGraphMap } from './KnowledgeGraphMap';

const legend: Array<{
  state: KnowledgeSignalState;
  label: string;
  color: string;
}> = [
  { state: 'strong', label: 'Strong', color: '#2f6b58' },
  { state: 'developing', label: 'Developing', color: '#a8752b' },
  { state: 'fragile', label: 'Fragile', color: '#b85d43' },
  { state: 'needs_attention', label: 'Needs attention', color: '#7d4b63' },
];

type KnowledgeGraphViewProps = {
  snapshot: KnowledgeGraphSnapshot | null;
  loading: boolean;
  error: string;
  onRefresh(): Promise<void>;
  onStartLearning(): void;
};

export function KnowledgeGraphView({
  snapshot,
  loading,
  error,
  onRefresh,
  onStartLearning,
}: KnowledgeGraphViewProps) {
  const [selectedId, setSelectedId] = useState('');

  useEffect(() => {
    if (!snapshot?.nodes.length) return;
    const stillExists = snapshot.nodes.some((node) => node.id === selectedId);
    if (!stillExists) {
      setSelectedId(snapshot.frontier?.conceptId ?? snapshot.nodes[0].id);
    }
  }, [selectedId, snapshot]);

  if (loading && !snapshot) {
    return (
      <Box
        component="main"
        sx={{
          minHeight: 'calc(100vh - 4rem)',
          display: 'grid',
          placeItems: 'center',
        }}
        aria-busy="true"
      >
        <Box sx={{ textAlign: 'center' }}>
          <CircularProgress size={28} />
          <Typography sx={{ mt: 2 }} color="text.secondary">
            Tracing your evidence…
          </Typography>
        </Box>
      </Box>
    );
  }

  if (!snapshot || snapshot.nodes.length === 0) {
    return (
      <Box
        component="main"
        sx={{
          minHeight: 'calc(100vh - 4rem)',
          px: 3,
          display: 'grid',
          placeItems: 'center',
          textAlign: 'center',
        }}
      >
        <Box sx={{ maxWidth: '32rem' }}>
          <Typography
            variant="overline"
            color="text.secondary"
            sx={{ fontWeight: 750 }}
          >
            Knowledge map
          </Typography>
          <Typography component="h1" variant="h2" sx={{ mt: 1 }}>
            Your first connection starts with an answer.
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 2, lineHeight: 1.7 }}>
            Strata grows this map only from concepts you actually explain,
            retrieve, or apply. Exposure alone never counts.
          </Typography>
          {error && (
            <Typography role="alert" color="error" sx={{ mt: 2 }}>
              {error}
            </Typography>
          )}
          <Button variant="contained" onClick={onStartLearning} sx={{ mt: 3 }}>
            Start learning
          </Button>
        </Box>
      </Box>
    );
  }

  const selected =
    snapshot.nodes.find((node) => node.id === selectedId) ?? snapshot.nodes[0];

  return (
    <Box
      component="main"
      sx={{
        width: 'min(100%, 90rem)',
        mx: 'auto',
        px: { xs: 2.5, sm: 4 },
        pb: 6,
      }}
    >
      <Box
        sx={{
          pt: { xs: 3, md: 5 },
          pb: 4,
          display: { xs: 'block', md: 'flex' },
          alignItems: 'end',
          justifyContent: 'space-between',
          gap: 4,
        }}
      >
        <Box>
          <Typography
            variant="overline"
            color="text.secondary"
            sx={{ fontWeight: 750 }}
          >
            Living evidence map
          </Typography>
          <Typography component="h1" variant="h2" sx={{ mt: 0.5 }}>
            Your knowledge has a shape.
          </Typography>
          <Typography
            color="text.secondary"
            sx={{ mt: 1.5, maxWidth: '44rem' }}
          >
            Every node is backed by your words. Connections strengthen when
            concepts reappear together across independent attempts.
          </Typography>
        </Box>
        <Box sx={{ mt: { xs: 3, md: 0 }, textAlign: { md: 'right' } }}>
          <Typography variant="h5">
            {snapshot.stats.concepts} concepts · {snapshot.stats.connections}{' '}
            connections
          </Typography>
          <Typography color="text.secondary" sx={{ fontSize: '0.78rem' }}>
            {snapshot.stats.observations} evidence observations across{' '}
            {snapshot.stats.sessions} sessions
          </Typography>
          <Button
            variant="text"
            color="inherit"
            disabled={loading}
            onClick={() => void onRefresh()}
            sx={{ mt: 0.5, px: 0 }}
          >
            {loading ? 'Refreshing…' : 'Refresh map'}
          </Button>
        </Box>
      </Box>

      {error && (
        <Typography role="alert" color="error" sx={{ mb: 2 }}>
          {error}
        </Typography>
      )}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            md: 'minmax(0, 2.1fr) minmax(18rem, 0.9fr)',
          },
          gap: { xs: 3, md: 4 },
        }}
      >
        <Box>
          <KnowledgeGraphMap
            snapshot={snapshot}
            selectedId={selected.id}
            onSelect={(node: KnowledgeGraphNode) => setSelectedId(node.id)}
          />
          <Box
            aria-label="Knowledge signal legend"
            sx={{ display: 'flex', flexWrap: 'wrap', gap: 2.5, mt: 2 }}
          >
            {legend.map((item) => (
              <Box
                key={item.state}
                sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}
              >
                <Box
                  aria-hidden="true"
                  sx={{
                    width: 9,
                    height: 9,
                    borderRadius: '50%',
                    bgcolor: item.color,
                  }}
                />
                <Typography color="text.secondary" sx={{ fontSize: '0.74rem' }}>
                  {item.label}
                </Typography>
              </Box>
            ))}
            <Typography color="text.secondary" sx={{ fontSize: '0.74rem' }}>
              Dashed ring = learning frontier
            </Typography>
          </Box>
        </Box>
        <KnowledgeConceptPanel node={selected} snapshot={snapshot} />
      </Box>
    </Box>
  );
}

import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';

import {
  layoutKnowledgeGraph,
  type KnowledgeGraphNode,
  type KnowledgeGraphSnapshot,
  type KnowledgeSignalState,
} from '../learning/knowledgeGraph.ts';

const stateColor: Record<KnowledgeSignalState, string> = {
  strong: '#2f6b58',
  developing: '#a8752b',
  fragile: '#b85d43',
  needs_attention: '#7d4b63',
};

type KnowledgeGraphMapProps = {
  snapshot: KnowledgeGraphSnapshot;
  selectedId: string;
  onSelect(node: KnowledgeGraphNode): void;
};

export function KnowledgeGraphMap({
  snapshot,
  selectedId,
  onSelect,
}: KnowledgeGraphMapProps) {
  const [focusedId, setFocusedId] = useState('');
  const points = useMemo(
    () => layoutKnowledgeGraph(snapshot.nodes, snapshot.edges),
    [snapshot],
  );
  const pointById = new Map(points.map((point) => [point.id, point]));
  const nodeById = new Map(snapshot.nodes.map((node) => [node.id, node]));

  return (
    <Box
      sx={{
        minHeight: { xs: 380, md: 560 },
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        overflow: 'hidden',
        bgcolor: '#f1f0e9',
      }}
    >
      <svg
        viewBox="0 0 900 560"
        width="100%"
        height="100%"
        role="group"
        aria-labelledby="knowledge-map-title knowledge-map-description"
        style={{ display: 'block', minHeight: 380 }}
      >
        <title id="knowledge-map-title">Knowledge graph</title>
        <desc id="knowledge-map-description">
          Concepts grow from quoted learning evidence. Select a concept to
          inspect its signal and latest evidence.
        </desc>
        <defs>
          <pattern
            id="graph-grid"
            width="32"
            height="32"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1" cy="1" r="1" fill="#242622" opacity="0.08" />
          </pattern>
          <filter id="node-shadow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="3" stdDeviation="5" floodOpacity="0.12" />
          </filter>
        </defs>
        <rect width="900" height="560" fill="url(#graph-grid)" />
        {snapshot.edges.map((edge) => {
          const source = pointById.get(edge.source);
          const target = pointById.get(edge.target);
          if (!source || !target) return null;
          return (
            <line
              key={`${edge.source}-${edge.target}`}
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
              stroke="#5f625c"
              strokeOpacity={0.18 + edge.strength * 0.4}
              strokeWidth={1 + edge.strength * 3}
            />
          );
        })}
        {points.map((point) => {
          const node = nodeById.get(point.id)!;
          const selected = node.id === selectedId;
          const frontier = snapshot.frontier?.conceptId === node.id;
          const radius = 25 + Math.min(11, node.evidenceCount * 2);
          const label =
            node.label.length > 22
              ? `${node.label.slice(0, 20).trim()}…`
              : node.label;
          return (
            <g
              key={node.id}
              role="button"
              tabIndex={0}
              aria-label={`${node.label}, ${Math.round(node.signal * 100)} percent knowledge signal, ${node.state.replace('_', ' ')}`}
              aria-pressed={selected}
              onClick={() => onSelect(node)}
              onFocus={() => setFocusedId(node.id)}
              onBlur={() => setFocusedId('')}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(node);
                }
              }}
              style={{ cursor: 'pointer', outline: 'none' }}
            >
              {frontier && (
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={radius + 13}
                  fill="none"
                  stroke="#242622"
                  strokeWidth="1.5"
                  strokeDasharray="5 5"
                  opacity="0.55"
                />
              )}
              {(selected || focusedId === node.id) && (
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={radius + 7}
                  fill="none"
                  stroke="#242622"
                  strokeWidth={focusedId === node.id ? 4 : 3}
                />
              )}
              <circle
                cx={point.x}
                cy={point.y}
                r={radius}
                fill={stateColor[node.state]}
                filter="url(#node-shadow)"
              />
              <text
                x={point.x}
                y={point.y - 2}
                textAnchor="middle"
                fill="#fffdf7"
                fontSize="12"
                fontWeight="700"
                pointerEvents="none"
              >
                {Math.round(node.signal * 100)}
              </text>
              <text
                x={point.x}
                y={point.y + radius + 18}
                textAnchor="middle"
                fill="#242622"
                fontSize="12"
                fontWeight={selected ? '700' : '600'}
                pointerEvents="none"
              >
                {label}
              </text>
            </g>
          );
        })}
      </svg>
    </Box>
  );
}

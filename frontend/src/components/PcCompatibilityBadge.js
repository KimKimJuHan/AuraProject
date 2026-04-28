// src/components/PcCompatibilityBadge.js
import React, { useEffect, useState } from 'react';
import { checkPcCompatibility, getUserPcSpec } from '../utils/pcCompatibility';

export default function PcCompatibilityBadge({ game, compact = false, hideUnknown = false }) {
  const [userSpec, setUserSpec] = useState(() => getUserPcSpec());

  useEffect(() => {
    const handleStorageChange = () => setUserSpec(getUserPcSpec());

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('pcSpecUpdated', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('pcSpecUpdated', handleStorageChange);
    };
  }, []);

  const result = checkPcCompatibility(game, userSpec);

  if (hideUnknown && result.status === 'unknown') return null;

  return (
    <div
      className="pc-compatibility-badge"
      title={result.label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        width: 'fit-content',
        maxWidth: '100%',
        marginTop: compact ? '5px' : '7px',
        marginBottom: compact ? '5px' : '7px',
        padding: compact ? '3px 8px' : '5px 10px',
        borderRadius: '999px',
        fontSize: compact ? '10px' : '11px',
        lineHeight: 1.2,
        fontWeight: '700',
        color: result.color,
        background: result.background,
        border: '1px solid ' + result.border,
        whiteSpace: 'nowrap'
      }}
    >
      <span>{result.icon}</span>
      <span>{result.label}</span>
    </div>
  );
}

import React from 'react';
import type { StateProps } from '../types';

/* ============================================================================
 * 占位状态 —— S4 及之后尚未实现的状态
 * ----------------------------------------------------------------------------
 * 作用是让整片能跑通、能渲染、能验收已完成的段落，而不是让未实现的段落崩掉。
 * 画面上会明确写出「尚未实现」，这样验收时一眼能看出进度边界，不会误判成画面 bug。
 * ==========================================================================*/

export const Placeholder: React.FC<StateProps & { id?: string; name?: string }> = ({
  t,
  local,
  params,
  width,
  height,
  id,
  name,
}) => {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: '#080b11',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        border: '1px solid #1b2735',
      }}
    >
      <div style={{ fontFamily: 'Consolas, monospace', fontSize: 13, color: '#d29922', letterSpacing: 3 }}>
        NOT IMPLEMENTED
      </div>
      <div style={{ fontFamily: 'Consolas, monospace', fontSize: 22, color: '#e6edf3' }}>
        {id} · {name}
      </div>
      <div style={{ fontFamily: 'Consolas, monospace', fontSize: 12, color: '#7d8590' }}>
        t={t.toFixed(2)}s · local={local.toFixed(2)}s
      </div>
      <div
        style={{
          fontFamily: 'Consolas, monospace',
          fontSize: 11,
          color: '#4a5568',
          maxWidth: Math.min(520, width * 0.8),
          textAlign: 'center',
          whiteSpace: 'pre-wrap',
        }}
      >
        {JSON.stringify(params, null, 1).slice(0, 220)}
      </div>
    </div>
  );
};

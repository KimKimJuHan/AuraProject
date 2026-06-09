import React from 'react';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';

export default function GameCharts({ historyData, chartWidth }) {
  if (!historyData || historyData.length === 0) return null;

  const hasTwitch = historyData.some(d => (d.twitch || 0) > 0);
  const hasChzzk  = historyData.some(d => (d.chzzk  || 0) > 0);
  const hasSoop   = historyData.some(d => (d.soop   || 0) > 0);
  const hasSteam  = historyData.some(d => (d.steam  || 0) > 0);

  const styles = {
    chartsGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      gap: '20px',
      marginTop: '40px'
    },
    chartBox: {
      backgroundColor: 'var(--bg-card)',
      padding: '20px',
      borderRadius: '8px',
      border: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'stretch',
      minWidth: 0,
      overflow: 'hidden'
    }
  };

  return (
    <div style={styles.chartsGrid}>
      <div style={styles.chartBox}>
        <h3 className="net-section-title">방송 시청자 트렌드</h3>
        <div style={{ width: '100%', overflowX: 'auto' }}>
          <LineChart width={chartWidth} height={250} data={historyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="time" stroke="#888" style={{ fontSize: '11px' }} />
            <YAxis stroke="#888" style={{ fontSize: '11px' }} />
            <Tooltip contentStyle={{ backgroundColor: 'var(--bg-hover)', borderColor: '#555' }} />
            <Legend />
            <Line
              type="monotone" dataKey="twitch" name="Twitch" stroke="#9146FF"
              strokeWidth={hasTwitch ? 2 : 1}
              strokeOpacity={hasTwitch ? 1 : 0.3}
              strokeDasharray={hasTwitch ? undefined : '4 4'}
              dot={false}
            />
            <Line
              type="monotone" dataKey="chzzk" name="치지직" stroke="#00FFA3"
              strokeWidth={hasChzzk ? 2 : 1}
              strokeOpacity={hasChzzk ? 1 : 0.3}
              strokeDasharray={hasChzzk ? undefined : '4 4'}
              dot={false}
            />
            <Line
              type="monotone" dataKey="soop" name="SOOP" stroke="#FF6B35"
              strokeWidth={hasSoop ? 2 : 1}
              strokeOpacity={hasSoop ? 1 : 0.3}
              strokeDasharray={hasSoop ? undefined : '4 4'}
              dot={false}
            />
          </LineChart>
        </div>
        {!hasTwitch && !hasChzzk && !hasSoop && (
          <div style={{ textAlign: 'center', fontSize: '11px', color: '#444', marginTop: '6px' }}>
            수집된 방송 시청자 데이터가 없습니다 (트위치 · 치지직 · 숲(SOOP))
          </div>
        )}
      </div>

      <div style={styles.chartBox}>
        <h3 className="net-section-title">스팀 동접자 추이</h3>
        {hasSteam ? (
          <div style={{ width: '100%', overflowX: 'auto' }}>
            <AreaChart width={chartWidth} height={250} data={historyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="time" stroke="#888" style={{ fontSize: '11px' }} />
              <YAxis stroke="#888" style={{ fontSize: '11px' }} domain={['auto', 'auto']} />
              <Tooltip contentStyle={{ backgroundColor: 'var(--bg-hover)', borderColor: '#555' }} />
              <Area type="monotone" dataKey="steam" name="Steam 유저" stroke="#66c0f4" fill="#2a475e" />
            </AreaChart>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: '250px', color: '#555', fontSize: '13px', gap: '8px' }}>
            <span style={{ fontSize: '28px' }}></span>
            <span>동접자 데이터가 없습니다</span>
          </div>
        )}
      </div>
    </div>
  );
}

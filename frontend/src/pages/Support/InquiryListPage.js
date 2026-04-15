import React, { useEffect, useMemo, useState } from 'react';
import { fetchMyInquiries } from '../../api/support';
import { Link, useNavigate } from 'react-router-dom';

const styles = {
  page: { maxWidth: 900, margin: '40px auto', padding: '0 20px', color: '#fff' },
  titleRow: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  h1: { margin: 0, color: '#e50914' },
  sub: { margin: 0, color: '#aaa', fontSize: 13 },

  topBar: { display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', marginTop: 12, flexWrap: 'wrap' },
  search: {
    flex: 1,
    minWidth: 220,
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid #333',
    background: '#141414',
    color: '#fff',
    outline: 'none',
  },

  btn: { padding: '10px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 800 },
  primary: { background: '#e50914', color: '#fff' },

  list: { marginTop: 18, borderTop: '1px solid #2a2a2a' },
  item: { borderBottom: '1px solid #2a2a2a' },
  qBtn: {
    width: '100%',
    textAlign: 'left',
    padding: '14px 10px',
    background: 'transparent',
    border: 'none',
    color: '#fff',
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'center',
  },
  left: { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 },
  metaRow: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  title: { fontSize: 15, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  chevron: { color: '#e50914', fontWeight: 900, width: 24, textAlign: 'center' },

  pill: { fontSize: 12, padding: '3px 8px', borderRadius: 999, border: '1px solid #333', color: '#ddd' },
  pillMuted: { color: '#aaa', borderColor: '#2a2a2a' },
  pillGreen: { borderColor: '#1f6f3b', color: '#7dffb3' },
  pillYellow: { borderColor: '#6b5a13', color: '#ffe27d' },

  bodyWrap: { padding: '0 10px 14px 10px', color: '#ddd', lineHeight: 1.6 },
  box: { background: '#101010', border: '1px solid #222', borderRadius: 8, padding: 12 },
  sectionTitle: { fontSize: 13, color: '#aaa', marginBottom: 6 },

  empty: { padding: 18, color: '#aaa' },
  error: { padding: 18, color: '#ff6b6b' },
};

const CAT_LABEL = {
  account: '계정/로그인',
  recommend: '추천/태그',
  steam: '스팀 연동',
  bug: '버그/오류',
  etc: '기타',
};

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso || '';
  }
}

export default function InquiryListPage({ user }) {
  const navigate = useNavigate();
  const [list, setList] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const data = await fetchMyInquiries();
        if (!mounted) return;
        setList(Array.isArray(data?.inquiries) ? data.inquiries : []);
      } catch (e) {
        console.error(e);
        setError('문의 목록을 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [user, navigate]);

  const toggle = (id) => setOpenId(prev => (prev === id ? null : id));

  const filteredSorted = useMemo(() => {
    const keyword = q.trim().toLowerCase();

    const filtered = keyword
      ? list.filter((it) => {
          const hay = `${it.title || ''} ${it.content || ''} ${it.answer || ''}`.toLowerCase();
          return hay.includes(keyword);
        })
      : list;

    return [...filtered].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [list, q]);

  const statusPill = (status) => {
    if (status === 'answered') return { ...styles.pill, ...styles.pillGreen };
    if (status === 'open') return { ...styles.pill, ...styles.pillYellow };
    return { ...styles.pill, ...styles.pillMuted };
  };

  const statusLabel = (status) => {
    if (status === 'answered') return '답변 완료';
    if (status === 'open') return '접수됨';
    if (status === 'closed') return '종료';
    return status || '알수없음';
  };

  return (
    <div style={styles.page}>
      <div style={styles.titleRow}>
        <h1 style={styles.h1}>📨 나의 1:1 문의</h1>
        <p style={styles.sub}>문의 내역을 확인하고 답변을 받을 수 있어요.</p>
      </div>
      <Link to="/support/inquiry/new" style={styles.newBtn}>+ 문의 작성</Link>

      <div style={styles.topBar}>
        <input
          style={styles.search}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="문의 검색 (제목/내용/답변)"
        />
        <button
          type="button"
          style={{ ...styles.btn, ...styles.primary }}
          onClick={() => navigate('/support/inquiry/new')}
        >
          문의 작성
        </button>
      </div>

      {loading && <div style={styles.empty}>불러오는 중...</div>}
      {!loading && error && <div style={styles.error}>{error}</div>}

      {!loading && !error && (
        <div style={styles.list}>
          {filteredSorted.length === 0 ? (
            <div style={styles.empty}>
              {q.trim() ? '검색 결과가 없습니다.' : '아직 문의가 없습니다. “문의 작성”을 눌러 작성해 보세요.'}
            </div>
          ) : (
            filteredSorted.map((it) => {
              const isOpen = openId === it._id;
              const cat = CAT_LABEL[it.category] || '기타';

              return (
                <div key={it._id} style={styles.item}>
                  <button type="button" style={styles.qBtn} onClick={() => toggle(it._id)}>
                    <div style={styles.left}>
                      <div style={styles.metaRow}>
                        <span style={styles.pill}>{cat}</span>
                        <span style={statusPill(it.status)}>{statusLabel(it.status)}</span>
                        <span style={{ ...styles.pill, ...styles.pillMuted }}>{formatDate(it.createdAt)}</span>
                      </div>
                      <div style={styles.title}>{it.title}</div>
                    </div>
                    <div style={styles.chevron}>{isOpen ? '−' : '+'}</div>
                  </button>

                  {isOpen && (
                    <div style={styles.bodyWrap}>
                      <div style={styles.box}>
                        <div style={styles.sectionTitle}>문의 내용</div>
                        <div style={{ whiteSpace: 'pre-wrap' }}>{it.content}</div>

                        <div style={{ height: 12 }} />

                        <div style={styles.sectionTitle}>답변</div>
                        {it.answer ? (
                          <div style={{ whiteSpace: 'pre-wrap' }}>{it.answer}</div>
                        ) : (
                          <div style={{ color: '#aaa' }}>아직 답변이 등록되지 않았습니다.</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
import React, { useEffect, useMemo, useState } from 'react';
import DOMPurify from 'dompurify';
import { fetchFaqs } from '../../api/support';
import { Link } from 'react-router-dom';

const styles = {
  page: { maxWidth: 900, margin: '40px auto', padding: '0 20px', color: '#fff' },
  titleRow: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  h1: { margin: 0, color: '#e50914' },
  sub: { margin: 0, color: '#aaa', fontSize: 13 },

  inquiryBtn: {
    padding: '8px 12px',
    borderRadius: 8,
    background: '#e50914',
    color: '#fff',
    textDecoration: 'none',
    fontWeight: 800,
    whiteSpace: 'nowrap',
    border: '1px solid #e50914',
  },

  searchRow: { display: 'flex', gap: 10, marginTop: 16 },
  input: {
    flex: 1,
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid #333',
    background: '#141414',
    color: '#fff',
    outline: 'none',
  },
  select: {
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid #333',
    background: '#141414',
    color: '#fff',
    outline: 'none',
  },

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
  qLeft: { display: 'flex', flexDirection: 'column', gap: 6 },
  cat: { color: '#aaa', fontSize: 12 },
  q: { fontSize: 15, fontWeight: 800 },
  chevron: { color: '#e50914', fontWeight: 900, width: 24, textAlign: 'center' },

  aWrap: { padding: '0 10px 14px 10px', color: '#ddd', lineHeight: 1.6 },
  aBox: {
    background: '#101010',
    border: '1px solid #222',
    borderRadius: 8,
    padding: 12,
  },

  empty: { padding: 18, color: '#aaa' },
  error: { padding: 18, color: '#ff6b6b' },
};

export default function FaqPage() {
  const [faqs, setFaqs] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const data = await fetchFaqs();
        if (!mounted) return;
        setFaqs(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error(e);
        setError('FAQ를 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const categories = useMemo(() => {
    const set = new Set((faqs || []).map(f => f.category || '일반'));
    return ['all', ...Array.from(set)];
  }, [faqs]);

  const filtered = useMemo(() => {
    const keyword = q.trim().toLowerCase();
    return (faqs || []).filter((f) => {
      const catOk = category === 'all' ? true : (f.category || '일반') === category;
      const text = `${f.question || ''} ${f.answer || ''}`.toLowerCase();
      const qOk = keyword ? text.includes(keyword) : true;
      return catOk && qOk;
    });
  }, [faqs, q, category]);

  const toggle = (id) => setOpenId(prev => (prev === id ? null : id));

  return (
    <div style={styles.page}>
      <div style={styles.titleRow}>
        <div>
          <h1 style={styles.h1}>🛎️ 고객센터 FAQ</h1>
          <p style={styles.sub}>자주 묻는 질문을 빠르게 확인하세요.</p>
        </div>

        <Link to="/support/inquiry" style={styles.inquiryBtn}>
          ✉️ 1:1 문의하기
        </Link>
      </div>

      <div style={styles.searchRow}>
        <input
          style={styles.input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="검색어를 입력하세요 (예: 로그인, 스팀, 결제...)"
        />
        <select style={styles.select} value={category} onChange={(e) => setCategory(e.target.value)}>
          {categories.map((c) => (
            <option key={c} value={c}>{c === 'all' ? '전체' : c}</option>
          ))}
        </select>
      </div>

      {loading && <div style={styles.empty}>불러오는 중...</div>}
      {!loading && error && <div style={styles.error}>{error}</div>}

      {!loading && !error && (
        <div style={styles.list}>
          {filtered.length === 0 ? (
            <div style={styles.empty}>검색 결과가 없습니다.</div>
          ) : (
            filtered.map((f) => {
              const id = f._id;
              const isOpen = openId === id;

              const safeHtml = DOMPurify.sanitize((f.answer || '').replace(/\n/g, '<br/>'));

              return (
                <div key={id} style={styles.item}>
                  <button type="button" style={styles.qBtn} onClick={() => toggle(id)}>
                    <div style={styles.qLeft}>
                      <div style={styles.cat}>{f.category || '일반'}</div>
                      <div style={styles.q}>{f.question}</div>
                    </div>
                    <div style={styles.chevron}>{isOpen ? '−' : '+'}</div>
                  </button>

                  {isOpen && (
                    <div style={styles.aWrap}>
                      <div style={styles.aBox}>
                        <div dangerouslySetInnerHTML={{ __html: safeHtml }} />
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
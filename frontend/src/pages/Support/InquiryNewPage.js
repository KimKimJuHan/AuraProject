import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createInquiry } from '../../api/support';

const styles = {
  page: { maxWidth: 900, margin: '40px auto', padding: '0 20px', color: '#fff' },
  h1: { margin: 0, color: '#e50914' },
  panel: { marginTop: 16, background: '#101010', border: '1px solid #222', borderRadius: 8, padding: 16 },
  row: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 },
  label: { color: '#aaa', fontSize: 13 },
  input: { padding: '10px 12px', borderRadius: 8, border: '1px solid #333', background: '#141414', color: '#fff' },
  textarea: { padding: '10px 12px', borderRadius: 8, border: '1px solid #333', background: '#141414', color: '#fff', minHeight: 160, resize: 'vertical' },
  btnRow: { display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' },
  btn: { padding: '10px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 800 },
  primary: { background: '#e50914', color: '#fff' },
  ghost: { background: '#333', color: '#fff' },
};

const CATEGORY_OPTIONS = [
  { value: 'account', label: '계정/로그인' },
  { value: 'recommend', label: '추천/태그' },
  { value: 'steam', label: '스팀 연동' },
  { value: 'bug', label: '버그/오류' },
  { value: 'etc', label: '기타' },
];

export default function InquiryNewPage({ user }) {
  const navigate = useNavigate();
  const [category, setCategory] = useState('etc');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) navigate('/login');
  }, [user, navigate]);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return alert('제목/내용을 입력해 주세요.');

    try {
      setSaving(true);
      await createInquiry({ category, title: title.trim(), content: content.trim() });
      alert('문의가 접수되었습니다.');
      navigate('/support/inquiry');
    } catch (err) {
      console.error(err);
      alert('문의 접수에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>✉️ 1:1 문의 작성</h1>

      <form style={styles.panel} onSubmit={onSubmit}>
        <div style={styles.row}>
          <div style={styles.label}>카테고리</div>
          <select style={styles.input} value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div style={styles.row}>
          <div style={styles.label}>제목</div>
          <input style={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} />
        </div>

        <div style={styles.row}>
          <div style={styles.label}>내용</div>
          <textarea style={styles.textarea} value={content} onChange={(e) => setContent(e.target.value)} maxLength={5000} />
        </div>

        <div style={styles.btnRow}>
          <button type="button" style={{ ...styles.btn, ...styles.ghost }} onClick={() => navigate(-1)}>취소</button>
          <button type="submit" disabled={saving} style={{ ...styles.btn, ...styles.primary, opacity: saving ? 0.7 : 1 }}>
            {saving ? '접수 중...' : '문의 접수'}
          </button>
        </div>
      </form>
    </div>
  );
}
import React, { useEffect, useState } from 'react';
import { apiClient } from '../../config';
import { useNavigate } from 'react-router-dom';

const box = {
  maxWidth: 980,
  margin: '30px auto',
  padding: '0 16px',
  color: 'white',
};

const card = {
  background: '#141414',
  border: '1px solid #333',
  borderRadius: 10,
  padding: 16,
  marginBottom: 12,
};

export default function AdminInquiryPage({ user }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [inquiries, setInquiries] = useState([]);
  const [answerDraft, setAnswerDraft] = useState({}); // { [id]: "text" }
  const [savingId, setSavingId] = useState(null);
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    // 로그인/권한 없으면 튕기기(프론트 가드)
    if (!user) {
      navigate('/login');
      return;
    }
    if (!isAdmin) {
      navigate('/');
      return;
    }

    const fetchAll = async () => {
      setLoading(true);
      try {
        // ✅ 관리자 전체 문의 목록
        const res = await apiClient.get('/support/admin/inquiries');

        const list = Array.isArray(res.data?.inquiries) ? res.data.inquiries : [];
        setInquiries(list);

        // 기존 답변을 draft에 초기화
        const init = {};
        list.forEach((inq) => {
          init[inq._id] = inq.answer || '';
        });
        setAnswerDraft(init);
      } catch (e) {
        console.error(e);
        alert(e?.response?.data?.message || '문의 목록을 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, [user, isAdmin, navigate]);

  const handleSave = async (inqId) => {
    try {
      setSavingId(inqId);
      const answer = (answerDraft[inqId] ?? '').trim();

      // ✅ 관리자 답변 저장 API
      const res = await apiClient.patch(`/support/admin/inquiries/${inqId}/answer`, { answer });

      // 서버 응답이 inquiry를 주면 그걸로 갱신 (가장 정확)
      const updated = res.data?.inquiry;

      setInquiries((prev) =>
        prev.map((x) =>
          x._id === inqId
            ? (updated ? { ...x, ...updated } : { ...x, answer, status: answer ? 'answered' : x.status, updatedAt: new Date().toISOString() })
            : x
        )
      );

      alert('답변이 저장되었습니다.');
    } catch (e) {
      console.error(e);
      alert(e?.response?.data?.message || '답변 저장 실패');
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return <div style={box}>Loading...</div>;
  }

  return (
    <div style={box}>
      <h2 style={{ marginBottom: 16 }}>관리자 문의 관리</h2>

      {inquiries.length === 0 ? (
        <div>문의가 없습니다.</div>
      ) : (
        inquiries.map((inq) => (
          <div key={inq._id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ fontWeight: 800 }}>{inq.title}</div>
              <div style={{ color: '#aaa', fontSize: 12 }}>
                {inq.category} · {inq.status} · {new Date(inq.createdAt).toLocaleString()}
              </div>
            </div>

            <div style={{ marginTop: 10, color: '#ddd', whiteSpace: 'pre-wrap' }}>{inq.content}</div>

            <div style={{ marginTop: 12 }}>
              <div style={{ marginBottom: 6, color: '#bbb' }}>답변</div>
              <textarea
                value={answerDraft[inq._id] ?? ''}
                onChange={(e) => setAnswerDraft((prev) => ({ ...prev, [inq._id]: e.target.value }))}
                rows={4}
                style={{
                  width: '100%',
                  background: '#0f0f0f',
                  border: '1px solid #333',
                  borderRadius: 8,
                  padding: 10,
                  color: 'white',
                  resize: 'vertical',
                }}
                placeholder="답변을 입력하세요..."
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                <button
                  onClick={() => handleSave(inq._id)}
                  disabled={savingId === inq._id}
                  style={{
                    background: '#E50914',
                    border: 'none',
                    color: 'white',
                    fontWeight: 800,
                    padding: '10px 14px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    opacity: savingId === inq._id ? 0.6 : 1,
                  }}
                >
                  {savingId === inq._id ? '저장 중...' : '답변 저장'}
                </button>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
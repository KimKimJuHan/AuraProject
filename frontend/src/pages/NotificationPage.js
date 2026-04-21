import React, { useState, useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { apiClient } from '../config';

const styles = {
    container: { maxWidth: '800px', margin: '40px auto', padding: '20px', backgroundColor: '#141414', minHeight: '80vh', color: '#fff', borderRadius: '8px' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333', paddingBottom: '15px', marginBottom: '20px' },
    title: { fontSize: '24px', fontWeight: 'bold', margin: 0 },
    clearBtn: { backgroundColor: 'transparent', color: '#E50914', border: '1px solid #E50914', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', transition: '0.2s' },
    list: { display: 'flex', flexDirection: 'column', gap: '15px' },
    item: { backgroundColor: '#222', borderRadius: '8px', padding: '20px', borderLeft: '4px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'all 0.3s ease' },
    itemUnread: { backgroundColor: '#2a2a2a', borderLeft: '4px solid #E50914' },
    contentArea: { display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, textDecoration: 'none' },
    itemTitle: { fontSize: '16px', fontWeight: 'bold', color: '#fff', margin: 0 },
    itemMessage: { fontSize: '14px', color: '#bbb', margin: 0, lineHeight: '1.4' },
    itemDate: { fontSize: '12px', color: '#777', marginTop: '5px' },
    deleteBtn: { backgroundColor: 'transparent', border: 'none', color: '#666', fontSize: '18px', cursor: 'pointer', padding: '10px', marginLeft: '15px' },
    emptyState: { textAlign: 'center', padding: '50px 0', color: '#666', fontSize: '16px' }
};

export default function NotificationPage({ user }) {
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (user) {
            fetchNotifications();
        }
    }, [user]);

    const fetchNotifications = async () => {
        try {
            const res = await apiClient.get('/notifications');
            if (res.data.success) {
                setNotifications(res.data.notifications);
                // 페이지 진입 시 자동으로 모두 읽음 처리 요청
                if (res.data.notifications.some(n => !n.isRead)) {
                    await apiClient.post('/notifications/read');
                }
            }
        } catch (error) {
            console.error("알림 로드 실패:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("이 알림을 삭제하시겠습니까?")) return;
        try {
            await apiClient.delete(`/notifications/${id}`);
            setNotifications(prev => prev.filter(n => n._id !== id));
        } catch (error) {
            alert("삭제에 실패했습니다.");
        }
    };

    const handleClearAll = async () => {
        if (notifications.length === 0) return;
        if (!window.confirm("모든 알림을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) return;
        try {
            await apiClient.delete('/notifications');
            setNotifications([]);
        } catch (error) {
            alert("전체 삭제에 실패했습니다.");
        }
    };

    const formatDate = (dateString) => {
        const d = new Date(dateString);
        return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };

    if (!user) return <Navigate to="/login" />;
    if (loading) return <div style={{ textAlign: 'center', marginTop: '50px', color: '#fff' }}>로딩 중...</div>;

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <h2 style={styles.title}>알림 센터</h2>
                <button style={styles.clearBtn} onClick={handleClearAll}>전체 삭제</button>
            </div>

            {notifications.length === 0 ? (
                <div style={styles.emptyState}>수신된 알림이 없습니다.</div>
            ) : (
                <div style={styles.list}>
                    {notifications.map(noti => (
                        <div key={noti._id} style={{ ...styles.item, ...(noti.isRead ? {} : styles.itemUnread) }}>
                            <Link to={`/game/${noti.gameSlug}`} style={styles.contentArea}>
                                <h3 style={styles.itemTitle}>{noti.title}</h3>
                                <p style={styles.itemMessage}>{noti.message}</p>
                                <span style={styles.itemDate}>{formatDate(noti.createdAt)}</span>
                            </Link>
                            <button style={styles.deleteBtn} onClick={() => handleDelete(noti._id)} title="삭제">✕</button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
import React, { useEffect, useState, useRef } from "react";
import axios from "axios";
import "./PersonalRecoPage.css";

const API_BASE = "http://localhost:8000";

/**
 * PersonalRecoPage – 안정화 버전
 * - Steam 라이브러리 경로 수정
 * - StrictMode 2회 렌더 대응
 * - UI & 에러 핸들링 개선
 */

export default function PersonalRecoPage() {
  const [steamStatus, setSteamStatus] = useState("LOADING"); 
  const [steamGames, setSteamGames] = useState([]);
  const [picked, setPicked] = useState([]);
  const pickedRef = useRef([]);

  const [results, setResults] = useState([]);
  const [loadingReco, setLoadingReco] = useState(false);

  /* -----------------------------
      🔥 태그 목록
  ------------------------------ */
  const TAGS = [
    "RPG",
    "FPS",
    "시뮬레이션",
    "전략",
    "스포츠",
    "레이싱",
    "퍼즐",
    "생존",
    "공포",
    "판타지",
    "공상과학",
    "오픈 월드",
    "스토리 중심",
    "협동 캠페인",
  ];

  /* -----------------------------
      🔥 태그 토글
  ------------------------------ */
  const toggle = (tag) => {
    setPicked((prev) => {
      let next;
      if (prev.includes(tag)) next = prev.filter((t) => t !== tag);
      else next = [...prev, tag];

      pickedRef.current = next;
      return next;
    });
  };

  /* -----------------------------
      🔥 Steam Library Load
      API 변경 완료:
      /api/user/steam-library
  ------------------------------ */
  const fetchSteamLibrary = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/user/steam-library`, {
        withCredentials: true,
      });

      if (!res.data || !res.data.success) {
        setSteamStatus("NOT_LINKED");
        return;
      }

      const games = res.data.library || [];
      if (games.length === 0) {
        setSteamStatus("PRIVATE"); // 프로필 비공개 대비
        return;
      }

      // TOP 5 플레이시간 기준
      const sorted = [...games].sort(
        (a, b) => b.playtime_forever - a.playtime_forever
      );

      setSteamGames(sorted.slice(0, 5));
      setSteamStatus("LINKED");
    } catch (err) {
      console.log("Steam 라이브러리 오류:", err);
      setSteamStatus("NOT_LINKED");
    }
  };

  useEffect(() => {
    fetchSteamLibrary();
  }, []);

  /* -----------------------------
      🔥 추천 요청
  ------------------------------ */
  const fetchReco = async () => {
    if (pickedRef.current.length === 0) return;

    setLoadingReco(true);

    try {
      const res = await axios.post(
        `${API_BASE}/api/recommend/reco`,
        {
          liked: pickedRef.current,
          strict: false,
          k: 20,
        },
        { withCredentials: true }
      );

      setResults(res.data.items || []);
    } catch (err) {
      console.error("추천 오류:", err);
    } finally {
      setLoadingReco(false);
    }
  };

  /* -----------------------------
      🔥 가격 표기
  ------------------------------ */
  const formatPrice = (p) => {
    if (!p || p === "0" || p === 0) return "무료";
    if (typeof p === "string") return p;
    return p.toLocaleString() + "원";
  };

  /* -----------------------------
      🔥 플레이타임 표기
  ------------------------------ */
  const formatPlaytime = (min) => {
    if (!min || min === 0) return "0시간";
    if (min < 60) return `${min}분`;
    return `${(min / 60).toFixed(1)}시간`;
  };

  /* -----------------------------
      🔥 UI
  ------------------------------ */
  return (
    <div className="personal-reco-page">
      <h1>개인화 추천</h1>

      {/* Steam Status UI */}
      <div className="steam-status-box">
        {steamStatus === "LOADING" && <p>스팀 데이터 불러오는 중...</p>}

        {steamStatus === "NOT_LINKED" && (
          <p>
            스팀 계정이 연동되지 않았습니다.  
            <br /> 설정 메뉴에서 연동해주세요.
          </p>
        )}

        {steamStatus === "PRIVATE" && (
          <p>
            스팀 프로필이 비공개입니다.
            <br /> 프로필을 공개로 설정 후 다시 시도해주세요.
          </p>
        )}

        {steamStatus === "LINKED" && (
          <>
            <h2>💙 Steam 플레이 TOP 5</h2>
            <div className="steam-top5">
              {steamGames.map((g) => (
                <div key={g.appid} className="steam-game-box">
                  <img
                    src={`https://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.img_logo_url}.jpg`}
                    onError={(e) => {
                      e.target.src = "https://via.placeholder.com/300x150/333/aaa?text=No+Image";
                    }}
                    alt={g.name}
                  />
                  <div className="info">
                    <p className="title">{g.name}</p>
                    <p className="time">{formatPlaytime(g.playtime_forever)}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Tag Selector */}
      <h2>선호 태그 선택</h2>
      <div className="tag-list">
        {TAGS.map((tag) => (
          <button
            key={tag}
            className={picked.includes(tag) ? "tag selected" : "tag"}
            onClick={() => toggle(tag)}
          >
            {tag}
          </button>
        ))}
      </div>

      {/* Fetch Recommendations */}
      <button className="reco-btn" onClick={fetchReco} disabled={loadingReco}>
        {loadingReco ? "추천 불러오는 중..." : "추천 받기"}
      </button>

      {/* Results */}
      <div className="result-list">
        {results.map((g) => (
          <div key={g.appid} className="result-box">
            <img
              src={g.thumb}
              onError={(e) => {
                e.target.src = "https://via.placeholder.com/300x150/333/aaa?text=No+Image";
              }}
              alt={g.name}
            />
            <div className="info">
              <h3>{g.name}</h3>
              <p>점수: {g.score}</p>
              <p>{g.price ? g.price : "가격 정보 없음"}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

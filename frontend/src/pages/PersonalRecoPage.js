// frontend/src/pages/PersonalRecoPage.js

import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import Skeleton from "../Skeleton";
import "./RecommendPage.css";

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:8000";

// ✅ 메인 페이지와 동일한 태그 분류
const TAG_GROUPS = [
  {
    label: "장르",
    tags: ["액션", "RPG", "전략", "FPS", "시뮬레이션"],
  },
  {
    label: "플레이 방식",
    tags: ["싱글", "멀티", "협동 캠페인"],
  },
  {
    label: "분위기/테마",
    tags: ["공포", "판타지", "공상과학", "생존", "오픈 월드"],
  },
  {
    label: "게임 특성",
    tags: ["스토리 중심", "퍼즐"],
  },
  {
    label: "기타",
    tags: ["레이싱", "스포츠"],
  },
];

const PersonalRecoPage = () => {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [steamStatus, setSteamStatus] = useState("LOADING");
  const [steamGames, setSteamGames] = useState([]);

  const [term, setTerm] = useState("");
  const [picked, setPicked] = useState([]);
  const pickedRef = useRef([]);

  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  /* -----------------------------------------
   * 1. 유저 정보 (계정 정보 + steamId 존재 여부)
   * ----------------------------------------- */
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await axios.get(`${API_BASE}/api/user/info`, {
          withCredentials: true,
        });
        setUser(res.data);
      } catch {
        setUser(null);
      }
    };
    fetchUser();
  }, []);

  /* -----------------------------------------
   * 2. 스팀 라이브러리 조회
   * ----------------------------------------- */
  useEffect(() => {
    const loadSteamLibrary = async () => {
      if (!user) {
        setSteamStatus("GUEST");
        return;
      }

      // steamId는 존재하지만 steamGames는 비어있을 수 있음
      const hasSteam = user.steamId ? true : false;

      try {
        const res = await axios.get(`${API_BASE}/api/user/steam-library`, {
          withCredentials: true,
        });

        const lib = Array.isArray(res.data) ? res.data : [];
        setSteamGames(lib);

        if (lib.length === 0 && hasSteam) {
          // 스팀은 연동했지만 아직 steamGames 저장이 안 돼있는 케이스
          setSteamStatus("LINKED_NO_GAMES");
        } else if (lib.length > 0) {
          setSteamStatus("LINKED");
        }
      } catch (err) {
        if (hasSteam) {
          setSteamStatus("LINKED_NO_GAMES");
        } else {
          setSteamStatus("NOT_LINKED");
        }
      }
    };

    loadSteamLibrary();
  }, [user]);

  /* -----------------------------------------
   * 태그 선택 토글
   * ----------------------------------------- */
  const toggleTag = (tag) => {
    setPicked((prev) => {
      const next = prev.includes(tag)
        ? prev.filter((t) => t !== tag)
        : [...prev, tag];

      pickedRef.current = next;
      return next;
    });
  };

  /* -----------------------------------------
   * 추천 요청
   * ----------------------------------------- */
  const fetchReco = async () => {
    if (pickedRef.current.length === 0 && steamGames.length === 0) {
      alert("스팀을 연동하거나 태그를 선택해주세요.");
      return;
    }

    try {
      setLoading(true);
      const body = {
        userId: user?._id,
        tags: pickedRef.current,
        term: term.trim(),
      };

      const res = await axios.post(
        `${API_BASE}/api/advanced/personal`,
        body,
        { withCredentials: true }
      );

      setGames(res.data.games || []);
    } catch (e) {
      setErrorMsg("추천을 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  /* -----------------------------------------
   * 3. 스팀 연동 상태 UI
   * ----------------------------------------- */
  const renderSteamBox = () => {
    if (!user) {
      return (
        <div className="steam-dashboard">
          <div className="steam-guest-msg">
            <span>로그인이 필요합니다.</span>
            <button className="search-btn" onClick={() => navigate("/login")}>
              로그인
            </button>
          </div>
        </div>
      );
    }

    if (steamStatus === "NOT_LINKED") {
      return (
        <div className="steam-dashboard">
          <div className="steam-guest-msg">
            <span>스팀 계정이 연동되지 않았습니다.</span>
            <button
              className="search-btn"
              onClick={() => navigate("/settings")}
            >
              스팀 연동하기
            </button>
          </div>
        </div>
      );
    }

    if (steamStatus === "LINKED_NO_GAMES") {
      return (
        <div className="steam-dashboard">
          <div className="steam-guest-msg">
            <span>스팀은 연동되었지만 게임 데이터를 불러오지 못했습니다.</span>
          </div>
        </div>
      );
    }

    if (steamStatus === "LINKED") {
      const top5 = [...steamGames]
        .sort((a, b) => b.playtime_forever - a.playtime_forever)
        .slice(0, 5);

      return (
        <div className="steam-dashboard">
          <div className="steam-guest-msg">
            <span>스팀 플레이 기록 기반으로 분석합니다.</span>
          </div>
          <div className="steam-list">
            {top5.map((g) => (
              <div key={g.appid} className="steam-card">
                <img
                  className="steam-game-icon"
                  src={`https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/capsule_184x69.jpg`}
                />
                <div className="steam-info-col">
                  <span className="steam-game-name">{g.name}</span>
                  <span className="steam-playtime">
                    {(g.playtime_forever / 60).toFixed(1)}시간
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    return null;
  };

  /* -----------------------------------------
   * 렌더링
   * ----------------------------------------- */
  return (
    <div className="reco-container">
      <div className="search-panel">
        <h1>개인화 추천</h1>

        {renderSteamBox()}

        {/* 태그 UI — 메인 스타일 동일 */}
        {TAG_GROUPS.map((group) => (
          <div key={group.label} className="tag-group">
            <div className="tag-label">{group.label}</div>
            <div className="tag-list">
              {group.tags.map((tag) => (
                <button
                  key={tag}
                  className={`tag-chip ${picked.includes(tag) ? "on" : ""}`}
                  onClick={() => toggleTag(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        ))}

        <div className="search-row">
          <input
            className="search-input"
            placeholder="특정 게임 이름으로 좁혀보고 싶다면 입력해 보세요."
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
          <button className="search-btn" onClick={fetchReco}>
            추천 받기
          </button>
        </div>
      </div>

      {/* 추천 결과 */}
      {loading && (
        <div className="loading-box">
          <Skeleton lines={3} />
        </div>
      )}

      {errorMsg && <div className="error-box">{errorMsg}</div>}

      {!loading &&
        !errorMsg &&
        games.length > 0 &&
        (
          <div className="game-grid">
            {games.map((g) => (
              <a
                key={g.slug}
                className="game-card"
                href={`/shop/${g.slug}`}
              >
                <img className="thumb" src={g.main_image} />
                <div className="card-info">
                  <div className="game-title">{g.title_ko || g.title}</div>
                  <div className="score-bar">
                    <div style={{ width: `${g.score}%` }} />
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
    </div>
  );
};

export default PersonalRecoPage;

const Game = require('../models/Game');
const User = require('../models/User');

const { getQueryTags } = require('../utils/tagMapper');
const { calculateSimilarity, gameToVector, userToVector } = require('../utils/vector');

const PERSONAL_TAG_POOL = [
  'RPG', 'FPS', '시뮬레이션', '전략', '스포츠', '레이싱', '퍼즐', '생존', '공포', '액션', '어드벤처',
  '1인칭', '3인칭', '탑다운', '사이드뷰', '쿼터뷰',
  '픽셀 그래픽', '2D', '3D', '만화 같은', '현실적', '애니메이션', '귀여운',
  '판타지', '공상과학', '중세', '현대', '우주', '좀비', '사이버펑크', '마법', '전쟁', '포스트아포칼립스',
  '오픈 월드', '자원관리', '스토리 중심', '선택의 중요성', '캐릭터 커스터마이즈', '협동 캠페인',
  '멀티플레이', '싱글플레이', '로그라이크', '소울라이크'
];

function hasMatchedTag(gameTags = [], tag) {
  const regexes = getQueryTags(tag);
  return gameTags.some(t => regexes.some(regex => regex.test(String(t || ''))));
}

function collectValidTags(games = []) {
  const validSet = new Set();

  for (const game of games) {
    const gameTags = (game.smart_tags && game.smart_tags.length > 0)
      ? game.smart_tags
      : (game.tags || []);

    for (const tag of PERSONAL_TAG_POOL) {
      if (hasMatchedTag(gameTags, tag)) {
        validSet.add(tag);
      }
    }
  }

  return Array.from(validSet);
}

function buildTagRegexPool(tags = []) {
  const regexPool = [];
  const seen = new Set();

  for (const tag of tags) {
    const mapped = getQueryTags(tag);
    for (const regex of mapped) {
      const key = regex.toString();
      if (!seen.has(key)) {
        seen.add(key);
        regexPool.push(regex);
      }
    }
  }

  return regexPool;
}

function getTagMatchCountFromTags(gameTags = [], selectedTags = []) {
  if (!selectedTags.length) return 0;

  let count = 0;
  for (const tag of selectedTags) {
    if (hasMatchedTag(gameTags, tag)) {
      count += 1;
    }
  }
  return count;
}

function strictFilterBySelectedTags(games = [], selectedTags = []) {
  if (!selectedTags.length) return games;

  return games.filter(game => {
    const gameTags = (game.smart_tags && game.smart_tags.length > 0)
      ? game.smart_tags
      : (game.tags || []);

    return getTagMatchCountFromTags(gameTags, selectedTags) > 0;
  });
}

function sortGamesByTagPreference(games = [], selectedTags = [], fallbackComparator = null) {
  const decorated = games.map(game => {
    const gameTags = (game.smart_tags && game.smart_tags.length > 0)
      ? game.smart_tags
      : (game.tags || []);

    return {
      ...game,
      __tagMatchCount: getTagMatchCountFromTags(gameTags, selectedTags)
    };
  });

  decorated.sort((a, b) => {
    if (selectedTags.length > 0 && (b.__tagMatchCount || 0) !== (a.__tagMatchCount || 0)) {
      return (b.__tagMatchCount || 0) - (a.__tagMatchCount || 0);
    }

    if (typeof fallbackComparator === 'function') {
      return fallbackComparator(a, b);
    }

    return 0;
  });

  return decorated.map(({ __tagMatchCount, ...game }) => game);
}

class RecommendController {
  async getPersonalRecommendations(req, res) {
    try {
      const { userId, tags, term } = req.body;

      const userSelectedTags = Array.isArray(tags) ? tags : [];
      let userLikedTagsFromDB = [];
      let userSteamGames = [];
      let userType = '초심자';

      if (userId) {
        const user = await User.findById(userId);
        if (user) {
          if (user.likedTags) userLikedTagsFromDB = user.likedTags;
          if (user.steamGames) userSteamGames = user.steamGames;
          if (user.playerType) userType = user.playerType;
        }
      }

      // ★ 핵심: 사용자가 태그를 직접 눌렀으면 그 태그만 우선 사용
      // 태그를 안 눌렀을 때만 DB likedTags를 기본 취향으로 사용
      const activePreferenceTags = userSelectedTags.length > 0
        ? [...new Set(userSelectedTags)]
        : [...new Set(userLikedTagsFromDB)];

      const hasTags = activePreferenceTags.length > 0;
      const hasSteam = userSteamGames.length > 0;

      let activeFactors = 2;
      if (hasTags) activeFactors += 1;
      if (hasSteam) activeFactors += 1;

      const weightPerFactor = 100 / activeFactors;

      const candidateQuery = {
        "steam_reviews.overall.total": { $gte: 500 },
        isAdult: { $ne: true }
      };

      if (term && String(term).trim()) {
        const keyword = String(term).trim();
        candidateQuery.$or = [
          { title: { $regex: keyword, $options: 'i' } },
          { title_ko: { $regex: keyword, $options: 'i' } },
          { slug: { $regex: keyword, $options: 'i' } }
        ];
      }

      // ★ 직접 누른 태그가 있으면 후보군부터 해당 태그 관련 게임으로 제한
      if (userSelectedTags.length > 0) {
        const selectedTagRegexPool = buildTagRegexPool(userSelectedTags);
        if (selectedTagRegexPool.length > 0) {
          candidateQuery.smart_tags = { $in: selectedTagRegexPool };
        }
      }

      let candidateGames = await Game.find(candidateQuery)
        .limit(hasTags ? 400 : 200)
        .lean();

      if (userSelectedTags.length > 0) {
        candidateGames = strictFilterBySelectedTags(candidateGames, userSelectedTags);
      }

      const maxTrendScore = Math.max(...candidateGames.map(g => g.trend_score || g.steam_ccu || 0), 1);

      const userTagVec = hasTags ? userToVector(activePreferenceTags, []) : {};
      const userSteamVec = hasSteam ? userToVector([], userSteamGames) : {};

      const topPlayed = [...userSteamGames]
        .sort((a, b) => b.playtime_forever - a.playtime_forever)
        .slice(0, 5);

      let personalizedComprehensive = candidateGames.map(game => {
        const gameTags = (game.smart_tags && game.smart_tags.length > 0) ? game.smart_tags : (game.tags || []);
        const gameVec = gameToVector(gameTags);

        const reviewScore = game.steam_reviews?.overall?.percent || 0;
        const trendScore = ((game.trend_score || game.steam_ccu || 0) / maxTrendScore) * 100;
        const tagScore = hasTags ? calculateSimilarity(userTagVec, gameVec) * 100 : 0;
        const steamScore = hasSteam ? calculateSimilarity(userSteamVec, gameVec) * 100 : 0;

        const weightedReview = reviewScore * (weightPerFactor / 100);
        const weightedTrend = trendScore * (weightPerFactor / 100);
        const weightedTag = hasTags ? (tagScore * (weightPerFactor / 100)) : 0;
        const weightedSteam = hasSteam ? (steamScore * (weightPerFactor / 100)) : 0;

        let finalScore = weightedReview + weightedTrend + weightedTag + weightedSteam;

        if (userType === '초심자') {
          if (gameTags.some(t => ['소울라이크', '하드코어', '어려움'].includes(t))) {
            finalScore *= 0.7;
          }
        } else if (userType === '심화') {
          if (gameTags.some(t => ['복잡한', '전략적', '심화'].includes(t))) {
            finalScore *= 1.2;
          }
        }

        const matchedTag = activePreferenceTags.find(t => hasMatchedTag(gameTags, t));
        const matchedSteamGame = topPlayed.find(tp => {
          const tpTags = (tp.smart_tags && tp.smart_tags.length > 0) ? tp.smart_tags : (tp.tags || []);
          return tpTags.some(tag => gameTags.includes(tag));
        });

        const reasonCandidates = [
          {
            score: weightedReview,
            text: reviewScore >= 90 ? '유저 평가가 매우 높아 추천' : '유저 평가가 좋아 추천'
          },
          {
            score: weightedTrend,
            text: '현재 트렌드 점수가 높아 추천'
          }
        ];

        if (hasTags) {
          reasonCandidates.push({
            score: weightedTag,
            text: matchedTag ? `${matchedTag} 취향과 잘 맞아서 추천` : '선호 태그와 잘 맞아서 추천'
          });
        }

        if (hasSteam) {
          reasonCandidates.push({
            score: weightedSteam,
            text: matchedSteamGame
              ? `스팀에서 많이 즐기신 '${matchedSteamGame.name}'와 비슷해서 추천`
              : '플레이 성향과 비슷해서 추천'
          });
        }

        reasonCandidates.sort((a, b) => b.score - a.score);
        const topReason = reasonCandidates[0]?.text || '종합 점수가 높아 추천';

        return { ...game, finalScore, topReason };
      });

      personalizedComprehensive.sort((a, b) => b.finalScore - a.finalScore);
      personalizedComprehensive = personalizedComprehensive.slice(0, 10);

      const costEffectiveQuery = {
        $or: [
          { "price_info.discount_percent": { $gte: 50 } },
          { "price_info.current_price": { $lte: 10000, $gt: 0 } }
        ],
        "steam_reviews.overall.percent": { $gte: 80 },
        isAdult: { $ne: true }
      };

      const trendQuery = {
        steam_ccu: { $gt: 0 },
        isAdult: { $ne: true }
      };

      const hiddenGemQuery = {
        "steam_reviews.overall.total": { $lt: 1000, $gt: 50 },
        "steam_reviews.overall.percent": { $gte: 90 },
        isAdult: { $ne: true }
      };

      const multiplayerQuery = {
        $or: [
          { smart_tags: { $in: getQueryTags('멀티플레이').concat(getQueryTags('협동 캠페인')) } },
          { tags: { $in: ['Multiplayer', 'Co-op', '멀티플레이', '협동'] } }
        ],
        isAdult: { $ne: true }
      };

      // ★ 직접 누른 태그가 있으면 각 섹션도 그 태그 관련 게임만 통과
      if (userSelectedTags.length > 0) {
        const selectedTagRegexPool = buildTagRegexPool(userSelectedTags);
        if (selectedTagRegexPool.length > 0) {
          costEffectiveQuery.smart_tags = { $in: selectedTagRegexPool };
          trendQuery.smart_tags = { $in: selectedTagRegexPool };
          hiddenGemQuery.smart_tags = { $in: selectedTagRegexPool };
          multiplayerQuery.$and = [{ smart_tags: { $in: selectedTagRegexPool } }];
        }
      }

      let [
        costEffectiveRaw,
        trendRaw,
        hiddenGemRaw,
        multiplayerRaw
      ] = await Promise.all([
        Game.find(costEffectiveQuery).sort({ "price_info.discount_percent": -1 }).limit(hasTags ? 40 : 10).lean(),
        Game.find(trendQuery).sort({ steam_ccu: -1 }).limit(hasTags ? 40 : 10).lean(),
        Game.find(hiddenGemQuery).sort({ "steam_reviews.overall.percent": -1 }).limit(hasTags ? 40 : 10).lean(),
        Game.find(multiplayerQuery).sort({ steam_ccu: -1 }).limit(hasTags ? 40 : 10).lean()
      ]);

      if (userSelectedTags.length > 0) {
        costEffectiveRaw = strictFilterBySelectedTags(costEffectiveRaw, userSelectedTags);
        trendRaw = strictFilterBySelectedTags(trendRaw, userSelectedTags);
        hiddenGemRaw = strictFilterBySelectedTags(hiddenGemRaw, userSelectedTags);
        multiplayerRaw = strictFilterBySelectedTags(multiplayerRaw, userSelectedTags);
      }

      const costEffective = sortGamesByTagPreference(
        costEffectiveRaw,
        userSelectedTags,
        (a, b) => (b.price_info?.discount_percent || 0) - (a.price_info?.discount_percent || 0)
      ).slice(0, 10);

      const trend = sortGamesByTagPreference(
        trendRaw,
        userSelectedTags,
        (a, b) => (b.steam_ccu || 0) - (a.steam_ccu || 0)
      ).slice(0, 10);

      const hiddenGem = sortGamesByTagPreference(
        hiddenGemRaw,
        userSelectedTags,
        (a, b) => (b.steam_reviews?.overall?.percent || 0) - (a.steam_reviews?.overall?.percent || 0)
      ).slice(0, 10);

      const multiplayer = sortGamesByTagPreference(
        multiplayerRaw,
        userSelectedTags,
        (a, b) => (b.steam_ccu || 0) - (a.steam_ccu || 0)
      ).slice(0, 10);

      const addReason = (game, defaultReason) => ({
        ...game,
        reason: game.topReason || defaultReason
      });

      const resultData = {
        comprehensive: personalizedComprehensive.map(g =>
          addReason(g, "회원님의 데이터를 100점 만점으로 환산한 종합 분석 1위입니다.")
        ),
        costEffective: costEffective.map(g =>
          addReason(g, "현재 높은 할인율을 자랑하는 가성비 추천작입니다.")
        ),
        trend: trend.map(g =>
          addReason(g, "현재 전 세계 게이머들이 가장 많이 즐기고 있는 대세 게임입니다.")
        ),
        hiddenGem: hiddenGem.map(g =>
          addReason(g, "압도적인 긍정 평가를 받은 숨겨진 명작입니다.")
        ),
        multiplayer: multiplayer.map(g =>
          addReason(g, "친구들이나 다른 유저와 멀티플레이로 즐기기 좋은 게임입니다.")
        )
      };

      const validTags = collectValidTags(
        userSelectedTags.length > 0
          ? [
              ...candidateGames,
              ...costEffectiveRaw,
              ...trendRaw,
              ...hiddenGemRaw,
              ...multiplayerRaw
            ]
          : [
              ...candidateGames,
              ...costEffectiveRaw,
              ...trendRaw,
              ...hiddenGemRaw,
              ...multiplayerRaw
            ]
      );

      return res.status(200).json({
        success: true,
        data: resultData,
        validTags
      });

    } catch (error) {
      console.error("❌ [RecommendController] 데이터 파이프라인 처리 중 에러 발생:", error);
      return res.status(500).json({
        success: false,
        error: "Server Error",
        message: error.message,
        data: {
          comprehensive: [],
          costEffective: [],
          trend: [],
          hiddenGem: [],
          multiplayer: []
        },
        validTags: []
      });
    }
  }
}

module.exports = new RecommendController();
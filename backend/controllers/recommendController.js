const Game = require('../models/Game');
const User = require('../models/User');

const { calculateSimilarity, gameToVector, userToVector } = require('../utils/vector');

function normalizeTag(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[\s/_-]+/g, '');
}

const KOREAN_ALIAS_MAP = {
  [normalizeTag('횡스크롤')]: '횡스크롤',
  [normalizeTag('사이드뷰')]: '횡스크롤',
  [normalizeTag('사이드스크롤')]: '횡스크롤',
  [normalizeTag('오픈월드')]: '오픈 월드',
  [normalizeTag('멀티')]: '멀티플레이',
  [normalizeTag('멀티 플레이')]: '멀티플레이',
  [normalizeTag('협동')]: '협동 캠페인',
  [normalizeTag('협동플레이')]: '협동 캠페인',
  [normalizeTag('탑뷰')]: '탑다운',
  [normalizeTag('애니')]: '애니메이션',
  [normalizeTag('경쟁pvp')]: '경쟁/PvP',
  [normalizeTag('경쟁/pvp')]: '경쟁/PvP',
  [normalizeTag('pvp')]: '경쟁/PvP'
};

const KOREAN_VARIANTS = {
  '횡스크롤': ['횡스크롤', '사이드뷰', '사이드 스크롤'],
  '오픈 월드': ['오픈 월드', '오픈월드'],
  '멀티플레이': ['멀티플레이', '멀티 플레이', '멀티'],
  '협동 캠페인': ['협동 캠페인', '협동', '협동플레이', '코옵'],
  '탑다운': ['탑다운', '탑뷰'],
  '애니메이션': ['애니메이션', '애니'],
  '경쟁/PvP': ['경쟁/PvP', '경쟁PVP', 'PVP', 'PvP']
};

function createLooseRegex(tag = '') {
  const escaped = String(tag)
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s*');

  return new RegExp(`^${escaped}$`, 'i');
}

function safeGetQueryTags(inputTag) {
  try {
    const tagMapper = require('../utils/tagMapper');
    if (tagMapper && typeof tagMapper.getQueryTags === 'function') {
      return tagMapper.getQueryTags(inputTag);
    }
  } catch (e) {}

  const normalizedInput = normalizeTag(inputTag);
  const canonicalTag = KOREAN_ALIAS_MAP[normalizedInput] || inputTag;
  const variants = KOREAN_VARIANTS[canonicalTag] || [];
  const pool = new Set([inputTag, canonicalTag, ...variants]);

  return Array.from(pool).map(createLooseRegex);
}

class RecommendController {
  async getPersonalRecommendations(req, res) {
    try {
      const { userId, tags, term } = req.body;
      let personalizedComprehensive = [];
      
      let userSelectedTags = Array.isArray(tags) ? tags : [];
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

      const combinedTags = [...new Set([...userSelectedTags, ...userLikedTagsFromDB])];

      const hasTags = combinedTags.length > 0;
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

      const candidateGames = await Game.find(candidateQuery).limit(200).lean();

      const maxTrendScore = Math.max(...candidateGames.map(g => g.trend_score || g.steam_ccu || 0), 1);

      const userTagVec = hasTags ? userToVector(combinedTags, []) : {};
      const userSteamVec = hasSteam ? userToVector([], userSteamGames) : {};

      const topPlayed = [...userSteamGames]
        .sort((a, b) => b.playtime_forever - a.playtime_forever)
        .slice(0, 5);

      const scoredGames = candidateGames.map(game => {
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

        const matchedTag = combinedTags.find(t => gameTags.includes(t));
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

      scoredGames.sort((a, b) => b.finalScore - a.finalScore);
      personalizedComprehensive = scoredGames.slice(0, 10);

      const [
        costEffective,
        trend,
        hiddenGem,
        multiplayer
      ] = await Promise.all([
        Game.find({
          $or: [
            { "price_info.discount_percent": { $gte: 50 } },
            { "price_info.current_price": { $lte: 10000, $gt: 0 } }
          ],
          "steam_reviews.overall.percent": { $gte: 80 },
          isAdult: { $ne: true }
        }).sort({ "price_info.discount_percent": -1 }).limit(10).lean(),

        Game.find({ steam_ccu: { $gt: 0 }, isAdult: { $ne: true } })
          .sort({ steam_ccu: -1 }).limit(10).lean(),

        Game.find({
          "steam_reviews.overall.total": { $lt: 1000, $gt: 50 },
          "steam_reviews.overall.percent": { $gte: 90 },
          isAdult: { $ne: true }
        }).sort({ "steam_reviews.overall.percent": -1 }).limit(10).lean(),

        Game.find({
          $or: [
            { smart_tags: { $in: safeGetQueryTags('멀티플레이').concat(safeGetQueryTags('협동 캠페인')) } },
            { tags: { $in: ['Multiplayer', 'Co-op', '멀티플레이', '협동'] } }
          ],
          isAdult: { $ne: true }
        }).sort({ steam_ccu: -1 }).limit(10).lean()
      ]);

      const addReason = (game, defaultReason) => ({
        ...game,
        reason: game.topReason || defaultReason
      });

      return res.status(200).json({
        success: true,
        data: {
          comprehensive: personalizedComprehensive.map(g => addReason(g, "회원님의 데이터를 100점 만점으로 환산한 종합 분석 1위입니다.")),
          costEffective: costEffective.map(g => addReason(g, "현재 높은 할인율을 자랑하는 가성비 추천작입니다.")),
          trend: trend.map(g => addReason(g, "현재 전 세계 게이머들이 가장 많이 즐기고 있는 대세 게임입니다.")),
          hiddenGem: hiddenGem.map(g => addReason(g, "압도적인 긍정 평가를 받은 숨겨진 명작입니다.")),
          multiplayer: multiplayer.map(g => addReason(g, "친구들이나 다른 유저와 멀티플레이로 즐기기 좋은 게임입니다."))
        }
      });

    } catch (error) {
      console.error("❌ [RecommendController] 데이터 파이프라인 처리 중 에러 발생:", error);
      return res.status(500).json({ error: "Server Error", message: error.message });
    }
  }
}

module.exports = new RecommendController();
// backend/utils/steam.js

import axios from 'axios';
// Node.js 환경에서 .env 파일을 읽기 위해 필요할 수 있습니다.
import 'dotenv/config'; 

const STEAM_WEB_API_KEY = process.env.STEAM_WEB_API_KEY;

/**
 * 사용자 소유 게임 목록과 플레이 시간을 Steam Web API에서 가져옵니다.
 * @param {string} steamId - 사용자의 64비트 SteamID
 * @returns {Promise<Array>} 소유 게임 목록 (appid, playtime_forever 등 포함)
 */
export async function getOwnedGames(steamId) {
    if (!STEAM_WEB_API_KEY) {
        // 실제 운영 시에는 이 에러가 발생하지 않도록 환경 설정 필수
        throw new Error("STEAM_WEB_API_KEY is not set.");
    }
    
    const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/`;

    try {
        const res = await axios.get(url, {
            params: {
                key: STEAM_WEB_API_KEY,
                steamid: steamId,
                include_appinfo: true,
                include_played_free_games: true,
                format: 'json'
            }
        });

        return res.data?.response?.games || [];
        
    } catch (error) {
        console.error(`Steam Web API GetOwnedGames Error for ${steamId}:`, error.message);
        // API 요청 실패 시 빈 목록 반환하여 서비스 중단 방지
        return [];
    }
}
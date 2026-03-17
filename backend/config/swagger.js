const swaggerJSDoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'AuraProject API',
      version: '1.0.0',
      description: '졸업작품 게임 추천 서비스 API 명세서',
    },
    servers: [
      {
        url: process.env.BACKEND_URL || 'http://localhost:8000',
        description: 'Local Server',
      },
    ],
    // 주석 대신 이곳에 직접 API 명세를 정의합니다 (들여쓰기 에러 원천 차단)
    paths: {
      '/api/advanced/personal': {
        post: {
          summary: '개인화 게임 추천 요청',
          tags: ['Recommendation'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    userId: { type: 'string' },
                    tags: { type: 'array', items: { type: 'string' } },
                    term: { type: 'string' }
                  }
                }
              }
            }
          },
          responses: {
            200: { description: '추천 게임 리스트 반환' }
          }
        }
      },
      '/api/recommend': {
        post: {
          summary: '메인 페이지 필터링 및 검색 결과 반환',
          tags: ['Main'],
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    tags: { type: 'array', items: { type: 'string' } },
                    sortBy: { type: 'string' },
                    page: { type: 'integer' },
                    searchQuery: { type: 'string' }
                  }
                }
              }
            }
          },
          responses: {
            200: { description: '게임 리스트 및 페이지네이션 반환' }
          }
        }
      },
      '/api/games/{id}': {
        get: {
          summary: '특정 게임 상세 메타데이터 반환',
          tags: ['Main'],
          parameters: [
            {
              in: 'path',
              name: 'id',
              required: true,
              schema: { type: 'string' },
              description: '게임의 고유 slug'
            }
          ],
          responses: {
            200: { description: '게임 상세 정보 반환' }
          }
        }
      }
    }
  },
  // 더 이상 라우터 파일의 주석을 스캔하지 않도록 비워둡니다.
  apis: [], 
};

const swaggerSpec = swaggerJSDoc(options);
module.exports = swaggerSpec;
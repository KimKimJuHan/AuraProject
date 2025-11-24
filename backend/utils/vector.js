function calculateSimilarity(vecA, vecB) {
  let dotProduct = 0, magA = 0, magB = 0;
  const allTags = new Set([...Object.keys(vecA), ...Object.keys(vecB)]);
  allTags.forEach(tag => {
    const valA = vecA[tag] || 0;
    const valB = vecB[tag] || 0;
    dotProduct += valA * valB;
    magA += valA * valA;
    magB += valB * valB;
  });
  return (magA === 0 || magB === 0) ? 0 : dotProduct / (magA * magB);
}

function gameToVector(tags) {
  const vec = {};
  if(Array.isArray(tags)) tags.forEach(tag => vec[tag] = 1);
  return vec;
}

function userToVector(likedTags) {
  const vec = {};
  if(Array.isArray(likedTags)) likedTags.forEach(tag => vec[tag] = (vec[tag] || 0) + 3);
  return vec;
}

module.exports = { calculateSimilarity, gameToVector, userToVector };
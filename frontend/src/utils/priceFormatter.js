export function formatPrice(priceInfo, region) {
    if (!priceInfo) return "가격 정보 없음";
    
    const basePrice = Number(priceInfo.current_price || 0);

    if (priceInfo.isFree || basePrice === 0) {
        return "무료";
    }

    const isBaseKRW = basePrice > 500;
    const krwPrice = isBaseKRW ? basePrice : basePrice * 1350;
    const usdPrice = isBaseKRW ? basePrice / 1350 : basePrice;

    if (region === 'US') return `$${usdPrice.toFixed(2)}`;
    if (region === 'JP') return `¥${Math.round(krwPrice / 9).toLocaleString()}`;
    return `₩${Math.round(krwPrice).toLocaleString()}`;
}
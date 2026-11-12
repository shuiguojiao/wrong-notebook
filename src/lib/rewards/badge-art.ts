/** 按编号固定倾角，刷新和不同入口保持同一枚章的手盖位置。 */
export function badgeArtTilt(id: string): number {
    let hash = 0;
    for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    return hash % 17 - 8;
}

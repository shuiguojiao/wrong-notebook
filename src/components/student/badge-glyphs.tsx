import type { BadgeId } from '@/lib/rewards/badges';

interface BadgeGlyphProps { badgeId: BadgeId }
interface BadgeNumberProps { value: string; y?: number }

// 用路径绘制数字，避免安装包中的字体差异影响章面。
const digits: Record<string, string> = {
    '0': 'M9 0 C-2 0 -2 28 9 28 C20 28 20 0 9 0Z',
    '1': 'M3 6 10 0 V28 M3 28 H17',
    '3': 'M1 2 Q18 -5 17 7 Q17 13 9 14 Q20 13 18 22 Q16 32 1 26',
    '7': 'M0 0 H19 L6 28',
    '4': 'M13 0 0 19 H20 M15 0 V28',
};

function BadgeNumber({ value, y = 49 }: BadgeNumberProps) {
    const width = value.length * 24 - 6;
    return <g transform={`translate(${60 - width / 2} ${y})`}>
        {[...value].map((digit, index) => <path key={index} d={digits[digit]} transform={`translate(${index * 24} 0)`} />)}
    </g>;
}

const star = 'M60 30 67 46 85 48 72 61 76 79 60 70 44 79 48 61 35 48 53 46Z';
const sticker = 'M39 36 H79 V67 L63 84 H39Z M79 67 H63 V84';

function PersistenceGlyph({ badgeId }: BadgeGlyphProps) {
    const value = badgeId.slice('streak-'.length);
    const count = Number(value);
    if (count === 100) return <>
        <g strokeWidth="2.5"><path d="M36 91 Q13 59 38 28 M84 91 Q107 59 82 28" />
            {Array.from({ length: 7 }, (_, index) => <g key={index} transform={`rotate(${index * 16 - 48} 60 60)`}>
                <ellipse cx="25" cy="60" rx="3" ry="7" transform="rotate(-35 25 60)" fill="currentColor" stroke="none" />
                <ellipse cx="95" cy="60" rx="3" ry="7" transform="rotate(35 95 60)" fill="currentColor" stroke="none" />
            </g>)}
        </g><g transform="translate(60 60) scale(.58) translate(-60 -63)"><BadgeNumber value={value} /></g>
    </>;
    return <>
        {count <= 7 ? Array.from({ length: count }, (_, index) => <circle key={index} cx={60 + (index - (count - 1) / 2) * 7} cy="35" r="2" fill="currentColor" stroke="none" />)
            : Array.from({ length: count }, (_, index) => <g key={index} transform={`rotate(${index * 360 / count} 60 60)`}>
                {count === 30 ? <path d="M60 24 V28" strokeWidth="2" /> : <circle cx="60" cy="26" r="1.8" fill="currentColor" stroke="none" />}
            </g>)}
        {/* 两位数缩小一点，避开外圈的点和刻度。 */}
        {value.length > 1 ? <g transform="translate(60 60) scale(.8) translate(-60 -63)"><BadgeNumber value={value} /></g> : <BadgeNumber value={value} />}
    </>;
}

export function BadgeGlyph({ badgeId }: BadgeGlyphProps) {
    if (badgeId.startsWith('streak-')) return <PersistenceGlyph badgeId={badgeId} />;
    switch (badgeId) {
        case 'brave-1': return <path d={star} />;
        case 'brave-10': return <><path d={star} transform="translate(15 8) scale(.75)" /><g transform="translate(21 25) scale(.65)"><BadgeNumber value="10" y={70} /></g></>;
        case 'brave-comeback': return <><path d="M35 87 H85 M60 86 V57 M60 68 Q32 68 35 43 Q60 42 60 68 M60 58 Q62 34 86 37 Q88 60 60 58" /><path d="M43 86 Q60 76 77 86" opacity=".4" /></>;
        case 'sticker-1': return <path d={sticker} />;
        case 'notebook-mastered': return <><rect x="35" y="31" width="52" height="61" rx="5" /><path d="M44 31 V92 M54 59 63 69 78 49 M35 84 H87" /></>;
        case 'sticker-week-3': return <><path d="M28 71 V29 H67 M36 78 V36 H75" opacity=".55" /><path d={sticker} transform="translate(5 6)" /></>;
        case 'correction-10': return <><path d="M37 47 51 61 81 31" strokeWidth="4" /><g transform="translate(15 20) scale(.75)"><BadgeNumber value="10" y={65} /></g></>;
        case 'early-bird': return <><path d="M29 79 A31 31 0 0 1 91 79 M27 80 H93 M60 35 V29 M34 46 29 41 M85 46 90 41" opacity=".45" /><path d="M42 61 Q49 49 61 56 Q61 41 72 44 Q83 49 76 62 Q70 76 52 73 L41 75 46 67Z M78 51 86 55 77 57 M55 74 V80 M67 73 V80 M52 60 Q59 70 65 60" /><circle cx="72" cy="50" r="1.8" fill="currentColor" stroke="none" /></>;
        // 小月历：一周 7 格排成 4 + 3，周末填满后两格，全勤填满全部。
        case 'weekend':
        case 'full-week': return <>
            <rect x="28" y="38" width="64" height="52" rx="6" strokeWidth="3" /><path d="M28 50 H92 M44 32 V43 M76 32 V43" strokeWidth="3" />
            {Array.from({ length: 7 }, (_, index) => <rect key={index} x={34 + (index % 4) * 14} y={56 + Math.floor(index / 4) * 16} width="10" height="10" rx="2" strokeWidth="2"
                fill={badgeId === 'full-week' || index >= 5 ? 'currentColor' : 'none'} />)}
        </>;
    }
}

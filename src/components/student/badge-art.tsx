import { BadgeGlyph } from '@/components/student/badge-glyphs';
import type { BadgeCategory, BadgeId } from '@/lib/rewards/badges';

interface BadgeArtProps { badgeId: BadgeId; category: BadgeCategory; earned: boolean; concealed?: boolean }
interface BadgeOutlineProps { category: BadgeCategory }

const wavePoint = (angle: number, radius: number) => `${60 + Math.sin(angle) * radius} ${60 - Math.cos(angle) * radius}`;
const wave = `M60 10 ${Array.from({ length: 12 }, (_, index) => {
    const angle = index * Math.PI / 6;
    return `Q${wavePoint(angle + Math.PI / 12, 62)} ${wavePoint(angle + Math.PI / 6, 50)}`;
}).join(' ')} Z`;

function BadgeOutline({ category }: BadgeOutlineProps) {
    switch (category) {
        case 'persistence': return <><circle cx="60" cy="60" r="54" /><circle cx="60" cy="60" r="45" strokeWidth="1.5" strokeDasharray="3 4" /></>;
        case 'courage': return <><path d="M60 6 102 22 100 66 C96 92 78 106 60 116 C42 106 24 92 20 66 L18 22Z" /><path d="M60 16 93 29 91 65 Q87 90 60 105 Q33 90 29 65 L27 29Z" strokeWidth="1.5" strokeDasharray="3 4" /></>;
        case 'correction': return <><rect x="10" y="10" width="100" height="100" rx="18" /><rect x="19" y="19" width="82" height="82" rx="12" strokeWidth="1.5" strokeDasharray="3 4" /></>;
        case 'hidden': return <><path d={wave} /><circle cx="60" cy="60" r="43" strokeWidth="1.5" strokeDasharray="3 4" /></>;
    }
}

export function BadgeArt({ badgeId, category, earned, concealed = false }: BadgeArtProps) {
    return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120" aria-hidden="true"
        className="h-full w-full" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
        {concealed ? <><circle cx="60" cy="60" r="54" strokeDasharray="5 5" /><path d="M48 45 C48 27 79 28 76 47 C75 57 60 57 60 70 M60 82 V83" strokeWidth="4" /></> : <>
            <g strokeDasharray={earned ? undefined : '5 5'}><BadgeOutline category={category} /></g>
            <g opacity={earned ? 1 : .35}><BadgeGlyph badgeId={badgeId} /></g>
        </>}
    </svg>;
}

"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { EnergyBean } from '@/components/student/energy-bean';
import { NoteCard } from '@/components/student/note-card';
import { FunStickerArt } from '@/components/student/fun-sticker-art';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUiStyle } from '@/contexts/UiStyleContext';
import { readRewardSeen, writeRewardSeen } from '@/lib/rewards/device-state';
import { FUN_STICKERS } from '@/lib/rewards/fun-stickers';
import { REWARD_RULES } from '@/lib/rewards/rules';
import type { RewardSummaryResponse } from '@/types/api';

interface WeeklyBoxProps { weekStart: string; box: NonNullable<RewardSummaryResponse['weekly']['box']> }
const motionQuery = '(prefers-reduced-motion: reduce)';
const subscribeMotion = (callback: () => void) => {
    const media = window.matchMedia?.(motionQuery);
    media?.addEventListener('change', callback);
    return () => media?.removeEventListener('change', callback);
};
const reducedSnapshot = () => window.matchMedia?.(motionQuery).matches ?? false;

export function WeeklyBox(props: WeeklyBoxProps) {
    return <WeeklyBoxContent key={props.weekStart} {...props} />;
}

function WeeklyBoxContent({ weekStart, box }: WeeklyBoxProps) {
    const { t } = useLanguage();
    const { style } = useUiStyle();
    const reduced = useSyncExternalStore(subscribeMotion, reducedSnapshot, () => false);
    const immediate = reduced || style === 'simple';
    const [opened, setOpened] = useState(false);
    const [animate, setAnimate] = useState(false);
    const envelope = useRef<HTMLDivElement>(null);
    const key = `box:${weekStart}`;
    const open = useCallback((withAnimation = false) => {
        setAnimate(withAnimation);
        setOpened(true);
        writeRewardSeen(key);
        window.dispatchEvent(new Event('reward-box-opened'));
    }, [key]);
    useEffect(() => {
        const restore = () => { if (readRewardSeen(key)) setOpened(true); };
        restore();
        window.addEventListener('reward-box-opened', restore);
        window.addEventListener('storage', restore);
        return () => {
            window.removeEventListener('reward-box-opened', restore);
            window.removeEventListener('storage', restore);
        };
    }, [key]);
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 简洁或减少动画模式直接打开，同时同步设备翻开记录。
        if (immediate) open();
    }, [immediate, open]);
    useEffect(() => {
        if (opened || immediate || !envelope.current || typeof IntersectionObserver === 'undefined') return;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const observer = new IntersectionObserver(entries => {
            clearTimeout(timer);
            if (entries.some(entry => entry.isIntersecting)) timer = setTimeout(() => open(true), 2000);
        });
        observer.observe(envelope.current);
        return () => { clearTimeout(timer); observer.disconnect(); };
    }, [opened, immediate, open]);
    const visible = opened || immediate;
    const sticker = FUN_STICKERS.find(item => item.id === box.stickerId);
    const setName = t.rewards.funSets[box.setCompleted as keyof typeof t.rewards.funSets];
    return <NoteCard tape><section aria-label={t.rewards.weeklyReached} className="space-y-3">
        <h3 className="font-title text-xl font-semibold">{t.rewards.weeklyReached}</h3>
        <p className="flex items-center gap-2"><EnergyBean />{t.rewards.earnedReview.replace('{points}', String(REWARD_RULES.weekly.points))}</p>
        <div ref={envelope} className="student-weekly-box" data-open={visible} data-animate={animate && !immediate}>
            <button type="button" aria-expanded={visible} onClick={() => { if (!visible) open(true); }} className="inline-flex min-h-11 min-w-11 flex-col items-center rounded-lg p-2 focus-visible:outline-2 focus-visible:outline-ring">
                <svg aria-hidden="true" viewBox="0 -40 120 120" className="h-30 w-30 overflow-visible text-primary">
                    <rect x="4" y="12" width="112" height="64" rx="6" className="fill-card stroke-current" strokeWidth="2" />
                    <path d="M4 76 60 36 116 76" className="fill-muted stroke-current" strokeWidth="2" />
                    <path d="M4 12 60 52 116 12Z" className="student-envelope-flap fill-secondary stroke-current" strokeWidth="2" />
                </svg>
                <span className={visible ? 'sr-only' : 'text-sm'}>{t.rewards.openBox}</span>
            </button>
            {visible && <div className="student-box-treasure space-y-2" role="status">
                {sticker ? <><FunStickerArt id={sticker.id} size={96} loading="eager" /><p>{t.rewards.funNames[sticker.nameKey as keyof typeof t.rewards.funNames]}</p></> : <p>{t.rewards.earnedReview.replace('{points}', String(box.points))}</p>}
                {setName && <p className="text-sm font-medium">{t.rewards.setCompleted.replace('{set}', setName).replace('{points}', String(REWARD_RULES.funSet.points))}</p>}
            </div>}
        </div>
    </section></NoteCard>;
}

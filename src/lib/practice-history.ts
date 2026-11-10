import "server-only";

import type { Prisma } from '@prisma/client';
import { getAppTimeZone } from '@/lib/config';
import { dateInputToISOString, formatDateTime, getDayRange, shiftCalendarDate } from '@/lib/date-time';
import { withPublicImage } from '@/lib/image-response';
import { isLocalImage } from '@/lib/image-storage';
import { prisma } from '@/lib/prisma';
import { extractMathSegments } from '@/lib/markdown-math';
import { practiceSubjectWhere } from '@/lib/stats/stats-filter';
import type { PracticeCalendarResponse, PracticeDaySummary, PracticeHistoryDay, PracticeHistoryPage, PracticeResult, PracticeRecordDetail } from '@/types/api';

export function practiceDayKey(date: Date | string, timeZone: string): string {
    return formatDateTime(date, 'yyyy-MM-dd', timeZone);
}

/** 旧记录只在 result 为空时沿用 isCorrect。 */
export function resolvePracticeResult(record: { result: string | null; isCorrect: boolean | null }): PracticeResult | null {
    if (record.result !== null) {
        return record.result === 'correct' || record.result === 'wrong' || record.result === 'not_attempted' ? record.result : null;
    }
    if (record.isCorrect === null) return null;
    return record.isCorrect ? 'correct' : 'wrong';
}

export function practicePreview(text: string | null): string {
    const { masked, segments } = extractMathSegments(text);
    const parts = masked.replace(/\s+/gu, ' ').trim().split(/(@@MATH\d+@@)/u);
    let preview = '';
    let remaining = 120;
    for (const part of parts) {
        const match = /^@@MATH(\d+)@@$/u.exec(part);
        const value = match ? segments[Number(match[1])]?.source ?? part : part;
        const characters = Array.from(value);
        if (characters.length > remaining) {
            // 边界落在公式中时退回公式前，普通文字按完整字符截取。
            if (!match) preview += characters.slice(0, remaining).join('');
            return `${preview.trimEnd()}…`;
        }
        preview += value;
        remaining -= characters.length;
    }
    return preview;
}

export function summarizePracticeDay(records: readonly { result: string | null; isCorrect: boolean | null; source: string; durationSec: number | null }[]): PracticeDaySummary {
    const summary: PracticeDaySummary = { total: 0, correct: 0, wrong: 0, notAttempted: 0, reviewDurationSec: 0 };
    for (const record of records) {
        const result = resolvePracticeResult(record);
        if (result === 'correct' || result === 'wrong') {
            summary[result]++;
            summary.total++;
        }
        if (result === 'not_attempted') summary.notAttempted++;
        if (result && record.source === 'review') summary.reviewDurationSec += record.durationSec ?? 0;
    }
    return summary;
}

export function practiceDateRange(date: string, timeZone: string, days = 1) {
    const start = getDayRange(new Date(dateInputToISOString(date, timeZone)), timeZone).start;
    return { start, end: shiftCalendarDate(start, timeZone, days) };
}

function historyWhere(userId: string, subject: { id: string; name: string } | null, wrongOnly = false): Prisma.PracticeRecordWhereInput {
    return {
        userId,
        source: { in: ['review', 'practice', 'exam', 'manual'] },
        AND: [
            { OR: [
                { result: wrongOnly ? 'wrong' : { in: ['correct', 'wrong', 'not_attempted'] } },
                { result: null, isCorrect: wrongOnly ? false : { not: null } },
            ] },
            ...(subject ? [practiceSubjectWhere(subject.id, subject.name)] : []),
        ],
    };
}

const listSelect = {
    id: true, source: true, result: true, isCorrect: true, createdAt: true,
    durationSec: true, confidence: true, subject: true, questionText: true,
    answerImageUrl: true, wrongAnswerText: true, errorItemId: true,
    errorItem: { select: { questionText: true, subject: { select: { name: true } } } },
    examQuestion: { select: { paperId: true, order: true, paper: { select: { title: true } } } },
} satisfies Prisma.PracticeRecordSelect;

type ListRecord = Prisma.PracticeRecordGetPayload<{ select: typeof listSelect }>;

function originalQuestion(source: string): boolean {
    return source === 'review' || source === 'manual';
}

function examInfo(record: Pick<ListRecord, 'examQuestion'>) {
    const exam = record.examQuestion;
    return exam ? { paperId: exam.paperId, title: exam.paper.title, order: exam.order } : null;
}

function groupHistory(records: ListRecord[], timeZone: string): PracticeHistoryDay[] {
    const grouped = new Map<string, ListRecord[]>();
    for (const record of records) {
        const date = practiceDayKey(record.createdAt, timeZone);
        const day = grouped.get(date) ?? [];
        day.push(record);
        grouped.set(date, day);
    }
    return [...grouped].sort(([a], [b]) => b.localeCompare(a)).map(([date, day]) => ({
        date,
        summary: summarizePracticeDay(day),
        records: day.map(record => ({
            id: record.id, source: record.source, result: resolvePracticeResult(record),
            createdAt: record.createdAt.toISOString(), durationSec: record.durationSec,
            confidence: record.confidence, subjectName: record.errorItem?.subject?.name || record.subject,
            preview: practicePreview(originalQuestion(record.source) ? record.errorItem?.questionText ?? null : record.questionText),
            hasAnswerImage: Boolean(record.answerImageUrl), hasAnswerText: Boolean(record.wrongAnswerText?.trim()),
            errorItemId: record.errorItemId, exam: examInfo(record),
        })),
    }));
}

type HistoryOptions = { before?: string; days: number; date?: string; result?: 'wrong'; subject: { id: string; name: string } | null };

export async function getPracticeHistory(userId: string, options: HistoryOptions): Promise<PracticeHistoryPage> {
    const timeZone = getAppTimeZone();
    const where = historyWhere(userId, options.subject, options.result === 'wrong');
    const end = options.date ? practiceDateRange(options.date, timeZone).end
        : options.before ? practiceDateRange(options.before, timeZone).start : getDayRange(new Date(), timeZone).end;
    let start = options.date ? practiceDateRange(options.date, timeZone).start : shiftCalendarDate(end, timeZone, -options.days);
    const readWindow = (from: Date, to: Date) => prisma.practiceRecord.findMany({
        where: { ...where, createdAt: { gte: from, lt: to } }, select: listSelect,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const readEarlier = (before: Date) => prisma.practiceRecord.findFirst({
        where: { ...where, createdAt: { lt: before } }, select: { createdAt: true }, orderBy: { createdAt: 'desc' },
    });
    let [records, earlier] = await Promise.all([readWindow(start, end), readEarlier(start)]);
    // 空窗口直接跳到最近记录所在的窗口，不逐段扫描无人作答的日期。
    if (!options.date && records.length === 0 && earlier) {
        const jumpedEnd = getDayRange(earlier.createdAt, timeZone).end;
        start = shiftCalendarDate(jumpedEnd, timeZone, -options.days);
        [records, earlier] = await Promise.all([readWindow(start, jumpedEnd), readEarlier(start)]);
    }
    return { days: groupHistory(records, timeZone), nextBefore: earlier ? practiceDayKey(start, timeZone) : null, hasMore: Boolean(earlier) };
}

export async function getPracticeCalendar(userId: string, from: string, to: string, subject: { id: string; name: string } | null): Promise<PracticeCalendarResponse> {
    const timeZone = getAppTimeZone();
    const start = practiceDateRange(from, timeZone).start;
    const end = practiceDateRange(to, timeZone).end;
    const records = await prisma.practiceRecord.findMany({
        where: { ...historyWhere(userId, subject), createdAt: { gte: start, lt: end } },
        select: { createdAt: true, result: true, isCorrect: true },
    });
    const counts = new Map<string, { total: number; correct: number }>();
    for (const record of records) {
        const date = practiceDayKey(record.createdAt, timeZone);
        const count = counts.get(date) ?? { total: 0, correct: 0 };
        const result = resolvePracticeResult(record);
        if (result === 'correct' || result === 'wrong') count.total++;
        if (result === 'correct') count.correct++;
        counts.set(date, count);
    }
    const days = [];
    for (let day = start; day < end; day = shiftCalendarDate(day, timeZone, 1)) {
        const date = practiceDayKey(day, timeZone);
        days.push({ date, ...(counts.get(date) ?? { total: 0, correct: 0 }) });
    }
    return { days };
}

export async function getPracticeRecord(userId: string, id: string): Promise<PracticeRecordDetail | null> {
    const record = await prisma.practiceRecord.findFirst({
        where: { id, ...historyWhere(userId, null) },
        select: {
            ...listSelect, figureSvg: true, originalImageUrl: true, answerText: true, analysis: true,
            recognizedAnswer: true, gradeReason: true, notes: true,
            errorItem: { select: {
                id: true, questionText: true, subject: { select: { name: true } }, figureSvg: true,
                originalImageUrl: true, updatedAt: true, answerText: true, analysis: true,
                hasFigure: true, figureScale: true, figureAlign: true,
            } },
        },
    });
    if (!record) return null;
    const original = originalQuestion(record.source);
    const item = original ? record.errorItem : null;
    const recordImage = (value: string | null, answer = false): string | null => {
        if (!value || !isLocalImage(value)) return value;
        if (!record.errorItemId) return null;
        return `/api/error-items/${encodeURIComponent(record.errorItemId)}/image?record=${encodeURIComponent(record.id)}${answer ? '&field=answer' : ''}`;
    };
    return {
        id: record.id, source: record.source, result: resolvePracticeResult(record), createdAt: record.createdAt.toISOString(),
        durationSec: record.durationSec, confidence: record.confidence,
        subjectName: record.errorItem?.subject?.name || record.subject,
        questionText: original ? item?.questionText ?? null : record.questionText,
        figureSvg: original ? item?.figureSvg ?? null : record.figureSvg,
        originalImageUrl: item ? withPublicImage(item).originalImageUrl : recordImage(record.originalImageUrl),
        hasFigure: item?.hasFigure ?? Boolean(record.figureSvg || record.originalImageUrl),
        figureScale: item?.figureScale ?? 100, figureAlign: item?.figureAlign ?? 'center',
        answerText: original ? item?.answerText ?? record.answerText : record.answerText,
        analysis: original ? item?.analysis ?? record.analysis : record.analysis,
        userAnswer: record.wrongAnswerText, answerImageUrl: recordImage(record.answerImageUrl, true),
        recognizedAnswer: record.recognizedAnswer, gradeReason: record.gradeReason, notes: record.notes,
        errorItemId: record.errorItemId, exam: examInfo(record),
    };
}

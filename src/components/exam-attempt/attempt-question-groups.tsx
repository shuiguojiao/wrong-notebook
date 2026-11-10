"use client";

import { AttemptQuestionCard } from "@/components/exam-attempt/attempt-question-card";
import { useLanguage } from "@/contexts/LanguageContext";
import { attemptQuestions } from "@/lib/exam/exam-attempt-view";
import type { AttemptGroup } from "@/lib/exam/exam-attempt-view";
import type { ExamAttemptDetail, PracticeResult } from "@/types/api";

interface AttemptQuestionGroupsProps {
    attempt: ExamAttemptDetail;
    groups: AttemptGroup[];
    editable: boolean;
    busy: boolean;
    pending: string[];
    onChange: (questionId: string, result: PracticeResult) => void;
}

export function AttemptQuestionGroups({ attempt, groups, editable, busy, pending, onChange }: AttemptQuestionGroupsProps) {
    const { t } = useLanguage();
    const labels = {
        all: '', attention: t.examAttempt.attention, wrong: t.student.closeTry,
        not_attempted: t.examAttempt.notAttempted, correct: t.examAttempt.correctGroup,
    };
    const numbers = new Map(attemptQuestions(attempt).map((item, index) => [item.question.id, item.question.displayNumber ?? index + 1]));
    const answers = new Map(attempt.answers.map(answer => [answer.examQuestionId, answer]));
    return (
        <div className="space-y-6">
            {groups.map(group => {
                const title = t.examAttempt.groupCount.replace('{group}', labels[group.key]).replace('{count}', String(group.items.length));
                const cards = (
                    <div className="space-y-3">
                        {group.items.map(item => (
                            <AttemptQuestionCard
                                key={item.question.id}
                                {...item}
                                answer={answers.get(item.question.id)}
                                paperId={attempt.paper.id}
                                attemptId={attempt.id}
                                number={numbers.get(item.question.id)!}
                                editable={editable}
                                saved={attempt.status === 'done' && !editable}
                                pending={busy || pending.includes(item.question.id)}
                                onChange={onChange}
                            />
                        ))}
                    </div>
                );
                return group.key === 'correct' ? (
                    <details key={group.key} className="space-y-3">
                        <summary className="min-h-11 cursor-pointer py-3 text-lg font-semibold">{title}</summary>
                        {cards}
                    </details>
                ) : (
                    <section key={group.key} className="space-y-3">
                        {group.key !== 'all' && <h2 className="text-lg font-semibold">{title}</h2>}
                        {cards}
                    </section>
                );
            })}
        </div>
    );
}

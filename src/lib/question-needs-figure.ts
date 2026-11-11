interface QuestionFigureContext {
    questionText?: string | null;
    ocrText?: string | null;
    requiresImage?: boolean;
    figureSvg?: string | null;
    figurePreviewUrl?: string | null;
}

const FIGURE_HINT = /如图|下图|上图|图中|图示|见图|表中|下表|上表|表格|统计表/;

/** 需要图表且没有现成配图时，允许学生主动查看出处图。 */
export function questionNeedsFigure(question: QuestionFigureContext): boolean {
    if (question.figureSvg?.trim() || question.figurePreviewUrl?.trim()) return false;
    return question.requiresImage === true || FIGURE_HINT.test(question.questionText || question.ocrText || '');
}

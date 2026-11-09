/** 图文核对的公共输入输出，不依赖服务端运行时。 */
export interface IntegrityImage {
    base64: string;
    mimeType: string;
}

export interface QuestionIntegrityInput {
    image: IntegrityImage;
    sourcePages?: Array<{ image: IntegrityImage; regions: Array<{ x: number; y: number; width: number; height: number }> }>;
    questionText: string;
    answerText?: string | null;
    wrongAnswerText?: string | null;
    language?: 'zh' | 'en';
}

export interface QuestionIntegrityResult {
    imageText: string;
    sameQuestion: 'yes' | 'no' | 'unsure';
    crop: 'complete' | 'cut_off' | 'unsure';
    textDiffs: Array<{ imageSays: string; textSays: string; severity: 'major' | 'minor' }>;
    studentAnswer: 'match' | 'mismatch' | 'not_visible' | 'not_given';
    studentAnswerDiff: string;
    confidence: number;
    summary: string;
}

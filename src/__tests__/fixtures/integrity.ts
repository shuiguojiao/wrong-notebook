/** 按 QUESTION_INTEGRITY 第 14 节公开记录的验证案例重建；并非未入库的原始模型输出。 */
export const integrityMatch = {
    image_text: '原图文字', same_question: 'yes', crop: 'complete', text_diffs: [],
    student_answer: 'not_given', student_answer_diff: '', confidence: 0.98, summary: '图文一致',
};
export const integrityCases = [
    { name: '换图', output: { ...integrityMatch, same_question: 'no', confidence: 0.99, summary: '图题不同' }, code: 'image_mismatch', visibility: 'user' },
    ...[['kěn', 'kě'], ['郊居', '邻居'], ['0<t', '0≤t']].map(([image_says, text_says]) => ({
        name: `${image_says}→${text_says}`, output: { ...integrityMatch, text_diffs: [{ image_says, text_says, severity: 'major' }] }, code: 'text_diff', visibility: 'user',
    })),
    { name: '大小写', output: { ...integrityMatch, text_diffs: [{ image_says: 'She', text_says: 'she', severity: 'minor' }] }, code: 'text_diff_minor', visibility: 'agent' },
    { name: '裁切', output: { ...integrityMatch, crop: 'cut_off' }, code: 'crop_cut_off', visibility: 'agent' },
];

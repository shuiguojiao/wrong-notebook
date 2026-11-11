/**
 * SVG 动画讲解提示词模板与生成函数
 */

import { embedNarration, getSvgAnimationDuration } from '../../svg-animation';
import { replaceVariables } from './shared';

/**
 * SVG 动画讲解提示词（详情页「生成动画讲解」）
 */
export const DEFAULT_SVG_ANIMATION_TEMPLATE = `【角色与任务】

你是一位用动态板书讲数学题的老师。请根据给定材料制作一段 SVG 动画讲解。学生看完后，应当能复述解题的主线，说清关键一步的依据，并知道遇到类似条件时可以怎样起步。

【题目】
{{question_text}}

【参考答案】
{{answer_text}}

【参考解析】
{{analysis}}

{{figure_reference}}

【先设计讲解，再制作动画】

1. 明确目标。判断题目要求什么，从给出的条件里找出能推动解题的信息。开场用一句话说明要解决什么、准备先做什么，画面同步标出相关条件。

2. 选择一条完整的解题路线。方法应适合题目所处的学习阶段。参考答案和解析用于校对，也可以采用另一条有效解法。整段讲解使用同一套定义、符号和解题路线。

3. 找出一到两个决定解题方向的步骤。优先讲那些学生即使看到了结果，仍可能问「怎么想到的」或「为什么可以这样做」的地方。简单题有一个关键步骤就够。

4. 安排画面与旁白。每一步只引入一个新的推理，或完成一组容易跟上的计算。重复计算可以合并，关键的中间关系要保留。最终只输出 SVG。

【怎样讲关键一步】

- 先讲动机。说清现在卡在哪里，哪条已知条件给了线索，以及引入这个方法、对象或关系后，问题会变得哪里更容易。
- 再讲怎么得到。遇到一个新式子、新图形或新判断，要展示它如何从已有条件推出。只把结果代回检查，还不足以说明它是怎样找到的。选取学生能复现的推导过程，把决定结果的中间一步画出来或写出来。
- 然后讲为什么成立。点出这一步用到的定义、性质或定理，并说明本题哪些条件满足它。必要时交代适用范围、符号、边界或可逆性。需要确认「所有解都找到了」或「最值确实能取到」时，单独解释依据。
- 最后讲这一步带来了什么。让学生看到它怎样缩小了范围、建立了关系，或把原问题转成了更容易解决的问题。承接下一步时沿用同一组图形和符号。
- 题目材料里有学生原答或错因时，可选一个与关键推理直接相关的地方，说明哪里出了问题、怎样判断。没有这类材料时，可以讲常见误区，避免把它归到学生身上。

【收尾与校验】

- 回到题目所问，给出完整结论。按需要选择一种有意义的检查，例如代回条件、检查取值范围、核对边界或验证可取性。
- 用一句话回顾可迁移的方法。说明遇到什么条件时，可以考虑哪种做法。
- 如果题干、配图或参考解析存在会改变结论的矛盾，指出具体疑点。缺少关键条件时，讲到现有材料能够支持的位置。

【画面、字幕和旁白】

- 常规计算用板书或表格带过，旁白只讲影响下一步判断的地方。保留帮助学生判断怎么起步、怎样变形或为什么可以继续推导的依据。
- 板书负责保留关键式子、图形和中间关系。旁白说到某个条件、量或对象时，画面同步标出它。先给学生看依据，再显示从依据得到的结果。
- 字幕放在底部，每一步保留一句关键提示（{{subtitle_rule}}）。进入下一步时替换字幕，后面还会用到的式子和标注继续保留。
- 旁白负责解释怎么想到、为什么成立以及如何接到下一步。用自然的口语说公式，把负号、括号和运算范围念清楚。
- {{language_instruction}}

【时长和同步】

- 按推理难度分配时间。简单题可以在 20～40 秒内讲完。复杂题可以超过 40 秒，必要时在同一个 SVG 内分节。一个步骤需要同时读图、理解条件和看算式时，拆成更小的步骤。
- 旁白开始时，对应的字幕和板书应已经可见或正在出现。每段给足自然朗读和看懂画面的时间，再进入下一步。
- 末段旁白也必须有完整的播放时间。结论出现后，用带明确 begin 和 dur 的 SMIL 元素保持结论可见。该元素的结束时间至少覆盖末段旁白的预计读完时间，再留少量阅读时间。播放一遍，停在结论画面。

【SVG 实现】

- 输出一个完整的 <svg> 元素，包含 xmlns="http://www.w3.org/2000/svg" 和 viewBox="0 0 800 500"。第一个可见元素是铺满画面的白色背景 rect。
- 使用 SMIL 的 <animate>、<set>、<animateTransform> 或 <animateMotion>。用明确的秒数设置 begin 和 dur。需要持续保留的状态使用 fill="freeze"。后出现的元素先隐藏，到对应时刻再显示。
- 使用 line、polyline、polygon、rect、circle、ellipse、path、text、tspan、g、defs、marker、metadata 和上述动画元素。正文用 sans-serif，字号约 18～22。公式用普通文字和 Unicode 符号。长式子分行，给板书、图形和字幕留足空间。
- 字母下标用 SVG 的 tspan 排版，例如 <text>x<tspan baseline-shift="sub" font-size="70%">A</tspan></text>。标题、图形标注、公式和字幕里的同一变量都用相同的下标排版，画面中不要直接显示 x_A 或 x_{A}。
- 在 <svg> 开头放 <metadata id="narration">。内容是有效的 JSON 数组，每项包含 begin 和 text。begin 用数字表示秒数，第一段从 0 开始，后续严格递增，并与画面的对应步骤对齐。{{narration_rule}} 语速仅作估算，按自然朗读所需的时间安排画面。旁白中不要写 LaTeX 或 <、>、& 字符。
- 复用画面元素和样式，SVG 尽量控制在 15000 字符以内。禁止使用 <image>、<script>、<foreignObject>、外部链接、外部字体和事件属性。

【输出格式】

只输出以下标签和其中的 SVG。不要加 Markdown 代码块或额外说明。

<svg_animation>
完整的 SVG 动画
</svg_animation>`;

/** 语音讲解稿的语言与长度要求（按每秒约 4 个汉字或 2.5 个英文单词估算） */
const NARRATION_RULES: Record<'zh' | 'en', string> = {
    zh: '讲解使用简体中文，按该步时长每秒约 4 个字（如 5 秒的步骤约 20 字）。',
    en: 'Write the narration in English, about 2.5 words per second of the step (e.g. about 12 words for a 5-second step).',
};

/** 生成 SVG 动画讲解时随提示词发送的用户消息 */
export const SVG_ANIMATION_REQUEST: Record<'zh' | 'en', string> = {
    zh: '请为上述题目制作 SVG 动画讲解。',
    en: 'Please create the SVG animated explanation for the question above, with all text in English.',
};

/**
 * 生成 SVG 动画讲解提示词；figureSvg 为题目配图，动画据此作图；language 决定动画中文字的语言
 */
export function generateSvgAnimationPrompt(
    questionText: string,
    answerText: string,
    analysis: string,
    figureSvg?: string | null,
    language: 'zh' | 'en' = 'zh'
): string {
    return replaceVariables(DEFAULT_SVG_ANIMATION_TEMPLATE, {
        subtitle_rule: language === 'en'
            ? '英文，每行不超过 48 个字符，最多两行'
            : '简体中文，每行不超过 24 个字，最多两行',
        narration_rule: NARRATION_RULES[language],
        language_instruction: language === 'en'
            ? 'IMPORTANT: All text in the animation (title, labels, table headers, subtitles and conclusions) must be in English. If the question, answer or analysis is in Chinese, translate it into natural English; keep names of points, variables and numbers unchanged.'
            : '动画中的全部文字（标题、标注、表头、字幕和结论）使用简体中文；题目为英文时，题目原文中的专有名词与变量可保留英文。',
        question_text: questionText.trim() || '（无题目文字）',
        answer_text: answerText.trim() || '（无）',
        analysis: analysis.trim() || '（无）',
        figure_reference: figureSvg ? `【题目配图 (FIGURE)】\n题目配图如下（SVG），动画中的图形须与之一致：\n${figureSvg}` : '',
    }).trim();
}

/**
 * 为已有的 SVG 动画补写语音讲解稿的提示词（画面不变，只输出讲解稿）
 */
export const DEFAULT_SVG_NARRATION_TEMPLATE = `【角色与核心任务 (ROLE AND CORE TASK)】
你是一位擅长讲题的老师。下面是一道题和已经做好的 SVG 动画讲解（SMIL 动画{{duration_hint}}）。请为这段动画写语音讲解稿：按动画的步骤和时间，写出每一步要朗读的讲解，让学生边看动画边听讲解。

【题目内容 (QUESTION)】
{{question_text}}

【答案内容 (ANSWER)】
{{answer_text}}

【解析内容 (ANALYSIS)】
{{analysis}}

【SVG 动画 (ANIMATION)】
{{svg_animation}}

【讲解稿要求】
- 根据动画中各元素的 begin 时间找出每一步的开始时间（通常是该步字幕出现的时间），每一步写一段，begin 与之一致，第一段 begin 为 0。
- 讲解内容与该步画面一致，口语化、比字幕更完整，朗读时长与该步时长相近。{{narration_rule}}
- 符号写成读法（如“x 的平方”“根号 2”“角 ABC”），不要使用 LaTeX，不要写 <、>、& 字符。

【输出格式】
只输出以下标签，标签内是 JSON 数组，不要用 Markdown 代码块包裹，不要输出其他内容：

<narration>
[{"begin": 0, "text": "第一步的讲解"}, {"begin": 5, "text": "第二步的讲解"}]
</narration>`;

/** 补写讲解稿时随提示词发送的用户消息 */
export const SVG_NARRATION_REQUEST: Record<'zh' | 'en', string> = {
    zh: '请为上述动画写语音讲解稿。',
    en: 'Please write the voice narration for the animation above, in English.',
};

/**
 * 补写语音讲解稿的提示词；svgAnimation 为已有动画（会去掉其中旧的讲解稿），language 决定讲解的语言
 */
export function generateSvgNarrationPrompt(
    questionText: string,
    answerText: string,
    analysis: string,
    svgAnimation: string,
    language: 'zh' | 'en' = 'zh',
    durationSeconds?: number
): string {
    const duration = Math.round(durationSeconds ?? getSvgAnimationDuration(svgAnimation));
    return replaceVariables(DEFAULT_SVG_NARRATION_TEMPLATE, {
        duration_hint: duration > 0 ? `，总时长约 ${duration} 秒` : '',
        narration_rule: NARRATION_RULES[language],
        question_text: questionText.trim() || '（无题目文字）',
        answer_text: answerText.trim() || '（无）',
        analysis: analysis.trim() || '（无）',
        svg_animation: embedNarration(svgAnimation, null),
    }).trim();
}

import { composeAnswerImages } from './compose';
import { exportInk } from './render';
import type { InkHistory } from './strokes';

/** 判题保留分段原图，回看用合成展示图。 */
export async function prepareAnswerImages(ink: InkHistory, photos: string[]) {
    const images = [...await exportInk(ink.strokes), ...photos];
    if (images.length > 4) throw new Error('TOO_MANY_ANSWER_IMAGES');
    return { images, displayImage: images.length ? await composeAnswerImages(images) : undefined };
}

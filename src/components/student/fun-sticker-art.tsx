import { funStickerArtSrc } from '@/lib/rewards/fun-stickers';

interface FunStickerArtProps {
    id: string;
    size: number;
    className?: string;
    loading?: 'lazy' | 'eager';
}

export function FunStickerArt({ id, size, className, loading = 'lazy' }: FunStickerArtProps) {
    // 本地静态 SVG 已按画布导出，保留原始资源以支持所有安装包。
    return <img src={funStickerArtSrc(id)} alt="" aria-hidden="true" width={size} height={size}
        className={className} draggable={false} loading={loading} />;
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { FileQuestion } from "lucide-react";
import { DetailContent } from "@/components/error-detail/detail-content";
import { EmptyState } from "@/components/ui/empty-state";
import { PageLoading } from "@/components/ui/page-loading";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiClient } from "@/lib/api-client";
import { toast } from "@/lib/feedback";
import { frontendLogger } from "@/lib/frontend-logger";
import { usePageTitle } from "@/lib/page-title";
import type { ErrorItemDetail } from "@/components/error-detail/types";
import type { UserProfile } from "@/types/api";

export default function ErrorDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { t } = useLanguage();
    const [item, setItem] = useState<ErrorItemDetail | null>(null);
    usePageTitle(t.detail.title, item?.subject?.name, item?.shortId);
    const [loading, setLoading] = useState(true);
    const [educationStage, setEducationStage] = useState<string | undefined>(undefined);
    // GeoGebra 动态演示默认关闭，用户在设置中开启后才显示
    const [geogebraEnabled, setGeogebraEnabled] = useState(false);
    // SVG 动画讲解默认开启，用户可在设置中关闭
    const [svgAnimationEnabled, setSvgAnimationEnabled] = useState(true);
    const [savingDifficulty, setSavingDifficulty] = useState(false);

    const fetchItem = useCallback(async (id: string) => {
        try {
            const data = await apiClient.get<ErrorItemDetail>(`/api/error-items/${id}`);
            setItem(data);
        } catch (error) {
            frontendLogger.error('[ErrorDetail]', 'Failed to fetch error item', { error });
            toast.error(t.common?.messages?.loadFailed || 'Failed to load item');
            router.push("/notebooks");
        } finally {
            setLoading(false);
        }
    }, [router, t]);

    useEffect(() => {
        apiClient.get<UserProfile>("/api/user")
            .then(user => {
                if (user && user.educationStage) {
                    setEducationStage(user.educationStage);
                }
                setGeogebraEnabled(!!user?.enableGeogebra);
                setSvgAnimationEnabled(user?.enableSvgAnimation !== false);
            })
            .catch(err => frontendLogger.error('[ErrorDetail]', 'Failed to fetch user info', { error: err }));

        if (params.id) {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- 数据请求：进入页面或条件变化时加载，请求前后更新加载状态和结果
            fetchItem(params.id as string);
        }
    }, [params.id, fetchItem]);

    const updateItem = useCallback((fields: Partial<ErrorItemDetail>) => {
        setItem((current) => current && { ...current, ...fields });
    }, []);

    // 保存字段并合并到页面状态，失败时抛出，由各卡片提示
    const saveFields = async (fields: Partial<ErrorItemDetail>) => {
        if (!item) return;
        const updated = await apiClient.put<Partial<ErrorItemDetail>>(`/api/error-items/${item.id}`, fields);
        updateItem({ ...fields, ...updated });
    };

    const reload = async () => {
        if (item) await fetchItem(item.id);
    };

    const handleDifficultyChange = async (difficultyStars: number | null) => {
        if (!item) return;
        const previous = item.difficultyStars ?? null;
        updateItem({ difficultyStars });
        setSavingDifficulty(true);
        try {
            const updated = await apiClient.put<Pick<ErrorItemDetail, "paperLevel">>(`/api/error-items/${item.id}`, { difficultyStars });
            updateItem({ paperLevel: updated.paperLevel });
        } catch (error) {
            updateItem({ difficultyStars: previous });
            frontendLogger.error('[ErrorDetail]', 'Failed to save difficulty', { error });
            toast.error(t.difficulty.saveFailed);
        } finally {
            setSavingDifficulty(false);
        }
    };

    if (loading) return <PageLoading label={t.common.loading} />;
    if (!item) return <EmptyState icon={FileQuestion} title={t.detail.notFound} className="m-4 md:m-8" />;

    return <DetailContent key={item.id} item={item} educationStage={educationStage} saveFields={saveFields} onUpdate={updateItem} reload={reload}
        onDeleted={() => router.push(item.subjectId ? `/notebooks/${item.subjectId}` : '/notebooks')}
        onDifficultyChange={handleDifficultyChange} savingDifficulty={savingDifficulty} svgEnabled={svgAnimationEnabled} geogebraEnabled={geogebraEnabled} />;
}

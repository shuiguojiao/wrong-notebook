-- 仅新增带默认值或可空列，保留已有题目、作答与外键关系。
ALTER TABLE "ErrorItem" ADD COLUMN "reviewStage" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ErrorItem" ADD COLUMN "reviewWrongStreak" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ErrorItem" ADD COLUMN "nextReviewAt" DATETIME;
ALTER TABLE "ErrorItem" ADD COLUMN "reviewCompletedAt" DATETIME;
ALTER TABLE "ErrorItem" ADD COLUMN "reviewSyncedAt" DATETIME;
ALTER TABLE "ErrorItem" ADD COLUMN "reviewOverride" TEXT;
ALTER TABLE "ErrorItem" ADD COLUMN "reviewOverrideAt" DATETIME;
ALTER TABLE "PracticeRecord" ADD COLUMN "confidence" TEXT;
CREATE INDEX "ErrorItem_userId_nextReviewAt_idx" ON "ErrorItem"("userId", "nextReviewAt");

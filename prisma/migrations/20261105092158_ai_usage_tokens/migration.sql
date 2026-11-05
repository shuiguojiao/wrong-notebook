-- AlterTable
ALTER TABLE "AiUsage" ADD COLUMN "inputTokens" INTEGER;
ALTER TABLE "AiUsage" ADD COLUMN "model" TEXT;
ALTER TABLE "AiUsage" ADD COLUMN "outputTokens" INTEGER;
ALTER TABLE "AiUsage" ADD COLUMN "provider" TEXT;
ALTER TABLE "AiUsage" ADD COLUMN "tokenBreakdown" TEXT;

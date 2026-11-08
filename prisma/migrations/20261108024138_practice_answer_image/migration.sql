-- 为现有练习记录追加可空字段，不改动已有数据
ALTER TABLE "PracticeRecord" ADD COLUMN "answerImageUrl" TEXT;
ALTER TABLE "PracticeRecord" ADD COLUMN "recognizedAnswer" TEXT;

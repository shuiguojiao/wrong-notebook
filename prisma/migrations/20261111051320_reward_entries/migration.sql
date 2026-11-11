-- 新增奖励账本
CREATE TABLE "RewardEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "refKey" TEXT NOT NULL,
    "meta" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RewardEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 为存量用户追加带默认值的列，保留原表及其关联数据。
ALTER TABLE "User" ADD COLUMN "weeklyGoalDays" INTEGER NOT NULL DEFAULT 4;
ALTER TABLE "User" ADD COLUMN "rewardsEnabled" BOOLEAN NOT NULL DEFAULT true;

-- 新增账本索引
CREATE INDEX "RewardEntry_userId_day_idx" ON "RewardEntry"("userId", "day");

-- 新增账本索引
CREATE UNIQUE INDEX "RewardEntry_userId_type_refKey_key" ON "RewardEntry"("userId", "type", "refKey");

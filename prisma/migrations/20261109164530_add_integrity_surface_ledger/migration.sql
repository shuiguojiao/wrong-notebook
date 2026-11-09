-- 新增用户级存量展示账本，兼容已有用户与题目
ALTER TABLE "User" ADD COLUMN "integritySurfaceLedger" TEXT;

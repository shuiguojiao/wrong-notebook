-- 创建问题反馈表
CREATE TABLE "ProblemReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "errorItemId" TEXT,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "snapshot" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "adminNote" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProblemReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProblemReport_errorItemId_fkey" FOREIGN KEY ("errorItemId") REFERENCES "ErrorItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- 创建索引
CREATE INDEX "ProblemReport_userId_createdAt_idx" ON "ProblemReport"("userId", "createdAt");

-- 创建索引
CREATE INDEX "ProblemReport_errorItemId_idx" ON "ProblemReport"("errorItemId");

-- 创建索引
CREATE INDEX "ProblemReport_status_category_createdAt_idx" ON "ProblemReport"("status", "category", "createdAt");

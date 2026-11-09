-- 新增题目检查字段，已有数据保持为空
ALTER TABLE "ErrorItem" ADD COLUMN "checkIssues" TEXT;
ALTER TABLE "ErrorItem" ADD COLUMN "checkStatus" TEXT;
ALTER TABLE "ErrorItem" ADD COLUMN "checkVersion" INTEGER;
ALTER TABLE "ErrorItem" ADD COLUMN "checkedAt" DATETIME;

-- 新增数据表
CREATE TABLE "SourcePage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "origin" TEXT NOT NULL,
    "fileName" TEXT,
    "pageNumber" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SourcePage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 新增数据表
CREATE TABLE "QuestionRegion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "errorItemId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "x" REAL NOT NULL,
    "y" REAL NOT NULL,
    "width" REAL NOT NULL,
    "height" REAL NOT NULL,
    CONSTRAINT "QuestionRegion_errorItemId_fkey" FOREIGN KEY ("errorItemId") REFERENCES "ErrorItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuestionRegion_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "SourcePage" ("id") ON DELETE NO ACTION ON UPDATE CASCADE
);

-- 新增索引
CREATE UNIQUE INDEX "SourcePage_userId_sha256_key" ON "SourcePage"("userId", "sha256");

-- 新增索引
CREATE INDEX "QuestionRegion_errorItemId_idx" ON "QuestionRegion"("errorItemId");

-- 新增索引
CREATE INDEX "QuestionRegion_pageId_idx" ON "QuestionRegion"("pageId");

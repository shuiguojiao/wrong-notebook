-- 新增表
CREATE TABLE "ExamAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "paperId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'answering',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" DATETIME,
    "confirmedAt" DATETIME,
    "durationSec" INTEGER,
    "pageImages" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExamAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExamAttempt_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "ExamPaper" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 新增表
CREATE TABLE "ExamAttemptAnswer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "attemptId" TEXT NOT NULL,
    "examQuestionId" TEXT NOT NULL,
    "answerText" TEXT,
    "answerImageUrl" TEXT,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "pageIndex" INTEGER,
    "region" TEXT,
    "recognizedAnswer" TEXT,
    "handMark" TEXT,
    "aiResult" TEXT,
    "aiReason" TEXT,
    "finalResult" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExamAttemptAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "ExamAttempt" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExamAttemptAnswer_examQuestionId_fkey" FOREIGN KEY ("examQuestionId") REFERENCES "ExamQuestion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 仅追加可空列，保留已有表、数据和索引。
ALTER TABLE "PracticeRecord" ADD COLUMN "examAttemptId" TEXT REFERENCES "ExamAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "PracticeRecord_examAttemptId_idx" ON "PracticeRecord"("examAttemptId");

-- 新增索引
CREATE INDEX "ExamAttempt_paperId_createdAt_idx" ON "ExamAttempt"("paperId", "createdAt");

-- 新增索引
CREATE INDEX "ExamAttempt_userId_status_idx" ON "ExamAttempt"("userId", "status");

-- 新增索引
CREATE UNIQUE INDEX "ExamAttemptAnswer_attemptId_examQuestionId_key" ON "ExamAttemptAnswer"("attemptId", "examQuestionId");

-- 为现有账号保留默认开启的复习偏好。
ALTER TABLE "User" ADD COLUMN "reviewVariantsEnabled" BOOLEAN NOT NULL DEFAULT true;

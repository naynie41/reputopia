-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "counterpartReady" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sellerReady" BOOLEAN NOT NULL DEFAULT false;

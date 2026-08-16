-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "answerFormat" TEXT,
ADD COLUMN     "cardsUsed" JSONB,
ADD COLUMN     "disclaimer" TEXT,
ADD COLUMN     "isLowConfidence" BOOLEAN,
ADD COLUMN     "isOutOfScope" BOOLEAN,
ADD COLUMN     "overallConfidence" DOUBLE PRECISION,
ADD COLUMN     "overallReviewStatus" TEXT,
ADD COLUMN     "quickReplies" JSONB,
ADD COLUMN     "suggestedFollowUps" JSONB,
ADD COLUMN     "v1NodesUsed" JSONB;

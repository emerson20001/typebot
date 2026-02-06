-- CreateEnum
CREATE TYPE "CustomCurlTemplateType" AS ENUM ('Text', 'Media', 'ListPicker', 'CallToAction', 'QuickReply', 'Card', 'Catalog', 'Carousel', 'WhatsAppCard', 'Authentication', 'Flows');

-- CreateTable
CREATE TABLE "CustomCurlTemplate" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "curlCommand" TEXT NOT NULL,
    "type" "CustomCurlTemplateType" NOT NULL DEFAULT 'Text',
    "quickReplyButtons" JSONB,
    "templateBodyPreview" TEXT,
    "templateImageUrl" TEXT,
    "isExecutedOnClient" BOOLEAN,
    "timeout" INTEGER,
    "userId" TEXT NOT NULL,

    CONSTRAINT "CustomCurlTemplate_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CustomCurlTemplate" ADD CONSTRAINT "CustomCurlTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

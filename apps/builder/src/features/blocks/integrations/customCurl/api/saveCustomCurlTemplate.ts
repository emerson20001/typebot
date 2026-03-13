import prisma from "@typebot.io/prisma";
import { z } from "@typebot.io/zod";
import { authenticatedProcedure } from "@/helpers/server/trpc";

const customCurlTemplateTypeLabels = [
  "Text",
  "Media",
  "List Picker",
  "Call to action",
  "Quick Reply",
  "Card",
  "Catalog",
  "Carousel",
  "WhatsApp Card",
  "Authentication",
  "Flows",
] as const;

const quickReplyButtonSchema = z.object({
  id: z.string().optional(),
  text: z.string().optional(),
});

const customCurlTemplateTypeSchema = z.enum(customCurlTemplateTypeLabels);
type CustomCurlTemplateDbType =
  | "Text"
  | "Media"
  | "ListPicker"
  | "CallToAction"
  | "QuickReply"
  | "Card"
  | "Catalog"
  | "Carousel"
  | "WhatsAppCard"
  | "Authentication"
  | "Flows";

export const saveCustomCurlTemplate = authenticatedProcedure
  .meta({
    openapi: {
      method: "POST",
      path: "/v1/customCurlTemplates",
      protect: true,
      summary: "Save custom CURL template",
      tags: ["Custom CURL template"],
    },
  })
  .input(
    z.object({
      templateId: z.string().optional(),
      name: z.string(),
      curlCommand: z.string(),
      type: customCurlTemplateTypeSchema,
      quickReplyButtons: z.array(quickReplyButtonSchema).optional(),
      templateBodyPreview: z.string().optional(),
      templateImageUrl: z.string().optional(),
      isExecutedOnClient: z.boolean().optional(),
      timeout: z.number().int().optional(),
    }),
  )
  .output(
    z.object({
      customCurlTemplate: z.object({
        id: z.string(),
        name: z.string(),
        curlCommand: z.string(),
        type: customCurlTemplateTypeSchema,
        quickReplyButtons: z.array(quickReplyButtonSchema).optional(),
        templateBodyPreview: z.string().optional(),
        templateImageUrl: z.string().optional(),
        isExecutedOnClient: z.boolean().optional(),
        timeout: z.number().int().optional(),
      }),
    }),
  )
  .mutation(async ({ input, ctx: { user } }) => {
    const templateType = mapTemplateTypeToDbValue(input.type);
    if (input.templateId) {
      const customCurlTemplate = await prisma.customCurlTemplate.update({
        where: {
          id: input.templateId,
          userId: user.id,
        },
        data: {
          name: input.name,
          curlCommand: input.curlCommand,
          type: templateType,
          quickReplyButtons: input.quickReplyButtons,
          templateBodyPreview: input.templateBodyPreview,
          templateImageUrl: input.templateImageUrl,
          isExecutedOnClient: input.isExecutedOnClient,
          timeout: input.timeout,
        },
        select: {
          id: true,
          name: true,
          curlCommand: true,
          type: true,
          quickReplyButtons: true,
          templateBodyPreview: true,
          templateImageUrl: true,
          isExecutedOnClient: true,
          timeout: true,
        },
      });
      return {
        customCurlTemplate: {
          id: customCurlTemplate.id,
          name: customCurlTemplate.name,
          curlCommand: customCurlTemplate.curlCommand,
          type: mapTemplateTypeToLabel(customCurlTemplate.type),
          quickReplyButtons: input.quickReplyButtons,
          templateBodyPreview: customCurlTemplate.templateBodyPreview ?? undefined,
          templateImageUrl: customCurlTemplate.templateImageUrl ?? undefined,
          isExecutedOnClient: customCurlTemplate.isExecutedOnClient ?? undefined,
          timeout: customCurlTemplate.timeout ?? undefined,
        },
      };
    }

    const customCurlTemplate = await prisma.customCurlTemplate.create({
      data: {
        name: input.name,
        curlCommand: input.curlCommand,
        type: templateType,
        quickReplyButtons: input.quickReplyButtons,
        templateBodyPreview: input.templateBodyPreview,
        templateImageUrl: input.templateImageUrl,
        isExecutedOnClient: input.isExecutedOnClient,
        timeout: input.timeout,
        userId: user.id,
      },
      select: {
        id: true,
        name: true,
        curlCommand: true,
        type: true,
        quickReplyButtons: true,
        templateBodyPreview: true,
        templateImageUrl: true,
        isExecutedOnClient: true,
        timeout: true,
      },
    });

    return {
      customCurlTemplate: {
        id: customCurlTemplate.id,
        name: customCurlTemplate.name,
        curlCommand: customCurlTemplate.curlCommand,
        type: mapTemplateTypeToLabel(customCurlTemplate.type),
        quickReplyButtons: input.quickReplyButtons,
        templateBodyPreview: customCurlTemplate.templateBodyPreview ?? undefined,
        templateImageUrl: customCurlTemplate.templateImageUrl ?? undefined,
        isExecutedOnClient: customCurlTemplate.isExecutedOnClient ?? undefined,
        timeout: customCurlTemplate.timeout ?? undefined,
      },
    };
  });

const templateTypeDbValueByLabel: Record<
  (typeof customCurlTemplateTypeLabels)[number],
  CustomCurlTemplateDbType
> = {
  Text: "Text",
  Media: "Media",
  "List Picker": "ListPicker",
  "Call to action": "CallToAction",
  "Quick Reply": "QuickReply",
  Card: "Card",
  Catalog: "Catalog",
  Carousel: "Carousel",
  "WhatsApp Card": "WhatsAppCard",
  Authentication: "Authentication",
  Flows: "Flows",
};

const templateTypeLabelByDbValue: Record<
  string,
  (typeof customCurlTemplateTypeLabels)[number]
> = {
  Text: "Text",
  Media: "Media",
  ListPicker: "List Picker",
  CallToAction: "Call to action",
  QuickReply: "Quick Reply",
  Card: "Card",
  Catalog: "Catalog",
  Carousel: "Carousel",
  WhatsAppCard: "WhatsApp Card",
  Authentication: "Authentication",
  Flows: "Flows",
};

const mapTemplateTypeToDbValue = (
  value: (typeof customCurlTemplateTypeLabels)[number],
): CustomCurlTemplateDbType => templateTypeDbValueByLabel[value] ?? "Text";

const mapTemplateTypeToLabel = (value: string) =>
  templateTypeLabelByDbValue[value] ?? "Text";

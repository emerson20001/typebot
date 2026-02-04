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

export const listCustomCurlTemplates = authenticatedProcedure
  .meta({
    openapi: {
      method: "GET",
      path: "/v1/customCurlTemplates",
      protect: true,
      summary: "List custom CURL templates",
      tags: ["Custom CURL template"],
    },
  })
  .input(z.object({}).optional())
  .output(
    z.object({
      customCurlTemplates: z.array(
        z.object({
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
      ),
    }),
  )
  .query(async ({ ctx: { user } }) => {
    const customCurlTemplates = await prisma.customCurlTemplate.findMany({
      where: { userId: user.id },
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
      orderBy: {
        createdAt: "desc",
      },
    });

    return {
      customCurlTemplates: customCurlTemplates.map((template) => ({
        id: template.id,
        name: template.name,
        curlCommand: template.curlCommand,
        type: mapTemplateTypeToLabel(template.type),
        quickReplyButtons: parseQuickReplyButtons(template.quickReplyButtons),
        templateBodyPreview: template.templateBodyPreview ?? undefined,
        templateImageUrl: template.templateImageUrl ?? undefined,
        isExecutedOnClient: template.isExecutedOnClient ?? undefined,
        timeout: template.timeout ?? undefined,
      })),
    };
  });

const templateTypeLabelByDbValue: Record<string, (typeof customCurlTemplateTypeLabels)[number]> =
  {
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

const mapTemplateTypeToLabel = (value: string) =>
  templateTypeLabelByDbValue[value] ?? "Text";

const parseQuickReplyButtons = (value: unknown) => {
  if (!value) return undefined;
  const parsed = z.array(quickReplyButtonSchema).safeParse(value);
  if (!parsed.success) return undefined;
  return parsed.data;
};

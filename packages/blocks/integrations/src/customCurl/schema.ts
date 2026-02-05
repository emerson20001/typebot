import { blockBaseSchema } from "@typebot.io/blocks-base/schemas";
import { buttonItemSchemas } from "@typebot.io/blocks-inputs/choice/schema";
import { z } from "@typebot.io/zod";
import { IntegrationBlockType } from "../constants";
import {
  httpRequestOptionsSchemas,
  keyValueSchema,
} from "../httpRequest/schema";

const customCurlTemplateTypes = [
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

const customCurlOptionsBaseSchema = z.object({
  curlCommand: z.string().optional(),
  extractedVariables: z.array(z.string()).optional(),
  bodyParams: z.array(keyValueSchema).optional(),
  contentVariablesParams: z.array(keyValueSchema).optional(),
  templateBodyPreview: z.string().optional(),
  templateImageUrl: z.string().optional(),
  templateType: z.enum(customCurlTemplateTypes).optional(),
  quickReplyButtons: z.array(quickReplyButtonSchema).optional(),
});

export const customCurlOptionsSchemas = {
  v5: httpRequestOptionsSchemas.v5.merge(customCurlOptionsBaseSchema),
  v6: httpRequestOptionsSchemas.v6.merge(customCurlOptionsBaseSchema),
};

const customCurlBlockV5Schema = blockBaseSchema.merge(
  z.object({
    type: z.enum([IntegrationBlockType.CUSTOM_CURL]),
    options: customCurlOptionsSchemas.v5.optional(),
    items: z.array(buttonItemSchemas.v5).optional(),
  }),
);

export const customCurlBlockSchemas = {
  v5: customCurlBlockV5Schema,
  v6: customCurlBlockV5Schema.merge(
    z.object({
      options: customCurlOptionsSchemas.v6.optional(),
      items: z.array(buttonItemSchemas.v6).optional(),
    }),
  ),
};

export type CustomCurlBlock = z.infer<typeof customCurlBlockSchemas.v6>;
export type CustomCurlTemplateType = (typeof customCurlTemplateTypes)[number];
export type QuickReplyButton = z.infer<typeof quickReplyButtonSchema>;

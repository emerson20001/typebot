import { blockBaseSchema } from "@typebot.io/blocks-base/schemas";
import { buttonItemSchemas } from "@typebot.io/blocks-inputs/choice/schema";
import { z } from "@typebot.io/zod";
import { IntegrationBlockType } from "../constants";

const customListTextPartSchema = z.object({
  type: z.literal("text"),
  text: z.string().optional(),
});

const customListListPartSchema = z.object({
  type: z.literal("list"),
  question: z.string().optional(),
  footerText: z.string().optional(),
  format: z.enum(["numeric_list", "bullet_list"]).optional(),
  showEmojis: z.boolean().optional(),
});

export const customListPartSchema = z.discriminatedUnion("type", [
  customListTextPartSchema,
  customListListPartSchema,
]);

const customListOptionsBaseSchema = z.object({
  parts: z.array(customListPartSchema).optional(),
  retryMessageContent: z.string().optional(),
  dynamicItems: z
    .object({
      isEnabled: z.boolean().optional(),
      source: z.string().optional(),
    })
    .optional(),
});

export const customListTemplateSchema = z.object({
  parts: z.array(customListPartSchema).optional(),
  retryMessageContent: z.string().optional(),
  dynamicItems: z
    .object({
      isEnabled: z.boolean().optional(),
      source: z.string().optional(),
    })
    .optional(),
  listOptions: z
    .array(
      z.object({
        label: z.string().optional(),
        value: z.string().optional(),
        nextFlowName: z.string().optional(),
      }),
    )
    .optional(),
});

const customListBlockV5Schema = blockBaseSchema.merge(
  z.object({
    type: z.enum([IntegrationBlockType.CUSTOM_LIST]),
    options: customListOptionsBaseSchema.optional(),
    items: z.array(buttonItemSchemas.v5).optional(),
  }),
);

export const customListBlockSchemas = {
  v5: customListBlockV5Schema,
  v6: customListBlockV5Schema.merge(
    z.object({
      options: customListOptionsBaseSchema.optional(),
      items: z.array(buttonItemSchemas.v6).optional(),
    }),
  ),
};

export type CustomListBlock = z.infer<typeof customListBlockSchemas.v6>;
export type CustomListTemplate = z.infer<typeof customListTemplateSchema>;
export type CustomListPart = z.infer<typeof customListPartSchema>;

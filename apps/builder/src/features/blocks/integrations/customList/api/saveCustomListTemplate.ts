import { customListTemplateSchema } from "@typebot.io/blocks-integrations/customList/schema";
import prisma from "@typebot.io/prisma";
import { z } from "@typebot.io/zod";
import { authenticatedProcedure } from "@/helpers/server/trpc";

export const saveCustomListTemplate = authenticatedProcedure
  .meta({
    openapi: {
      method: "POST",
      path: "/v1/customListTemplates",
      protect: true,
      summary: "Save custom list template",
      tags: ["Custom List template"],
    },
  })
  .input(
    z.object({
      templateId: z.string().optional(),
      name: z.string().min(1),
      template: customListTemplateSchema,
    }),
  )
  .output(
    z.object({
      customListTemplate: z.object({
        id: z.string(),
        name: z.string(),
        template: customListTemplateSchema,
      }),
    }),
  )
  .mutation(async ({ ctx: { user }, input }) => {
    const templateId = input.templateId;
    const template = {
      name: input.name,
      template: input.template,
    };

    const customListTemplate = templateId
      ? await prisma.customListTemplate.update({
          where: { id: templateId, userId: user.id },
          data: template,
        })
      : await prisma.customListTemplate.create({
          data: {
            ...template,
            userId: user.id,
          },
        });

    return {
      customListTemplate: {
        id: customListTemplate.id,
        name: customListTemplate.name,
        template: customListTemplateSchema.parse(customListTemplate.template),
      },
    };
  });

import { customListTemplateSchema } from "@typebot.io/blocks-integrations/customList/schema";
import prisma from "@typebot.io/prisma";
import { z } from "@typebot.io/zod";
import { authenticatedProcedure } from "@/helpers/server/trpc";

export const listCustomListTemplates = authenticatedProcedure
  .meta({
    openapi: {
      method: "GET",
      path: "/v1/customListTemplates",
      protect: true,
      summary: "List custom list templates",
      tags: ["Custom List template"],
    },
  })
  .input(z.object({}).optional())
  .output(
    z.object({
      customListTemplates: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          template: customListTemplateSchema,
        }),
      ),
    }),
  )
  .query(async ({ ctx: { user } }) => {
    const customListTemplates = await prisma.customListTemplate.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        name: true,
        template: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return {
      customListTemplates: customListTemplates.map((template) => ({
        id: template.id,
        name: template.name,
        template: parseCustomListTemplate(template.template),
      })),
    };
  });

const parseCustomListTemplate = (value: unknown) => {
  const parsed = customListTemplateSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  return { parts: [], listOptions: [] };
};

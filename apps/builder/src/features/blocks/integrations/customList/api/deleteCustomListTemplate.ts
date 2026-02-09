import prisma from "@typebot.io/prisma";
import { z } from "@typebot.io/zod";
import { authenticatedProcedure } from "@/helpers/server/trpc";

export const deleteCustomListTemplate = authenticatedProcedure
  .meta({
    openapi: {
      method: "DELETE",
      path: "/v1/customListTemplates/{templateId}",
      protect: true,
      summary: "Delete custom list template",
      tags: ["Custom List template"],
    },
  })
  .input(
    z.object({
      templateId: z.string(),
    }),
  )
  .output(z.object({ success: z.boolean() }))
  .mutation(async ({ ctx: { user }, input }) => {
    await prisma.customListTemplate.delete({
      where: { id: input.templateId, userId: user.id },
    });
    return { success: true };
  });

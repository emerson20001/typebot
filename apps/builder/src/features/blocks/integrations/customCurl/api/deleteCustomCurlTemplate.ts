import prisma from "@typebot.io/prisma";
import { z } from "@typebot.io/zod";
import { authenticatedProcedure } from "@/helpers/server/trpc";

export const deleteCustomCurlTemplate = authenticatedProcedure
  .meta({
    openapi: {
      method: "DELETE",
      path: "/v1/customCurlTemplates/{templateId}",
      protect: true,
      summary: "Delete custom CURL template",
      tags: ["Custom CURL template"],
    },
  })
  .input(
    z.object({
      templateId: z.string(),
    }),
  )
  .output(
    z.object({
      id: z.string(),
    }),
  )
  .mutation(async ({ input: { templateId }, ctx: { user } }) => {
    await prisma.customCurlTemplate.delete({
      where: {
        id: templateId,
        userId: user.id,
      },
    });

    return { id: templateId };
  });

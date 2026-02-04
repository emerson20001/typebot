import { router } from "@/helpers/server/trpc";
import { deleteCustomCurlTemplate } from "./deleteCustomCurlTemplate";
import { listCustomCurlTemplates } from "./listCustomCurlTemplates";
import { saveCustomCurlTemplate } from "./saveCustomCurlTemplate";

export const customCurlRouter = router({
  listCustomCurlTemplates,
  saveCustomCurlTemplate,
  deleteCustomCurlTemplate,
});

export type CustomCurlRouter = typeof customCurlRouter;

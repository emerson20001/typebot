import { router } from "@/helpers/server/trpc";
import { deleteCustomListTemplate } from "./deleteCustomListTemplate";
import { listCustomListTemplates } from "./listCustomListTemplates";
import { saveCustomListTemplate } from "./saveCustomListTemplate";

export const customListRouter = router({
  listCustomListTemplates,
  saveCustomListTemplate,
  deleteCustomListTemplate,
});

export type CustomListRouter = typeof customListRouter;

import type { BlockIndices } from "@typebot.io/blocks-core/schemas/schema";
import type { CustomListBlock } from "@typebot.io/blocks-integrations/customList/schema";
import { ItemNodesList } from "@/features/graph/components/nodes/item/ItemNodesList";
import { CustomListNodeContent } from "./CustomListNodeContent";

type Props = {
  block: CustomListBlock;
  indices: BlockIndices;
};

export const CustomListBlockNode = ({ block, indices }: Props) => {
  const hasListPart = (block.options?.parts ?? []).some(
    (part) => part.type === "list",
  );

  if (!hasListPart) return <CustomListNodeContent block={block} />;
  if (!block.items) return <CustomListNodeContent block={block} />;

  const blockWithItems = {
    ...block,
    items: block.items ?? [],
  };

  return (
    <div className="flex flex-col gap-2 w-[90%]">
      <ItemNodesList block={blockWithItems} indices={indices} />
    </div>
  );
};

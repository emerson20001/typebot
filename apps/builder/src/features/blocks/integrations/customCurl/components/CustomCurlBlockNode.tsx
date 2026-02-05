import type { BlockIndices } from "@typebot.io/blocks-core/schemas/schema";
import type { CustomCurlBlock } from "@typebot.io/blocks-integrations/customCurl/schema";
import { ItemNodesList } from "@/features/graph/components/nodes/item/ItemNodesList";
import { CustomCurlNodeContent } from "./CustomCurlNodeContent";

type Props = {
  block: CustomCurlBlock;
  indices: BlockIndices;
};

export const CustomCurlBlockNode = ({ block, indices }: Props) => {
  const isQuickReply = block.options?.templateType === "Quick Reply";

  if (!isQuickReply) return <CustomCurlNodeContent block={block} />;
  if (!block.items) return <CustomCurlNodeContent block={block} />;

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

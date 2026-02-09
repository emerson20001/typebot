import type { CustomListBlock } from "@typebot.io/blocks-integrations/customList/schema";

type Props = {
  block: CustomListBlock;
};

export const CustomListNodeContent = ({ block }: Props) => {
  const parts = block.options?.parts ?? [];
  const hasParts = parts.length > 0;
  const listPart = parts.find((part) => part.type === "list");
  const textPreview = parts
    .filter((part) => part.type === "text")
    .map((part) => part.text?.trim())
    .filter((value): value is string => Boolean(value))
    .join(" / ");

  if (!hasParts) return <p className="text-gray-9">Configure...</p>;

  return (
    <div className="flex flex-col gap-1 w-full">
      {textPreview ? (
        <p className="pr-6 text-gray-9 truncate">{textPreview}</p>
      ) : (
        <p className="pr-6 text-gray-9 truncate">Lista Customizada</p>
      )}
      {listPart && (
        <p className="text-xs text-gray-9">
          {block.items?.length ?? 0} option(s)
        </p>
      )}
    </div>
  );
};

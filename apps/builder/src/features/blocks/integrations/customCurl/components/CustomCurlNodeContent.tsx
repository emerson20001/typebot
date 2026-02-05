import type { CustomCurlBlock } from "@typebot.io/blocks-integrations/customCurl/schema";
import { SetVariableLabel } from "@/components/SetVariableLabel";
import { useTypebot } from "@/features/editor/providers/TypebotProvider";

type Props = {
  block: CustomCurlBlock;
};

export const CustomCurlNodeContent = ({ block }: Props) => {
  const { typebot } = useTypebot();
  const webhook = block.options?.webhook;

  if (!webhook?.url) return <p className="text-gray-9">Configure...</p>;
  return (
    <div className="flex flex-col gap-2 w-full">
      <p className="pr-6 text-gray-9 truncate">
        {webhook.method} {webhook.url}
      </p>
      {block.options?.responseVariableMapping?.map((mapping) => {
        if (!mapping.variableId) return null;
        return (
          <SetVariableLabel
            key={mapping.variableId}
            variableId={mapping.variableId}
            variables={typebot?.variables}
          />
        );
      })}
    </div>
  );
};

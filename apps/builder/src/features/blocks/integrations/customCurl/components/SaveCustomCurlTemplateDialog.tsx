import { useMutation } from "@tanstack/react-query";
import type {
  CustomCurlTemplateType,
  QuickReplyButton,
} from "@typebot.io/blocks-integrations/customCurl/schema";
import { Button } from "@typebot.io/ui/components/Button";
import { Dialog } from "@typebot.io/ui/components/Dialog";
import { Field } from "@typebot.io/ui/components/Field";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { BasicSelect } from "@/components/inputs/BasicSelect";
import { DebouncedTextInput } from "@/components/inputs/DebouncedTextInput";
import { queryClient, trpc } from "@/lib/queryClient";

type Template = {
  id: string;
  name: string;
  curlCommand: string;
  type: CustomCurlTemplateType;
  quickReplyButtons?: QuickReplyButton[];
  templateBodyPreview?: string;
  templateImageUrl?: string;
  isExecutedOnClient?: boolean;
  timeout?: number;
};

type Props = {
  isOpen: boolean;
  onClose: (template?: Template) => void;
  selectedTemplate?: Pick<Template, "id" | "name">;
  curlCommand: string;
  templateType: CustomCurlTemplateType;
  quickReplyButtons: QuickReplyButton[];
  templateBodyPreview: string;
  templateImageUrl: string;
  isExecutedOnClient?: boolean;
  timeout?: number;
};

export const SaveCustomCurlTemplateDialog = ({
  isOpen,
  onClose,
  selectedTemplate,
  curlCommand,
  templateType,
  quickReplyButtons,
  templateBodyPreview,
  templateImageUrl,
  isExecutedOnClient,
  timeout,
}: Props) => {
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [localTemplateType, setLocalTemplateType] =
    useState<CustomCurlTemplateType>(templateType);
  const [localTemplateImageUrl, setLocalTemplateImageUrl] =
    useState<string>(templateImageUrl);
  const { mutate } = useMutation(
    trpc.customCurl.saveCustomCurlTemplate.mutationOptions({
      onMutate: () => setIsSaving(true),
      onSettled: () => setIsSaving(false),
      onSuccess: ({ customCurlTemplate }) => {
        queryClient.invalidateQueries({
          queryKey: trpc.customCurl.listCustomCurlTemplates.queryKey(),
        });
        onClose(customCurlTemplate);
      },
    }),
  );

  const updateExistingTemplate = (event: FormEvent) => {
    event.preventDefault();
    const name = inputRef.current?.value?.trim();
    if (!name) return;
    mutate({
      templateId: selectedTemplate?.id,
      name,
      curlCommand,
      type: localTemplateType,
      quickReplyButtons,
      templateBodyPreview,
      templateImageUrl: localTemplateImageUrl,
      isExecutedOnClient,
      timeout,
    });
  };

  const saveNewTemplate = () => {
    const name = inputRef.current?.value?.trim();
    if (!name) return;
    mutate({
      name,
      curlCommand,
      type: localTemplateType,
      quickReplyButtons,
      templateBodyPreview,
      templateImageUrl: localTemplateImageUrl,
      isExecutedOnClient,
      timeout,
    });
  };

  useEffect(() => {
    setLocalTemplateType(templateType);
    setLocalTemplateImageUrl(templateImageUrl);
  }, [templateType, templateImageUrl, isOpen]);

  return (
    <Dialog.Root isOpen={isOpen} onClose={onClose}>
      <Dialog.Popup render={<form onSubmit={updateExistingTemplate} />}>
        <Dialog.Title>Save template</Dialog.Title>
        <Dialog.CloseButton />
        <Field.Root>
          <Field.Label>Template name</Field.Label>
          <DebouncedTextInput
            ref={inputRef}
            defaultValue={selectedTemplate?.name}
            placeholder="My Twilio template"
          />
        </Field.Root>
        <Field.Root>
          <Field.Label>Template type</Field.Label>
          <BasicSelect
            value={localTemplateType}
            items={customCurlTemplateTypes.map((type) => ({
              label: type,
              value: type,
            }))}
            onChange={(value) => setLocalTemplateType(value)}
          />
        </Field.Root>
        <Field.Root>
          <Field.Label>Template image URL</Field.Label>
          <DebouncedTextInput
            defaultValue={localTemplateImageUrl}
            placeholder="https://..."
            onValueChange={setLocalTemplateImageUrl}
          />
        </Field.Root>
        <Dialog.Footer>
          {selectedTemplate?.id && (
            <Button
              disabled={isSaving}
              variant="secondary"
              onClick={saveNewTemplate}
            >
              Save as new
            </Button>
          )}
          <Button type="submit" disabled={isSaving}>
            {selectedTemplate?.id ? "Update" : "Save"}
          </Button>
        </Dialog.Footer>
      </Dialog.Popup>
    </Dialog.Root>
  );
};

const customCurlTemplateTypes: CustomCurlTemplateType[] = [
  "Text",
  "Media",
  "List Picker",
  "Call to action",
  "Quick Reply",
  "Card",
  "Catalog",
  "Carousel",
  "WhatsApp Card",
  "Authentication",
  "Flows",
];

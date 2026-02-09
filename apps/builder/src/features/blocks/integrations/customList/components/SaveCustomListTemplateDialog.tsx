import { useMutation } from "@tanstack/react-query";
import type { CustomListTemplate } from "@typebot.io/blocks-integrations/customList/schema";
import { Button } from "@typebot.io/ui/components/Button";
import { Dialog } from "@typebot.io/ui/components/Dialog";
import { Field } from "@typebot.io/ui/components/Field";
import { type FormEvent, useRef, useState } from "react";
import { DebouncedTextInput } from "@/components/inputs/DebouncedTextInput";
import { queryClient, trpc } from "@/lib/queryClient";

type Template = {
  id: string;
  name: string;
  template: CustomListTemplate;
};

type Props = {
  isOpen: boolean;
  onClose: (template?: Template) => void;
  selectedTemplate?: Pick<Template, "id" | "name">;
  template: CustomListTemplate;
};

export const SaveCustomListTemplateDialog = ({
  isOpen,
  onClose,
  selectedTemplate,
  template,
}: Props) => {
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { mutate } = useMutation(
    trpc.customList.saveCustomListTemplate.mutationOptions({
      onMutate: () => setIsSaving(true),
      onSettled: () => setIsSaving(false),
      onSuccess: ({ customListTemplate }) => {
        queryClient.invalidateQueries({
          queryKey: trpc.customList.listCustomListTemplates.queryKey(),
        });
        onClose(customListTemplate);
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
      template,
    });
  };

  const saveNewTemplate = () => {
    const name = inputRef.current?.value?.trim();
    if (!name) return;
    mutate({
      name,
      template,
    });
  };

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
            placeholder="Meu template de lista"
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

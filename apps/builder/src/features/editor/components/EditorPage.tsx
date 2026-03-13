import { LoaderCircleIcon } from "@typebot.io/ui/icons/LoaderCircleIcon";
import { useEffect } from "react";
import { Seo } from "@/components/Seo";
import { Graph } from "@/features/graph/components/Graph";
import { GraphDndProvider } from "@/features/graph/providers/GraphDndProvider";
import { GraphProvider } from "@/features/graph/providers/GraphProvider";
import { VideoOnboardingFloatingWindow } from "@/features/onboarding/components/VideoOnboardingFloatingWindow";
import { PreviewDrawer } from "@/features/preview/components/PreviewDrawer";
import { VariablesDrawer } from "@/features/preview/components/VariablesDrawer";
import { useWorkspace } from "@/features/workspace/WorkspaceProvider";
import { useRightPanel } from "@/hooks/useRightPanel";
import { useThemeValue } from "@/hooks/useThemeValue";
import { EditorProvider } from "../providers/EditorProvider";
import { useTypebot } from "../providers/TypebotProvider";
import { BlocksSideBar } from "./BlocksSideBar";
import { SuspectedTypebotBanner } from "./SuspectedTypebotBanner";
import { TypebotHeader } from "./TypebotHeader";

const CONTEXT_REQUEST_MESSAGE = "chatwoot-custom-menu:fetch-context";
const CONTEXT_EVENT = "chatwoot:custom-menu-context";
const IFRAME_CONTEXT_TIMEOUT_MS = 1200;

export const EditorPage = () => {
  const { typebot, currentUserMode } = useTypebot();
  const { workspace } = useWorkspace();
  const backgroundImage = useThemeValue(
    "radial-gradient(var(--gray-7) 1px, transparent 0)",
    "radial-gradient(var(--gray-5) 1px, transparent 0)",
  );

  const isSuspicious = typebot?.riskLevel === 100 && !workspace?.isVerified;

  useEffect(() => {
    if (typeof window === "undefined") return;

    const verifyChatwootParentContext = () =>
      new Promise<boolean>((resolve) => {
        if (window.self === window.top) {
          resolve(false);
          return;
        }

        let settled = false;
        const done = (result: boolean) => {
          if (settled) return;
          settled = true;
          window.removeEventListener("message", onMessage);
          window.clearTimeout(timeoutId);
          resolve(result);
        };

        const parseMessage = (data: unknown): { event?: string } | null => {
          if (typeof data === "string") {
            try {
              return JSON.parse(data) as { event?: string };
            } catch {
              return null;
            }
          }

          if (!data || typeof data !== "object") return null;
          return data as { event?: string };
        };

        const onMessage = (event: MessageEvent) => {
          const parsed = parseMessage(event.data);
          if (parsed?.event === CONTEXT_EVENT) {
            done(true);
          }
        };

        window.addEventListener("message", onMessage);
        const timeoutId = window.setTimeout(
          () => done(false),
          IFRAME_CONTEXT_TIMEOUT_MS,
        );
        window.parent?.postMessage(CONTEXT_REQUEST_MESSAGE, "*");
      });

    const enforceIframeSessionGuard = async () => {
      const hasChatwootContext = await verifyChatwootParentContext();
      if (hasChatwootContext) return;

      const response = await fetch("/api/chatwoot/typebot-autologin", {
        method: "DELETE",
        headers: { "X-Typebot-Iframe-Guard": "1" },
      });
      if (!response.ok) return;

      const data = (await response.json()) as {
        shouldRedirect?: boolean;
        signinPath?: string;
      };

      if (data.shouldRedirect && data.signinPath) {
        window.location.replace(data.signinPath);
      }
    };

    void enforceIframeSessionGuard().catch(() => undefined);
  }, []);

  return (
    <EditorProvider>
      <Seo title={typebot?.name ? `${typebot.name} | Editor` : "Editor"} />
      <div
        className="flex overflow-clip h-screen flex-col"
        id="editor-container"
      >
        <VideoOnboardingFloatingWindow type="editor" />
        {isSuspicious && <SuspectedTypebotBanner typebotId={typebot.id} />}
        <TypebotHeader />
        <div
          className="flex flex-1 relative overflow-clip h-full bg-gray-3 dark:bg-gray-2"
          style={{
            backgroundImage: backgroundImage,
            backgroundSize: "40px 40px",
            backgroundPosition: "-19px -19px",
          }}
        >
          {typebot ? (
            <GraphDndProvider>
              <GraphProvider
                isReadOnly={
                  currentUserMode === "read" || currentUserMode === "guest"
                }
              >
                <Graph className="flex-1" typebot={typebot} key={typebot.id} />

                <RightPanel />
              </GraphProvider>
              {currentUserMode === "write" && <BlocksSideBar />}
            </GraphDndProvider>
          ) : (
            <div className="flex justify-center items-center size-full">
              <LoaderCircleIcon className="animate-spin" />
            </div>
          )}
        </div>
      </div>
    </EditorProvider>
  );
};

const RightPanel = () => {
  const [rightPanel, setRightPanel] = useRightPanel();

  switch (rightPanel) {
    case "preview":
      return <PreviewDrawer />;
    case "variables":
      return <VariablesDrawer onClose={() => setRightPanel(null)} />;
    case null:
      return null;
  }
};

import { useTranslate } from "@tolgee/react";
import { useEffect } from "react";
import { useRouter } from "next/router";
import { Seo } from "@/components/Seo";
import { TextLink } from "@/components/TextLink";
import { SignInForm } from "./SignInForm";

type Props = {
  type: "signin" | "signup";
  defaultEmail?: string;
};

const TYPEBOT_READY_COMMAND = "typebotSigninReadyForTypebotAutoLogin";
const TYPEBOT_AUTO_LOGIN_COMMAND = "typebotAutoLoginByTypebotId";

export const SignInPage = ({ type }: Props) => {
  const { t } = useTranslate();
  const { query, locale } = useRouter();

  useEffect(() => {
    if (type !== "signin" || typeof window === "undefined") {
      return;
    }

    const isEmbeddedInIframe = window.self !== window.top;

    if (!isEmbeddedInIframe) {
      return;
    }

    const parseMessage = (
      data: unknown,
    ): { command?: string; typebotId?: string } | null => {
      if (typeof data === "string") {
        try {
          return JSON.parse(data);
        } catch {
          return null;
        }
      }

      if (!data || typeof data !== "object") {
        return null;
      }

      return data as { command?: string; typebotId?: string };
    };

    const handleTypebotAutoLogin = async (
      payload: { command?: string; typebotId?: string },
    ) => {
      if (payload.command !== TYPEBOT_AUTO_LOGIN_COMMAND || !payload.typebotId) {
        return;
      }

      const response = await fetch("/api/chatwoot/typebot-autologin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Typebot-Iframe-Autologin": "1",
        },
        body: JSON.stringify({
          command: payload.command,
          typebotId: payload.typebotId,
        }),
      });

      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as { redirectPath?: string };
      if (!data.redirectPath) {
        return;
      }

      const localizedPath =
        locale && locale !== "en"
          ? `/${locale}${data.redirectPath}`
          : data.redirectPath;

      window.location.assign(localizedPath);
    };

    const onMessage = (event: MessageEvent) => {
      const parsed = parseMessage(event.data);
      if (!parsed) {
        return;
      }
      void handleTypebotAutoLogin(parsed);
    };

    window.addEventListener("message", onMessage);
    window.parent?.postMessage(
      JSON.stringify({ command: TYPEBOT_READY_COMMAND }),
      "*",
    );

    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, [locale, type]);

  return (
    <div className="flex flex-col gap-4 h-screen justify-center items-center">
      <Seo
        title={
          type === "signin"
            ? t("auth.signin.heading")
            : t("auth.register.heading")
        }
      />
      <div className="flex flex-col p-8 rounded-lg gap-6 bg-gray-1">
        <div className="flex flex-col gap-4">
          <h2>
            {type === "signin"
              ? t("auth.signin.heading")
              : t("auth.register.heading")}
          </h2>
          {type === "signin" ? (
            <p>
              {t("auth.signin.noAccountLabel.preLink")}{" "}
              <TextLink href="/register">
                {t("auth.signin.noAccountLabel.link")}
              </TextLink>
            </p>
          ) : (
            <p>
              {t("auth.register.alreadyHaveAccountLabel.preLink")}{" "}
              <TextLink href="/signin">
                {t("auth.register.alreadyHaveAccountLabel.link")}
              </TextLink>
            </p>
          )}
        </div>

        <SignInForm defaultEmail={query.g?.toString()} />
      </div>
    </div>
  );
};

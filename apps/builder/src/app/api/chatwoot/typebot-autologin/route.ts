import prisma from "@typebot.io/prisma";
import { randomUUID } from "crypto";
import { type NextRequest, NextResponse } from "next/server";

const THIRTY_DAYS_IN_MS = 1000 * 60 * 60 * 24 * 30;
const TYPEBOT_AUTOLOGIN_COMMAND = "typebotAutoLoginByTypebotId";
const IFRAME_AUTOLOGIN_SESSION_PREFIX = "cw_iframe_typebot";
const IFRAME_AUTOLOGIN_ID_COOKIE = "cw_iframe_typebot_id";
const IFRAME_AUTOLOGIN_SESSION_COOKIE = "cw_iframe_typebot_session";
const FORCED_SIGNIN_PATH = "/pt-BR/signin";

type AutoLoginPayload = {
  command?: string;
  typebotId?: string;
};

export const runtime = "nodejs";

export const POST = async (req: NextRequest) => {
  const iframeAutologinHeader = req.headers.get("x-typebot-iframe-autologin");
  if (iframeAutologinHeader !== "1") {
    return NextResponse.json(
      { message: "Iframe context is required" },
      { status: 403 },
    );
  }

  const payload = (await req.json().catch(() => ({}))) as AutoLoginPayload;
  const typebotId = payload.typebotId?.trim();

  if (payload.command !== TYPEBOT_AUTOLOGIN_COMMAND || !typebotId) {
    return NextResponse.json({ message: "Invalid payload" }, { status: 400 });
  }

  const typebot = await prisma.typebot.findUnique({
    where: { id: typebotId },
    select: { id: true, workspaceId: true },
  });

  if (!typebot) {
    return NextResponse.json({ message: "Typebot not found" }, { status: 404 });
  }

  const workspaceMember = await prisma.memberInWorkspace.findFirst({
    where: {
      workspaceId: typebot.workspaceId,
      role: "ADMIN",
    },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });

  const fallbackMember =
    workspaceMember ||
    (await prisma.memberInWorkspace.findFirst({
      where: { workspaceId: typebot.workspaceId },
      orderBy: { createdAt: "asc" },
      select: { userId: true },
    }));

  if (!fallbackMember) {
    return NextResponse.json(
      { message: "Workspace member not found" },
      { status: 404 },
    );
  }

  const sessionToken = `${IFRAME_AUTOLOGIN_SESSION_PREFIX}_${typebot.id}_${randomUUID().replace(/-/g, "")}${randomUUID().replace(/-/g, "")}`;
  const expires = new Date(Date.now() + THIRTY_DAYS_IN_MS);

  await prisma.session.create({
    data: {
      sessionToken,
      userId: fallbackMember.userId,
      expires,
    },
  });

  const response = NextResponse.json({
    redirectPath: `/typebots/${typebot.id}/edit`,
  });

  const isSecureCookie = req.nextUrl.protocol === "https:";
  const cookieName = isSecureCookie
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";

  response.cookies.set(cookieName, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie,
    path: "/",
    expires,
  });
  response.cookies.set(IFRAME_AUTOLOGIN_ID_COOKIE, typebot.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie,
    path: "/",
    expires,
  });
  response.cookies.set(IFRAME_AUTOLOGIN_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie,
    path: "/",
    expires,
  });

  return response;
};

export const DELETE = async (req: NextRequest) => {
  if (req.headers.get("x-typebot-iframe-guard") !== "1") {
    return NextResponse.json(
      { message: "Invalid guard request" },
      { status: 400 },
    );
  }

  const sessionToken =
    req.cookies.get("__Secure-authjs.session-token")?.value ??
    req.cookies.get("authjs.session-token")?.value;
  const iframeSessionToken = req.cookies.get(
    IFRAME_AUTOLOGIN_SESSION_COOKIE,
  )?.value;

  const isIframeAutologinSession =
    Boolean(sessionToken) &&
    (sessionToken === iframeSessionToken ||
      sessionToken?.startsWith(`${IFRAME_AUTOLOGIN_SESSION_PREFIX}_`));

  if (!isIframeAutologinSession) {
    return NextResponse.json({ shouldRedirect: false });
  }

  if (sessionToken) {
    await prisma.session.deleteMany({
      where: { sessionToken },
    });
  }

  const response = NextResponse.json({
    shouldRedirect: true,
    signinPath: FORCED_SIGNIN_PATH,
  });

  response.cookies.delete("authjs.session-token");
  response.cookies.delete("__Secure-authjs.session-token");
  response.cookies.delete(IFRAME_AUTOLOGIN_ID_COOKIE);
  response.cookies.delete(IFRAME_AUTOLOGIN_SESSION_COOKIE);

  return response;
};

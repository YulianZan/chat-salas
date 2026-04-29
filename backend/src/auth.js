import { ConfidentialClientApplication } from "@azure/msal-node";
import session from "express-session";
import { Router } from "express";

const clientId = process.env.AZURE_CLIENT_ID || process.env.MicrosoftAppId || "";
const clientSecret = process.env.AZURE_CLIENT_SECRET || process.env.MicrosoftAppPassword || "";
const tenantId = process.env.AZURE_TENANT_ID || "common";

const msalClient = new ConfidentialClientApplication({
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    clientSecret,
  },
});

const REDIRECT_URI = `${process.env.PUBLIC_URL}/auth/callback`;
const SCOPES = ["openid", "profile", "email", "User.Read"];

export const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || "dev-secret-cambia-en-produccion",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 8 * 60 * 60 * 1000,
  },
});

export const router = Router();

router.get("/login", async (_req, res) => {
  try {
    const url = await msalClient.getAuthCodeUrl({ scopes: SCOPES, redirectUri: REDIRECT_URI });
    res.redirect(url);
  } catch (err) {
    console.error("auth/login error", err);
    res.status(500).json({ error: "No se pudo iniciar autenticación." });
  }
});

router.get("/callback", async (req, res) => {
  const frontendUrl = process.env.FRONTEND_URL || "/";
  try {
    const tokenResponse = await msalClient.acquireTokenByCode({
      code: String(req.query.code),
      scopes: SCOPES,
      redirectUri: REDIRECT_URI,
    });
    req.session.user = {
      name: tokenResponse.account?.name ?? "",
      email: tokenResponse.account?.username ?? "",
      id: tokenResponse.account?.homeAccountId ?? "",
    };
    res.redirect(frontendUrl);
  } catch (err) {
    console.error("auth/callback error", err);
    res.redirect(`${frontendUrl}?error=auth_failed`);
  }
});

router.get("/logout", (req, res) => {
  req.session.destroy(() => {});
  const postLogout = encodeURIComponent(process.env.FRONTEND_URL || "/");
  res.redirect(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/logout?post_logout_redirect_uri=${postLogout}`
  );
});

router.get("/me", (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "No autenticado" });
  res.json(req.session.user);
});

export function requireAuth(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: "Autenticación requerida" });
  next();
}

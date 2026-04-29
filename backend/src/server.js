import "dotenv/config";
import cors from "cors";
import express from "express";
import { BotFrameworkAdapter } from "botbuilder";
import {
  createBlock,
  createReservation,
  createRoom,
  deleteBlock,
  initDb,
  listBlocks,
  listReservations,
  listRooms,
  pool,
  setRoomActive
} from "./db.js";
import { ReservationsBot } from "./bot.js";
import { sessionMiddleware, router as authRouter, requireAuth } from "./auth.js";

const app = express();
const port = Number(process.env.PORT || 3000);

// Cloudflare → cloudflared → nginx → backend: confiar toda la cadena
app.set("trust proxy", true);

app.use(cors({
  origin: process.env.FRONTEND_URL || true,
  credentials: true,
}));
app.use(express.json());
app.use(sessionMiddleware);

// Rutas OAuth - no requieren autenticación
app.use("/auth", authRouter);

const adapter = new BotFrameworkAdapter({
  appId: process.env.MicrosoftAppId || process.env.MICROSOFT_APP_ID || "",
  appPassword: process.env.MicrosoftAppPassword || process.env.MICROSOFT_APP_PASSWORD || "",
  // Single-tenant bot: autenticar contra el tenant propio, no botframework.com
  channelAuthTenant: process.env.AZURE_TENANT_ID || "",
});

adapter.onTurnError = async (context, error) => {
  console.error("Bot error", error);
  await context.sendActivity("Ocurrio un error procesando la solicitud.");
};

const bot = new ReservationsBot();

app.get("/health", async (_req, res) => {
  await pool.query("select 1");
  res.json({ ok: true, service: "reservas-backend" });
});

// API protegida con autenticación
app.get("/api/rooms", requireAuth, async (_req, res, next) => {
  try {
    res.json(await listRooms());
  } catch (error) {
    next(error);
  }
});

app.post("/api/rooms", requireAuth, async (req, res, next) => {
  try {
    res.status(201).json(await createRoom(req.body));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/rooms/:id", requireAuth, async (req, res, next) => {
  try {
    res.json(await setRoomActive(req.params.id, req.body.active));
  } catch (error) {
    next(error);
  }
});

app.get("/api/reservations", requireAuth, async (req, res, next) => {
  try {
    res.json(await listReservations(req.query.date));
  } catch (error) {
    next(error);
  }
});

app.post("/api/reservations", requireAuth, async (req, res, next) => {
  try {
    const createdBy = req.session.user?.name || req.body.createdBy || "Panel admin";
    const reservation = await createReservation({ ...req.body, createdBy });
    res.status(201).json(reservation);
  } catch (error) {
    next(error);
  }
});

app.get("/api/blocks", requireAuth, async (req, res, next) => {
  try {
    res.json(await listBlocks(req.query.date));
  } catch (error) {
    next(error);
  }
});

app.post("/api/blocks", requireAuth, async (req, res, next) => {
  try {
    res.status(201).json(await createBlock(req.body));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/blocks/:id", requireAuth, async (req, res, next) => {
  try {
    await deleteBlock(req.params.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

// Webhook Teams Bot — sin autenticación de sesión
app.post("/api/messages", async (req, res) => {
  try {
    await adapter.processActivity(req, res, async (context) => {
      await bot.run(context);
    });
  } catch (err) {
    // Un 401 del Bot Framework (clave de firma no disponible, credenciales
    // incorrectas, etc.) no debe derribar el proceso entero.
    console.error("Bot processActivity error:", err.message);
    if (!res.headersSent) res.status(200).end();
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.status || 500).json({ error: error.message || "Error interno" });
});

await initDb();

app.listen(port, () => {
  console.log(`Reservas backend listening on ${port}`);
});

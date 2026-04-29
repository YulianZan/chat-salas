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

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(cors({ origin: process.env.FRONTEND_URL || true }));
app.use(express.json());

const adapter = new BotFrameworkAdapter({
  appId: process.env.MicrosoftAppId || process.env.MICROSOFT_APP_ID || "",
  appPassword: process.env.MicrosoftAppPassword || process.env.MICROSOFT_APP_PASSWORD || ""
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

app.get("/api/rooms", async (_req, res, next) => {
  try {
    res.json(await listRooms());
  } catch (error) {
    next(error);
  }
});

app.post("/api/rooms", async (req, res, next) => {
  try {
    res.status(201).json(await createRoom(req.body));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/rooms/:id", async (req, res, next) => {
  try {
    res.json(await setRoomActive(req.params.id, req.body.active));
  } catch (error) {
    next(error);
  }
});

app.get("/api/reservations", async (req, res, next) => {
  try {
    res.json(await listReservations(req.query.date));
  } catch (error) {
    next(error);
  }
});

app.post("/api/reservations", async (req, res, next) => {
  try {
    const reservation = await createReservation({ ...req.body, createdBy: req.body.createdBy || "Panel admin" });
    res.status(201).json(reservation);
  } catch (error) {
    next(error);
  }
});

app.get("/api/blocks", async (req, res, next) => {
  try {
    res.json(await listBlocks(req.query.date));
  } catch (error) {
    next(error);
  }
});

app.post("/api/blocks", async (req, res, next) => {
  try {
    res.status(201).json(await createBlock(req.body));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/blocks/:id", async (req, res, next) => {
  try {
    await deleteBlock(req.params.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post("/api/messages", (req, res) => {
  adapter.processActivity(req, res, async (context) => {
    await bot.run(context);
  });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.status || 500).json({ error: error.message || "Error interno" });
});

await initDb();

app.listen(port, () => {
  console.log(`Reservas backend listening on ${port}`);
});

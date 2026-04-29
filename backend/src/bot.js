import { ActivityHandler, CardFactory } from "botbuilder";
import { createReservation, listReservations, listRooms } from "./db.js";

const DEFAULT_EMAIL_DOMAIN = process.env.DEFAULT_EMAIL_DOMAIN || "empresa.cl";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function parseReservationText(text, rooms) {
  const clean = text.trim();
  const match = clean.match(/reservar\s+(.+?)\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+(\d{2}:\d{2})\s+(.+)/i);
  if (!match) return null;

  const [, roomName, date, startTime, endTime, title] = match;
  const room = rooms.find((item) => item.name.toLowerCase() === roomName.trim().toLowerCase());
  if (!room) return { error: `No encontre la sala "${roomName}". Escribe "salas" para ver opciones.` };

  return {
    roomId: room.id,
    title: title.trim(),
    start: `${date}T${startTime}:00`,
    end: `${date}T${endTime}:00`
  };
}

export class ReservationsBot extends ActivityHandler {
  constructor() {
    super();

    this.onMessage(async (context, next) => {
      const text = (context.activity.text || "").replace(/<at>.*?<\/at>/gi, "").trim();
      const lower = text.toLowerCase();

      if (!text || lower === "ayuda" || lower === "help") {
        await context.sendActivity({
          attachments: [
            CardFactory.heroCard("Reservas de salas", [
              "Comandos disponibles:",
              "salas",
              "reservas hoy",
              "reservar Sala Directorio 2026-04-29 09:00 10:00 Reunion gerencia"
            ].join("\n"))
          ]
        });
        return next();
      }

      if (lower === "salas") {
        const rooms = await listRooms({ activeOnly: true });
        await context.sendActivity(rooms.map((room) => `${room.name} (${room.capacity} personas, ${room.location})`).join("\n"));
        return next();
      }

      if (lower.startsWith("reservas")) {
        const date = lower.includes("hoy") ? todayISO() : text.match(/\d{4}-\d{2}-\d{2}/)?.[0] || todayISO();
        const reservations = await listReservations(date);
        if (reservations.length === 0) {
          await context.sendActivity(`No hay reservas para ${date}.`);
          return next();
        }

        await context.sendActivity(
          reservations
            .map((item) => `${item.roomName}: ${item.title} (${new Date(item.start).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })} - ${new Date(item.end).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })})`)
            .join("\n")
        );
        return next();
      }

      if (lower.startsWith("reservar")) {
        const rooms = await listRooms({ activeOnly: true });
        const parsed = parseReservationText(text, rooms);
        if (!parsed) {
          await context.sendActivity("Formato: reservar Sala Directorio 2026-04-29 09:00 10:00 Reunion gerencia");
          return next();
        }
        if (parsed.error) {
          await context.sendActivity(parsed.error);
          return next();
        }

        const userName = context.activity.from?.name || "Usuario Teams";
        const userEmail = context.activity.from?.aadObjectId
          ? `${context.activity.from.aadObjectId}@${DEFAULT_EMAIL_DOMAIN}`
          : `teams@${DEFAULT_EMAIL_DOMAIN}`;

        try {
          await createReservation({
            ...parsed,
            requester: userName,
            email: userEmail,
            createdBy: "Bot Teams"
          });
          await context.sendActivity("Reserva creada correctamente.");
        } catch (error) {
          await context.sendActivity(error.message);
        }
        return next();
      }

      await context.sendActivity('No entendi el comando. Escribe "ayuda" para ver ejemplos.');
      return next();
    });
  }
}

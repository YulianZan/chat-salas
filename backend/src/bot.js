import { ActivityHandler, CardFactory } from "botbuilder";
import { createReservation, listReservations, listRooms, pool } from "./db.js";

const DEFAULT_EMAIL_DOMAIN = process.env.DEFAULT_EMAIL_DOMAIN || "empresa.cl";
const FRONTEND_URL = process.env.FRONTEND_URL || "";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });
}

// Construye el email del usuario de Teams usando el nombre o el dominio corporativo
function resolveEmail(activity) {
  const from = activity.from;
  if (from?.userPrincipalName) return from.userPrincipalName;
  if (from?.email) return from.email;
  const slug = (from?.name || "usuario")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, ".");
  return `${slug}@${DEFAULT_EMAIL_DOMAIN}`;
}

// ── Adaptive Cards ────────────────────────────────────────────────────────────

function cardHelp() {
  return CardFactory.adaptiveCard({
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    type: "AdaptiveCard", version: "1.4",
    body: [
      { type: "TextBlock", text: "Reserva de Salas", weight: "Bolder", size: "Large" },
      { type: "TextBlock", text: "¿Qué necesitas hacer?", isSubtle: true, spacing: "None" },
    ],
    actions: [
      { type: "Action.Submit", title: "📋 Ver salas",         data: { cmd: "salas" } },
      { type: "Action.Submit", title: "📅 Reservas de hoy",   data: { cmd: "reservas_hoy" } },
      { type: "Action.Submit", title: "📌 Mis reservas",      data: { cmd: "mis_reservas" } },
      { type: "Action.Submit", title: "➕ Nueva reserva",     data: { cmd: "nueva_reserva" } },
    ],
  });
}

function cardRooms(rooms) {
  const rows = rooms.map((r) => ({
    type: "ColumnSet", separator: true, spacing: "Small",
    columns: [
      {
        type: "Column", width: "stretch",
        items: [
          { type: "TextBlock", text: r.name, weight: "Bolder" },
          { type: "TextBlock", text: `${r.location} · ${r.capacity} personas`, isSubtle: true, spacing: "None" },
        ],
      },
      {
        type: "Column", width: "auto",
        items: [{
          type: "TextBlock",
          text: r.active ? "Activa" : "Inactiva",
          color: r.active ? "Good" : "Attention",
        }],
      },
    ],
  }));

  return CardFactory.adaptiveCard({
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    type: "AdaptiveCard", version: "1.4",
    body: [
      { type: "TextBlock", text: "Salas configuradas", weight: "Bolder", size: "Medium" },
      ...rows,
    ],
    actions: [
      { type: "Action.Submit", title: "➕ Nueva reserva", data: { cmd: "nueva_reserva" } },
    ],
  });
}

function cardReservations(reservations, label) {
  const items = reservations.length === 0
    ? [{ type: "TextBlock", text: "No hay reservas para mostrar.", isSubtle: true }]
    : reservations.map((r) => ({
        type: "ColumnSet", separator: true, spacing: "Small",
        columns: [
          {
            type: "Column", width: "stretch",
            items: [
              { type: "TextBlock", text: r.title, weight: "Bolder" },
              { type: "TextBlock", text: r.roomName, isSubtle: true, spacing: "None" },
              { type: "TextBlock", text: `${formatTime(r.start)} – ${formatTime(r.end)}`, spacing: "None" },
              { type: "TextBlock", text: `👤 ${r.requester}`, isSubtle: true, size: "Small", spacing: "None" },
            ],
          },
          {
            type: "Column", width: "auto",
            items: [{ type: "TextBlock", text: `#${r.id}`, isSubtle: true, size: "Small" }],
          },
        ],
      }));

  return CardFactory.adaptiveCard({
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    type: "AdaptiveCard", version: "1.4",
    body: [
      { type: "TextBlock", text: `📅 ${label}`, weight: "Bolder", size: "Medium" },
      ...items,
    ],
    actions: reservations.length > 0
      ? [
          { type: "Action.Submit", title: "➕ Nueva reserva",   data: { cmd: "nueva_reserva" } },
          { type: "Action.Submit", title: "❌ Cancelar reserva", data: { cmd: "cancelar" } },
        ]
      : [{ type: "Action.Submit", title: "➕ Nueva reserva", data: { cmd: "nueva_reserva" } }],
  });
}

function cardNewReservation(rooms) {
  return CardFactory.adaptiveCard({
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    type: "AdaptiveCard", version: "1.4",
    body: [
      { type: "TextBlock", text: "Nueva reserva", weight: "Bolder", size: "Medium" },
      {
        type: "Input.ChoiceSet", id: "roomId", label: "Sala",
        style: "compact",
        value: String(rooms[0]?.id ?? ""),
        choices: rooms.map((r) => ({ title: `${r.name} (${r.capacity} personas · ${r.location})`, value: String(r.id) })),
      },
      { type: "Input.Text", id: "title", label: "Título de la reunión", placeholder: "Ej: Reunión de equipo" },
      {
        type: "ColumnSet",
        columns: [
          { type: "Column", width: "stretch", items: [{ type: "Input.Date", id: "date", label: "Fecha", value: todayISO() }] },
          { type: "Column", width: "auto",    items: [{ type: "Input.Time", id: "start", label: "Inicio", value: "09:00" }] },
          { type: "Column", width: "auto",    items: [{ type: "Input.Time", id: "end",   label: "Término", value: "10:00" }] },
        ],
      },
    ],
    actions: [
      { type: "Action.Submit", title: "✅ Confirmar reserva", data: { cmd: "confirmar_reserva" } },
      { type: "Action.Submit", title: "Cancelar",             data: { cmd: "ayuda" } },
    ],
  });
}

function cardCancelPicker(reservations) {
  if (reservations.length === 0) {
    return CardFactory.adaptiveCard({
      $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
      type: "AdaptiveCard", version: "1.4",
      body: [{ type: "TextBlock", text: "No tienes reservas activas para cancelar.", isSubtle: true }],
      actions: [{ type: "Action.Submit", title: "Volver", data: { cmd: "ayuda" } }],
    });
  }

  return CardFactory.adaptiveCard({
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    type: "AdaptiveCard", version: "1.4",
    body: [
      { type: "TextBlock", text: "Cancelar reserva", weight: "Bolder", size: "Medium" },
      {
        type: "Input.ChoiceSet", id: "reservationId", label: "Selecciona la reserva",
        style: "compact",
        choices: reservations.map((r) => ({
          title: `#${r.id} · ${r.title} · ${r.roomName} · ${formatDate(r.start)} ${formatTime(r.start)}–${formatTime(r.end)}`,
          value: String(r.id),
        })),
      },
    ],
    actions: [
      { type: "Action.Submit", title: "❌ Confirmar cancelación", data: { cmd: "confirmar_cancelar" } },
      { type: "Action.Submit", title: "Volver",                    data: { cmd: "ayuda" } },
    ],
  });
}

function cardConfirmation(reservation, roomName) {
  return CardFactory.adaptiveCard({
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    type: "AdaptiveCard", version: "1.4",
    body: [
      { type: "TextBlock", text: "✅ Reserva confirmada", weight: "Bolder", color: "Good", size: "Medium" },
      { type: "TextBlock", text: reservation.title, weight: "Bolder", spacing: "Medium" },
      { type: "TextBlock", text: `📅 ${formatDate(reservation.start)}`,                spacing: "None" },
      { type: "TextBlock", text: `⏰ ${formatTime(reservation.start)} – ${formatTime(reservation.end)}`, spacing: "None" },
      { type: "TextBlock", text: `🏢 ${roomName}`,                                     spacing: "None" },
      { type: "TextBlock", text: `ID de reserva: #${reservation.id}`, isSubtle: true,  spacing: "Small" },
      ...(FRONTEND_URL
        ? [{ type: "TextBlock", text: `[Ver panel web](${FRONTEND_URL})`, spacing: "Small" }]
        : []),
    ],
    actions: [
      { type: "Action.Submit", title: "📅 Ver reservas de hoy", data: { cmd: "reservas_hoy" } },
      { type: "Action.Submit", title: "Inicio",                  data: { cmd: "ayuda" } },
    ],
  });
}

// ── Bot ──────────────────────────────────────────────────────────────────────

export class ReservationsBot extends ActivityHandler {
  constructor() {
    super();

    this.onMembersAdded(async (context, next) => {
      for (const member of context.activity.membersAdded) {
        if (member.id !== context.activity.recipient.id) {
          await context.sendActivity({ attachments: [cardHelp()] });
        }
      }
      return next();
    });

    this.onMessage(async (context, next) => {
      const activity = context.activity;
      const cardPayload = activity.value ?? {};
      const rawText = (activity.text ?? "").replace(/<at>.*?<\/at>/gi, "").trim();
      const cmd = (cardPayload.cmd ?? rawText).toLowerCase().trim();

      const userName  = activity.from?.name ?? "Usuario Teams";
      const userEmail = resolveEmail(activity);

      // ── Ayuda / inicio ──────────────────────────────────────────────────
      if (!cmd || ["ayuda", "help", "hola", "inicio", "start"].includes(cmd)) {
        await context.sendActivity({ attachments: [cardHelp()] });
        return next();
      }

      // ── Ver salas ───────────────────────────────────────────────────────
      if (cmd === "salas") {
        const rooms = await listRooms({ activeOnly: false });
        await context.sendActivity({ attachments: [cardRooms(rooms)] });
        return next();
      }

      // ── Reservas de hoy ─────────────────────────────────────────────────
      if (cmd === "reservas_hoy" || cmd.startsWith("reservas")) {
        const date = cmd.includes("hoy") || cmd === "reservas_hoy"
          ? todayISO()
          : (rawText.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? todayISO());
        const reservations = await listReservations(date);
        await context.sendActivity({ attachments: [cardReservations(reservations, `Reservas del ${date}`)] });
        return next();
      }

      // ── Mis reservas ────────────────────────────────────────────────────
      if (cmd === "mis_reservas") {
        const all  = await listReservations();
        const now  = new Date();
        const mine = all.filter(
          (r) => (r.email === userEmail || r.requester === userName) && new Date(r.end) >= now
        );
        await context.sendActivity({ attachments: [cardReservations(mine, "Mis próximas reservas")] });
        return next();
      }

      // ── Formulario nueva reserva ────────────────────────────────────────
      if (cmd === "nueva_reserva") {
        const rooms = await listRooms({ activeOnly: true });
        if (rooms.length === 0) {
          await context.sendActivity("No hay salas activas disponibles.");
          return next();
        }
        await context.sendActivity({ attachments: [cardNewReservation(rooms)] });
        return next();
      }

      // ── Confirmar reserva (submit del formulario) ────────────────────────
      if (cmd === "confirmar_reserva") {
        const { roomId, title, date, start, end } = cardPayload;
        if (!roomId || !title || !date || !start || !end) {
          await context.sendActivity("Por favor completa todos los campos antes de confirmar.");
          return next();
        }
        const rooms = await listRooms({ activeOnly: true });
        const room  = rooms.find((r) => r.id === Number(roomId));
        try {
          const reservation = await createReservation({
            roomId: Number(roomId),
            title: title.trim(),
            requester: userName,
            email: userEmail,
            start: `${date}T${start}:00`,
            end:   `${date}T${end}:00`,
            createdBy: "Bot Teams",
          });
          await context.sendActivity({ attachments: [cardConfirmation(reservation, room?.name ?? "Sala")] });
        } catch (err) {
          await context.sendActivity(`⚠️ ${err.message}`);
        }
        return next();
      }

      // ── Seleccionar reserva para cancelar ───────────────────────────────
      if (cmd === "cancelar") {
        const all  = await listReservations();
        const now  = new Date();
        const mine = all.filter(
          (r) => (r.email === userEmail || r.requester === userName) && new Date(r.start) >= now
        );
        await context.sendActivity({ attachments: [cardCancelPicker(mine)] });
        return next();
      }

      // ── Confirmar cancelación ───────────────────────────────────────────
      if (cmd === "confirmar_cancelar") {
        const id = Number(cardPayload.reservationId);
        if (!id) {
          await context.sendActivity("Selecciona una reserva para cancelar.");
          return next();
        }
        try {
          await pool.query("delete from reservations where id = $1", [id]);
          await context.sendActivity(`✅ Reserva #${id} cancelada correctamente.`);
        } catch (err) {
          await context.sendActivity(`⚠️ ${err.message}`);
        }
        return next();
      }

      // ── Formato texto directo: reservar Sala X YYYY-MM-DD HH:MM HH:MM titulo ──
      if (cmd.startsWith("reservar ")) {
        const match = rawText.match(/reservar\s+(.+?)\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+(\d{2}:\d{2})\s+(.+)/i);
        if (!match) {
          await context.sendActivity(
            "Formato de texto: `reservar Sala Directorio 2026-05-01 09:00 10:00 Título`\nO usa el botón **Nueva reserva**."
          );
          return next();
        }
        const [, roomName, date, startTime, endTime, title] = match;
        const rooms = await listRooms({ activeOnly: true });
        const room  = rooms.find((r) => r.name.toLowerCase() === roomName.trim().toLowerCase());
        if (!room) {
          await context.sendActivity(`No encontré la sala "${roomName}". Escribe "salas" para ver las opciones.`);
          return next();
        }
        try {
          const reservation = await createReservation({
            roomId: room.id, title: title.trim(), requester: userName, email: userEmail,
            start: `${date}T${startTime}:00`, end: `${date}T${endTime}:00`, createdBy: "Bot Teams",
          });
          await context.sendActivity({ attachments: [cardConfirmation(reservation, room.name)] });
        } catch (err) {
          await context.sendActivity(`⚠️ ${err.message}`);
        }
        return next();
      }

      await context.sendActivity('No entendí el comando. Escribe "ayuda" para ver las opciones.');
      return next();
    });
  }
}

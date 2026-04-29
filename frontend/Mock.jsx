import React, { useEffect, useMemo, useState } from "react";
import { CalendarDays, DoorOpen, Plus, Search, Users, Clock, Pencil, Trash2, Ban, CheckCircle2 } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "/api";

const initialRooms = [
  { id: 1, name: "Sala Directorio", capacity: 12, location: "Piso 2", active: true },
  { id: 2, name: "Sala Reuniones 1", capacity: 8, location: "Piso 1", active: true },
  { id: 3, name: "Sala Reuniones 2", capacity: 6, location: "Piso 1", active: true },
];

const initialReservations = [
  {
    id: 1,
    roomId: 1,
    title: "Reunión gerencia",
    requester: "María González",
    email: "maria@empresa.cl",
    start: "2026-04-29T09:00",
    end: "2026-04-29T10:00",
    status: "Confirmada",
    createdBy: "Secretaría",
  },
  {
    id: 2,
    roomId: 2,
    title: "Revisión comercial",
    requester: "Carlos Pérez",
    email: "carlos@empresa.cl",
    start: "2026-04-29T11:00",
    end: "2026-04-29T12:30",
    status: "Confirmada",
    createdBy: "Bot Teams",
  },
];

const initialBlocks = [
  {
    id: 1,
    roomId: 3,
    reason: "Mantención preventiva",
    start: "2026-04-29T14:00",
    end: "2026-04-29T16:00",
  },
];

function formatDateTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function hasOverlap(aStart, aEnd, bStart, bEnd) {
  return new Date(aStart) < new Date(bEnd) && new Date(aEnd) > new Date(bStart);
}

export default function ReservasSalasMVP() {
  const [activeTab, setActiveTab] = useState("reservas");
  const [rooms, setRooms] = useState(initialRooms);
  const [reservations, setReservations] = useState(initialReservations);
  const [blocks, setBlocks] = useState(initialBlocks);
  const [search, setSearch] = useState("");
  const [selectedDate, setSelectedDate] = useState("2026-04-29");
  const [editingId, setEditingId] = useState(null);
  const [notice, setNotice] = useState("");
  const [apiEnabled, setApiEnabled] = useState(false);

  const [reservationForm, setReservationForm] = useState({
    roomId: "1",
    title: "",
    requester: "",
    email: "",
    start: "2026-04-29T09:00",
    end: "2026-04-29T10:00",
  });

  const [roomForm, setRoomForm] = useState({ name: "", capacity: "", location: "" });
  const [blockForm, setBlockForm] = useState({
    roomId: "1",
    reason: "",
    start: "2026-04-29T13:00",
    end: "2026-04-29T14:00",
  });

  const roomById = useMemo(() => {
    return Object.fromEntries(rooms.map((room) => [room.id, room]));
  }, [rooms]);

  useEffect(() => {
    async function loadRooms() {
      try {
        const response = await fetch(`${API_URL}/rooms`);
        if (!response.ok) throw new Error("No se pudieron cargar las salas.");
        setRooms(await response.json());
        setApiEnabled(true);
      } catch {
        setApiEnabled(false);
      }
    }

    loadRooms();
  }, []);

  useEffect(() => {
    async function loadReservations() {
      try {
        const [reservationsResponse, blocksResponse] = await Promise.all([
          fetch(`${API_URL}/reservations?date=${selectedDate}`),
          fetch(`${API_URL}/blocks?date=${selectedDate}`),
        ]);
        if (!reservationsResponse.ok || !blocksResponse.ok) throw new Error("No se pudo cargar la agenda.");
        setReservations(await reservationsResponse.json());
        setBlocks(await blocksResponse.json());
        setApiEnabled(true);
      } catch {
        setApiEnabled(false);
      }
    }

    loadReservations();
  }, [selectedDate]);

  const filteredReservations = reservations.filter((reservation) => {
    const room = roomById[reservation.roomId];
    const matchesDate = reservation.start.startsWith(selectedDate);
    const text = `${reservation.title} ${reservation.requester} ${reservation.email} ${room?.name || ""}`.toLowerCase();
    return matchesDate && text.includes(search.toLowerCase());
  });

  const dailyBlocks = blocks.filter((block) => block.start.startsWith(selectedDate));

  function resetReservationForm() {
    setEditingId(null);
    setReservationForm({
      roomId: "1",
      title: "",
      requester: "",
      email: "",
      start: `${selectedDate}T09:00`,
      end: `${selectedDate}T10:00`,
    });
  }

  function validateReservation(form) {
    if (!form.title || !form.requester || !form.email || !form.start || !form.end) {
      return "Completa todos los campos de la reserva.";
    }

    if (new Date(form.start) >= new Date(form.end)) {
      return "La hora de inicio debe ser menor que la hora de término.";
    }

    const roomId = Number(form.roomId);
    const reservationConflict = reservations.some((reservation) => {
      if (editingId && reservation.id === editingId) return false;
      return reservation.roomId === roomId && hasOverlap(form.start, form.end, reservation.start, reservation.end);
    });

    if (reservationConflict) return "La sala ya tiene una reserva en ese horario.";

    const blockConflict = blocks.some((block) => {
      return block.roomId === roomId && hasOverlap(form.start, form.end, block.start, block.end);
    });

    if (blockConflict) return "La sala está bloqueada en ese horario.";

    return "";
  }

  function saveReservation(event) {
    event.preventDefault();
    const error = validateReservation(reservationForm);
    if (error) {
      setNotice(error);
      return;
    }

    const payload = {
      ...reservationForm,
      roomId: Number(reservationForm.roomId),
      status: "Confirmada",
      createdBy: "Panel secretaría",
    };

    if (apiEnabled && !editingId) {
      fetch(`${API_URL}/reservations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then(async (response) => {
          if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(body.error || "No se pudo crear la reserva.");
          }
          return response.json();
        })
        .then((created) => {
          setReservations((current) => [created, ...current]);
          setNotice("Reserva creada correctamente.");
          resetReservationForm();
        })
        .catch((error) => setNotice(error.message));
      return;
    }

    if (editingId) {
      setReservations((current) => current.map((item) => (item.id === editingId ? { ...item, ...payload } : item)));
      setNotice("Reserva actualizada correctamente.");
    } else {
      setReservations((current) => [{ id: Date.now(), ...payload }, ...current]);
      setNotice("Reserva creada correctamente.");
    }

    resetReservationForm();
  }

  function editReservation(reservation) {
    setEditingId(reservation.id);
    setReservationForm({
      roomId: String(reservation.roomId),
      title: reservation.title,
      requester: reservation.requester,
      email: reservation.email,
      start: reservation.start,
      end: reservation.end,
    });
    setActiveTab("reservas");
  }

  function cancelReservation(id) {
    setReservations((current) => current.filter((item) => item.id !== id));
    setNotice("Reserva cancelada.");
  }

  function addRoom(event) {
    event.preventDefault();
    if (!roomForm.name || !roomForm.capacity || !roomForm.location) {
      setNotice("Completa todos los campos de la sala.");
      return;
    }

    const payload = {
      name: roomForm.name,
      capacity: Number(roomForm.capacity),
      location: roomForm.location,
      active: true,
    };

    if (apiEnabled) {
      fetch(`${API_URL}/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then((response) => {
          if (!response.ok) throw new Error("No se pudo crear la sala.");
          return response.json();
        })
        .then((created) => {
          setRooms((current) => [...current, created]);
          setRoomForm({ name: "", capacity: "", location: "" });
          setNotice("Sala agregada correctamente.");
        })
        .catch((error) => setNotice(error.message));
      return;
    }

    setRooms((current) => [...current, { id: Date.now(), ...payload }]);
    setRoomForm({ name: "", capacity: "", location: "" });
    setNotice("Sala agregada correctamente.");
  }

  function toggleRoom(id) {
    const room = rooms.find((item) => item.id === id);
    if (apiEnabled && room) {
      fetch(`${API_URL}/rooms/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !room.active }),
      })
        .then((response) => {
          if (!response.ok) throw new Error("No se pudo actualizar la sala.");
          return response.json();
        })
        .then((updated) => setRooms((current) => current.map((item) => (item.id === id ? updated : item))))
        .catch((error) => setNotice(error.message));
      return;
    }

    setRooms((current) => current.map((item) => (item.id === id ? { ...item, active: !item.active } : item)));
  }

  function addBlock(event) {
    event.preventDefault();
    if (!blockForm.reason || !blockForm.start || !blockForm.end) {
      setNotice("Completa todos los campos del bloqueo.");
      return;
    }

    if (new Date(blockForm.start) >= new Date(blockForm.end)) {
      setNotice("La hora de inicio del bloqueo debe ser menor que la hora de término.");
      return;
    }

    const payload = { roomId: Number(blockForm.roomId), reason: blockForm.reason, start: blockForm.start, end: blockForm.end };

    if (apiEnabled) {
      fetch(`${API_URL}/blocks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then(async (response) => {
          if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(body.error || "No se pudo crear el bloqueo.");
          }
          return response.json();
        })
        .then((created) => {
          setBlocks((current) => [created, ...current]);
          setBlockForm({ roomId: "1", reason: "", start: `${selectedDate}T13:00`, end: `${selectedDate}T14:00` });
          setNotice("Sala bloqueada correctamente.");
        })
        .catch((error) => setNotice(error.message));
      return;
    }

    setBlocks((current) => [{ id: Date.now(), ...payload }, ...current]);
    setBlockForm({ roomId: "1", reason: "", start: `${selectedDate}T13:00`, end: `${selectedDate}T14:00` });
    setNotice("Sala bloqueada correctamente.");
  }

  function removeBlock(id) {
    if (apiEnabled) {
      fetch(`${API_URL}/blocks/${id}`, { method: "DELETE" })
        .then((response) => {
          if (!response.ok) throw new Error("No se pudo eliminar el bloqueo.");
          setBlocks((current) => current.filter((block) => block.id !== id));
          setNotice("Bloqueo eliminado.");
        })
        .catch((error) => setNotice(error.message));
      return;
    }

    setBlocks((current) => current.filter((block) => block.id !== id));
    setNotice("Bloqueo eliminado.");
  }

  const availableRoomsNow = rooms.filter((room) => room.active).length;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b bg-white px-6 py-4">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">MVP interno</p>
            <h1 className="text-2xl font-bold">Reserva de salas de reuniones</h1>
          </div>
          <div className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Panel secretaría</div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-6 py-6 lg:grid-cols-[260px_1fr]">
        <aside className="space-y-4">
          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-500">Resumen</h2>
            <div className="space-y-3">
              <Stat icon={<DoorOpen size={18} />} label="Salas activas" value={availableRoomsNow} />
              <Stat icon={<CalendarDays size={18} />} label="Reservas del día" value={filteredReservations.length} />
              <Stat icon={<Ban size={18} />} label="Bloqueos del día" value={dailyBlocks.length} />
            </div>
          </section>

          <nav className="rounded-2xl bg-white p-2 shadow-sm">
            <TabButton active={activeTab === "reservas"} onClick={() => setActiveTab("reservas")} icon={<CalendarDays size={18} />}>
              Reservas
            </TabButton>
            <TabButton active={activeTab === "salas"} onClick={() => setActiveTab("salas")} icon={<DoorOpen size={18} />}>
              Salas
            </TabButton>
            <TabButton active={activeTab === "bloqueos"} onClick={() => setActiveTab("bloqueos")} icon={<Ban size={18} />}>
              Bloqueos
            </TabButton>
          </nav>
        </aside>

        <section className="space-y-6">
          {notice && (
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
              <CheckCircle2 size={18} />
              <span>{notice}</span>
              <button className="ml-auto text-slate-500 hover:text-slate-900" onClick={() => setNotice("")}>Cerrar</button>
            </div>
          )}

          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-bold">Calendario diario</h2>
                <p className="text-sm text-slate-500">Vista simple para revisar reservas, salas y bloqueos.</p>
              </div>
              <div className="flex flex-col gap-2 md:flex-row">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                />
                <div className="flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2">
                  <Search size={16} className="text-slate-400" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Buscar reserva"
                    className="bg-transparent text-sm outline-none"
                  />
                </div>
              </div>
            </div>
          </section>

          {activeTab === "reservas" && (
            <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
              <FormCard title={editingId ? "Editar reserva" : "Crear reserva"} icon={<Plus size={18} />}>
                <form onSubmit={saveReservation} className="space-y-3">
                  <Field label="Sala">
                    <select
                      value={reservationForm.roomId}
                      onChange={(event) => setReservationForm({ ...reservationForm, roomId: event.target.value })}
                      className="input"
                    >
                      {rooms.filter((room) => room.active).map((room) => (
                        <option key={room.id} value={room.id}>{room.name}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Título de la reunión">
                    <input className="input" value={reservationForm.title} onChange={(e) => setReservationForm({ ...reservationForm, title: e.target.value })} />
                  </Field>
                  <Field label="Solicitante">
                    <input className="input" value={reservationForm.requester} onChange={(e) => setReservationForm({ ...reservationForm, requester: e.target.value })} />
                  </Field>
                  <Field label="Correo solicitante">
                    <input className="input" type="email" value={reservationForm.email} onChange={(e) => setReservationForm({ ...reservationForm, email: e.target.value })} />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Inicio">
                      <input className="input" type="datetime-local" value={reservationForm.start} onChange={(e) => setReservationForm({ ...reservationForm, start: e.target.value })} />
                    </Field>
                    <Field label="Término">
                      <input className="input" type="datetime-local" value={reservationForm.end} onChange={(e) => setReservationForm({ ...reservationForm, end: e.target.value })} />
                    </Field>
                  </div>
                  <div className="flex gap-2">
                    <button className="btn-primary" type="submit">{editingId ? "Guardar cambios" : "Crear reserva"}</button>
                    {editingId && <button className="btn-secondary" type="button" onClick={resetReservationForm}>Cancelar edición</button>}
                  </div>
                </form>
              </FormCard>

              <ListCard title="Reservas del día">
                {filteredReservations.length === 0 ? (
                  <Empty message="No hay reservas para esta fecha." />
                ) : (
                  <div className="space-y-3">
                    {filteredReservations.map((reservation) => (
                      <div key={reservation.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <h3 className="font-bold">{reservation.title}</h3>
                            <p className="text-sm text-slate-500">{roomById[reservation.roomId]?.name} · {roomById[reservation.roomId]?.location}</p>
                            <p className="mt-2 flex items-center gap-2 text-sm"><Clock size={16} /> {formatTime(reservation.start)} - {formatTime(reservation.end)}</p>
                            <p className="mt-1 flex items-center gap-2 text-sm"><Users size={16} /> {reservation.requester} · {reservation.email}</p>
                            <p className="mt-1 text-xs text-slate-500">Creada por: {reservation.createdBy}</p>
                          </div>
                          <div className="flex gap-2">
                            <button className="icon-btn" onClick={() => editReservation(reservation)} title="Editar"><Pencil size={16} /></button>
                            <button className="icon-btn" onClick={() => cancelReservation(reservation.id)} title="Cancelar"><Trash2 size={16} /></button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ListCard>
            </div>
          )}

          {activeTab === "salas" && (
            <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
              <FormCard title="Agregar sala" icon={<DoorOpen size={18} />}>
                <form onSubmit={addRoom} className="space-y-3">
                  <Field label="Nombre">
                    <input className="input" value={roomForm.name} onChange={(e) => setRoomForm({ ...roomForm, name: e.target.value })} />
                  </Field>
                  <Field label="Capacidad">
                    <input className="input" type="number" value={roomForm.capacity} onChange={(e) => setRoomForm({ ...roomForm, capacity: e.target.value })} />
                  </Field>
                  <Field label="Ubicación">
                    <input className="input" value={roomForm.location} onChange={(e) => setRoomForm({ ...roomForm, location: e.target.value })} />
                  </Field>
                  <button className="btn-primary" type="submit">Agregar sala</button>
                </form>
              </FormCard>

              <ListCard title="Salas configuradas">
                <div className="grid gap-3 md:grid-cols-2">
                  {rooms.map((room) => (
                    <div key={room.id} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-bold">{room.name}</h3>
                          <p className="text-sm text-slate-500">{room.location}</p>
                          <p className="mt-2 text-sm">Capacidad: {room.capacity} personas</p>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${room.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
                          {room.active ? "Activa" : "Inactiva"}
                        </span>
                      </div>
                      <button className="btn-secondary mt-4" onClick={() => toggleRoom(room.id)}>
                        {room.active ? "Desactivar" : "Activar"}
                      </button>
                    </div>
                  ))}
                </div>
              </ListCard>
            </div>
          )}

          {activeTab === "bloqueos" && (
            <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
              <FormCard title="Bloquear sala" icon={<Ban size={18} />}>
                <form onSubmit={addBlock} className="space-y-3">
                  <Field label="Sala">
                    <select className="input" value={blockForm.roomId} onChange={(e) => setBlockForm({ ...blockForm, roomId: e.target.value })}>
                      {rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Motivo">
                    <input className="input" value={blockForm.reason} onChange={(e) => setBlockForm({ ...blockForm, reason: e.target.value })} />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Inicio">
                      <input className="input" type="datetime-local" value={blockForm.start} onChange={(e) => setBlockForm({ ...blockForm, start: e.target.value })} />
                    </Field>
                    <Field label="Término">
                      <input className="input" type="datetime-local" value={blockForm.end} onChange={(e) => setBlockForm({ ...blockForm, end: e.target.value })} />
                    </Field>
                  </div>
                  <button className="btn-primary" type="submit">Crear bloqueo</button>
                </form>
              </FormCard>

              <ListCard title="Bloqueos del día">
                {dailyBlocks.length === 0 ? (
                  <Empty message="No hay bloqueos para esta fecha." />
                ) : (
                  <div className="space-y-3">
                    {dailyBlocks.map((block) => (
                      <div key={block.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
                        <div>
                          <h3 className="font-bold">{roomById[block.roomId]?.name}</h3>
                          <p className="text-sm text-slate-500">{block.reason}</p>
                          <p className="mt-2 text-sm">{formatDateTime(block.start)} - {formatDateTime(block.end)}</p>
                        </div>
                        <button className="icon-btn" onClick={() => removeBlock(block.id)} title="Eliminar bloqueo"><Trash2 size={16} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </ListCard>
            </div>
          )}
        </section>
      </main>

      <style>{`
        .input { width: 100%; border-radius: 0.75rem; border: 1px solid #cbd5e1; padding: 0.625rem 0.75rem; font-size: 0.875rem; outline: none; }
        .input:focus { border-color: #0f172a; box-shadow: 0 0 0 2px rgba(15, 23, 42, 0.08); }
        .btn-primary { border-radius: 0.75rem; background: #0f172a; color: white; padding: 0.625rem 1rem; font-size: 0.875rem; font-weight: 700; }
        .btn-primary:hover { background: #1e293b; }
        .btn-secondary { border-radius: 0.75rem; border: 1px solid #cbd5e1; background: white; color: #0f172a; padding: 0.625rem 1rem; font-size: 0.875rem; font-weight: 700; }
        .btn-secondary:hover { background: #f8fafc; }
        .icon-btn { display: inline-flex; align-items: center; justify-content: center; border-radius: 0.75rem; border: 1px solid #cbd5e1; background: white; color: #0f172a; width: 2.25rem; height: 2.25rem; }
        .icon-btn:hover { background: #f8fafc; }
      `}</style>
    </div>
  );
}

function Stat({ icon, label, value }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
      <div className="flex items-center gap-2 text-slate-600">{icon}<span className="text-sm">{label}</span></div>
      <strong>{value}</strong>
    </div>
  );
}

function TabButton({ active, onClick, icon, children }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold ${active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
    >
      {icon}
      {children}
    </button>
  );
}

function FormCard({ title, icon, children }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        {icon}
        <h2 className="font-bold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function ListCard({ title, children }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="mb-4 font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function Empty({ message }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{message}</div>;
}

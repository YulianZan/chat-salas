import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export async function initDb() {
  await pool.query(`
    create table if not exists rooms (
      id serial primary key,
      name text not null,
      capacity integer not null,
      location text not null,
      active boolean not null default true,
      created_at timestamptz not null default now()
    );

    create table if not exists reservations (
      id serial primary key,
      room_id integer not null references rooms(id),
      title text not null,
      requester text not null,
      email text not null,
      start_at timestamptz not null,
      end_at timestamptz not null,
      status text not null default 'Confirmada',
      created_by text not null default 'Bot Teams',
      created_at timestamptz not null default now()
    );

    create table if not exists room_blocks (
      id serial primary key,
      room_id integer not null references rooms(id),
      reason text not null,
      start_at timestamptz not null,
      end_at timestamptz not null,
      created_at timestamptz not null default now()
    );
  `);

  const { rows } = await pool.query("select count(*)::int as total from rooms");
  if (rows[0].total === 0) {
    await pool.query(
      `insert into rooms (name, capacity, location)
       values
        ('Sala Directorio', 12, 'Piso 2'),
        ('Sala Reuniones 1', 8, 'Piso 1'),
        ('Sala Reuniones 2', 6, 'Piso 1')`
    );
  }
}

export async function listRooms({ activeOnly = false } = {}) {
  const { rows } = await pool.query(
    `select id, name, capacity, location, active
     from rooms
     where ($1::boolean = false or active = true)
     order by id`,
    [activeOnly]
  );
  return rows;
}

export async function createRoom({ name, capacity, location }) {
  const { rows } = await pool.query(
    `insert into rooms (name, capacity, location)
     values ($1, $2, $3)
     returning id, name, capacity, location, active`,
    [name, capacity, location]
  );
  return rows[0];
}

export async function setRoomActive(id, active) {
  const { rows } = await pool.query(
    `update rooms
     set active = $2
     where id = $1
     returning id, name, capacity, location, active`,
    [id, active]
  );
  return rows[0];
}

export async function listReservations(date) {
  const { rows } = await pool.query(
    `select r.id, r.room_id as "roomId", ro.name as "roomName", r.title, r.requester,
            r.email, r.start_at as start, r.end_at as "end", r.status, r.created_by as "createdBy"
     from reservations r
     join rooms ro on ro.id = r.room_id
     where ($1::date is null or r.start_at::date = $1::date)
     order by r.start_at`,
    [date || null]
  );
  return rows;
}

export async function listBlocks(date) {
  const { rows } = await pool.query(
    `select id, room_id as "roomId", reason, start_at as start, end_at as "end"
     from room_blocks
     where ($1::date is null or start_at::date = $1::date)
     order by start_at`,
    [date || null]
  );
  return rows;
}

export async function createBlock({ roomId, reason, start, end }) {
  if (new Date(start) >= new Date(end)) {
    const error = new Error("La hora de inicio del bloqueo debe ser menor que la hora de termino.");
    error.status = 400;
    throw error;
  }

  const conflict = await hasRoomConflict({ roomId, start, end });
  if (conflict) {
    const error = new Error("La sala ya tiene reservas o bloqueos en ese horario.");
    error.status = 409;
    throw error;
  }

  const { rows } = await pool.query(
    `insert into room_blocks (room_id, reason, start_at, end_at)
     values ($1, $2, $3, $4)
     returning id, room_id as "roomId", reason, start_at as start, end_at as "end"`,
    [roomId, reason, start, end]
  );
  return rows[0];
}

export async function deleteBlock(id) {
  await pool.query("delete from room_blocks where id = $1", [id]);
}

export async function hasRoomConflict({ roomId, start, end }) {
  const { rows } = await pool.query(
    `select exists (
      select 1 from reservations
      where room_id = $1 and start_at < $3::timestamptz and end_at > $2::timestamptz
      union all
      select 1 from room_blocks
      where room_id = $1 and start_at < $3::timestamptz and end_at > $2::timestamptz
    ) as conflict`,
    [roomId, start, end]
  );
  return rows[0].conflict;
}

export async function createReservation({ roomId, title, requester, email, start, end, createdBy = "Bot Teams" }) {
  if (new Date(start) >= new Date(end)) {
    const error = new Error("La hora de inicio debe ser menor que la hora de termino.");
    error.status = 400;
    throw error;
  }

  const conflict = await hasRoomConflict({ roomId, start, end });
  if (conflict) {
    const error = new Error("La sala ya esta ocupada o bloqueada en ese horario.");
    error.status = 409;
    throw error;
  }

  const { rows } = await pool.query(
    `insert into reservations (room_id, title, requester, email, start_at, end_at, created_by)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id, room_id as "roomId", title, requester, email, start_at as start, end_at as "end", status, created_by as "createdBy"`,
    [roomId, title, requester, email, start, end, createdBy]
  );
  return rows[0];
}

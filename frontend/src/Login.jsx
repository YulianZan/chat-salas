import React from "react";
import { useAuth } from "./AuthContext";

export default function Login() {
  const { authBase } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-md text-center">
        <div className="mb-6">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900">
            <svg viewBox="0 0 24 24" className="h-7 w-7 fill-white" xmlns="http://www.w3.org/2000/svg">
              <path d="M11 11V3H3v8h8zm2 0h8V3h-8v8zm-2 2H3v8h8v-8zm2 0v8h8v-8h-8z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-slate-900">Reserva de Salas</h1>
          <p className="mt-1 text-sm text-slate-500">Inicia sesión con tu cuenta corporativa</p>
        </div>

        <a
          href={`${authBase}/login`}
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
        >
          <svg viewBox="0 0 23 23" className="h-5 w-5" xmlns="http://www.w3.org/2000/svg">
            <path fill="#f25022" d="M1 1h10v10H1z" />
            <path fill="#00a4ef" d="M12 1h10v10H12z" />
            <path fill="#7fba00" d="M1 12h10v10H1z" />
            <path fill="#ffb900" d="M12 12h10v10H12z" />
          </svg>
          Iniciar sesión con Microsoft
        </a>

        <p className="mt-6 text-xs text-slate-400">
          Área de Tecnología · BDO Chile
        </p>
      </div>
    </div>
  );
}

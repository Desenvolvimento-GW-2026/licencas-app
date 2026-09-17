"use client";
import { useState, useEffect, useCallback } from "react";
import { signOut } from "next-auth/react";
import SummaryCards from "@/components/SummaryCards";
import Filters, { FilterState } from "@/components/Filters";
import LicenseTable from "@/components/LicenseTable";

interface License {
  id: number;
  nome_empreendimento: string;
  cnpj: string | null;
  cliente: string | null;
  numero_poco: string | null;
  requerimento_atual: string | null;
  requerimento_anterior: string | null;
  portaria: string | null;
  validade: string | null;
  status: string | null;
  data_protocolo: string | null;
}

export default function DashboardPage() {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>({
    cliente: "", status: "", mes: "", ano: "",
  });

  const fetchLicenses = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.cliente) params.set("cliente", filters.cliente);
    if (filters.status) params.set("status", filters.status);
    if (filters.mes) params.set("mes", filters.mes);
    if (filters.ano) params.set("ano", filters.ano);
    const res = await fetch(`/api/licenses?${params}`);
    const data = await res.json();
    setLicenses(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [filters]);

  useEffect(() => { fetchLicenses(); }, [fetchLicenses]);

  const clientes = Array.from(
    new Set(licenses.map((l) => l.cliente).filter(Boolean) as string[])
  ).sort();

  return (
    <div style={{ minHeight: "100vh", background: "#f4f6fa" }}>
      <header
        style={{
          background: "#3D397E",
          color: "#fff",
          padding: "0 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 56,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <img
            src="https://generalwater.com.br/wp-content/uploads/2023/09/Logo-General-Water.png"
            alt="General Water"
            style={{ height: 36, filter: "brightness(0) invert(1)" }}
          />
          <span style={{ fontWeight: 700, fontSize: 16 }}>Licenças de Poços</span>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          style={{
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.4)",
            color: "#fff",
            borderRadius: 6,
            padding: "6px 14px",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          Sair
        </button>
      </header>

      <main style={{ padding: "24px" }}>
        <SummaryCards licenses={licenses} />
        <div
          style={{
            background: "#fff",
            borderRadius: 8,
            padding: 16,
            boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
          }}
        >
          <Filters filters={filters} onChange={setFilters} clientes={clientes} />
          {loading ? (
            <p style={{ color: "#888", textAlign: "center", padding: 40 }}>Carregando…</p>
          ) : (
            <LicenseTable licenses={licenses} />
          )}
        </div>
      </main>
    </div>
  );
}

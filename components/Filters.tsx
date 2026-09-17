"use client";

export interface FilterState {
  cliente: string;
  status: string;
  mes: string;
  ano: string;
}

interface Props {
  filters: FilterState;
  onChange: (f: FilterState) => void;
  clientes: string[];
}

const MONTHS = [
  "", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const YEARS = Array.from({ length: 6 }, (_, i) => String(new Date().getFullYear() - 1 + i));

const STATUSES = ["", "Ativo", "Vencido", "Em Análise", "Cancelado", "Suspenso"];

export default function Filters({ filters, onChange, clientes }: Props) {
  function set(key: keyof FilterState, value: string) {
    onChange({ ...filters, [key]: value });
  }

  const selectStyle: React.CSSProperties = {
    padding: "8px 12px",
    border: "1px solid #ddd",
    borderRadius: 6,
    fontSize: 13,
    background: "#fff",
    minWidth: 140,
  };

  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        flexWrap: "wrap",
        marginBottom: 16,
        alignItems: "center",
      }}
    >
      <select
        style={selectStyle}
        value={filters.cliente}
        onChange={(e) => set("cliente", e.target.value)}
      >
        <option value="">Todos os clientes</option>
        {clientes.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>

      <select
        style={selectStyle}
        value={filters.status}
        onChange={(e) => set("status", e.target.value)}
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>{s || "Todos os status"}</option>
        ))}
      </select>

      <select
        style={{ ...selectStyle, opacity: filters.ano ? 1 : 0.5 }}
        value={filters.mes}
        disabled={!filters.ano}
        onChange={(e) => set("mes", e.target.value)}
      >
        <option value="">Todos os meses</option>
        {MONTHS.slice(1).map((m, i) => (
          <option key={i + 1} value={String(i + 1)}>{m}</option>
        ))}
      </select>

      <select
        style={selectStyle}
        value={filters.ano}
        onChange={(e) => set("ano", e.target.value)}
      >
        <option value="">Todos os anos</option>
        {YEARS.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>

      <button
        onClick={() => onChange({ cliente: "", status: "", mes: "", ano: "" })}
        style={{
          padding: "8px 14px",
          border: "1px solid #ccc",
          borderRadius: 6,
          background: "#f5f5f5",
          cursor: "pointer",
          fontSize: 13,
        }}
      >
        Limpar
      </button>
    </div>
  );
}

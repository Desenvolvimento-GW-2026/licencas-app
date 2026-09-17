import { getRowClass, getStatusBadge, getDaysUntilExpiry } from "@/lib/license-utils";

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

const ROW_COLORS: Record<string, string> = {
  "row-green": "#e8f5e9",
  "row-yellow": "#fff8e1",
  "row-red": "#ffebee",
  "row-expired": "#eeeeee",
  "row-no-date": "#fafafa",
};

function fmt(date: string | null) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("pt-BR");
}

export default function LicenseTable({ licenses }: { licenses: License[] }) {
  if (licenses.length === 0) {
    return <p style={{ color: "#888", textAlign: "center", padding: 40 }}>Nenhuma licença encontrada.</p>;
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "#3D397E", color: "#fff" }}>
            {[
              "Empreendimento", "CNPJ", "Cliente", "Poço",
              "Req. Atual", "Req. Anterior", "Portaria",
              "Validade", "Dias", "Status", "Protocolo",
            ].map((h) => (
              <th key={h} style={{ padding: "10px 12px", textAlign: "left", whiteSpace: "nowrap" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {licenses.map((lic) => {
            const validade = lic.validade ? new Date(lic.validade) : null;
            const cls = getRowClass(validade);
            const bg = ROW_COLORS[cls] ?? "#fff";
            const days = getDaysUntilExpiry(validade);
            const badge = getStatusBadge(lic.status);

            return (
              <tr key={lic.id} style={{ background: bg, borderBottom: "1px solid #e0e0e0" }}>
                <td style={{ padding: "8px 12px" }}>{lic.nome_empreendimento}</td>
                <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>{lic.cnpj ?? "—"}</td>
                <td style={{ padding: "8px 12px" }}>{lic.cliente ?? "—"}</td>
                <td style={{ padding: "8px 12px" }}>{lic.numero_poco ?? "—"}</td>
                <td style={{ padding: "8px 12px" }}>{lic.requerimento_atual ?? "—"}</td>
                <td style={{ padding: "8px 12px" }}>{lic.requerimento_anterior ?? "—"}</td>
                <td style={{ padding: "8px 12px" }}>{lic.portaria ?? "—"}</td>
                <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>{fmt(lic.validade)}</td>
                <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600 }}>
                  {days !== null ? Math.round(days) : "—"}
                </td>
                <td style={{ padding: "8px 12px" }}>
                  <span
                    style={{
                      background: badge.color,
                      color: "#fff",
                      borderRadius: 4,
                      padding: "2px 8px",
                      fontSize: 11,
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {badge.label}
                  </span>
                </td>
                <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>{fmt(lic.data_protocolo)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

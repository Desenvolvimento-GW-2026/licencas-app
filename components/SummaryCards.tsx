import { getDaysUntilExpiry } from "@/lib/license-utils";

interface License {
  validade: string | null;
}

interface Props {
  licenses: License[];
}

export default function SummaryCards({ licenses }: Props) {
  let green = 0, yellow = 0, red = 0, expired = 0, noDate = 0;

  for (const lic of licenses) {
    const validade = lic.validade ? new Date(lic.validade) : null;
    const days = getDaysUntilExpiry(validade);
    if (days === null) { noDate++; continue; }
    if (days < 0) expired++;
    else if (days <= 120) red++;
    else if (days <= 180) yellow++;
    else green++;
  }

  const cards = [
    { label: "Vencidas", count: expired, bg: "#616161", text: "#fff" },
    { label: "Críticas (≤120d)", count: red, bg: "#c62828", text: "#fff" },
    { label: "Atenção (≤180d)", count: yellow, bg: "#f57c00", text: "#fff" },
    { label: "Em dia (>180d)", count: green, bg: "#2e7d32", text: "#fff" },
    { label: "Sem data", count: noDate, bg: "#bdbdbd", text: "#333" },
  ];

  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
      {cards.map((c) => (
        <div
          key={c.label}
          style={{
            background: c.bg,
            color: c.text,
            borderRadius: 8,
            padding: "14px 20px",
            minWidth: 120,
            textAlign: "center",
            flex: "1 1 120px",
          }}
        >
          <div style={{ fontSize: 28, fontWeight: 700 }}>{c.count}</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>{c.label}</div>
        </div>
      ))}
    </div>
  );
}

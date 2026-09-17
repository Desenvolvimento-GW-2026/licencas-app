export function getDaysUntilExpiry(validade: Date | null): number | null {
  if (!validade) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const exp = new Date(validade);
  exp.setHours(0, 0, 0, 0);
  return (exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
}

export function getRowClass(validade: Date | null): string {
  const days = getDaysUntilExpiry(validade);
  if (days === null) return "row-no-date";
  if (days < 0) return "row-expired";
  if (days <= 120) return "row-red";
  if (days <= 180) return "row-yellow";
  return "row-green";
}

interface StatusBadge {
  label: string;
  color: string;
}

const STATUS_MAP: Record<string, StatusBadge> = {
  ativo: { label: "Ativo", color: "#2e7d32" },
  "em análise": { label: "Em Análise", color: "#f57c00" },
  vencido: { label: "Vencido", color: "#555" },
  cancelado: { label: "Cancelado", color: "#c62828" },
  suspenso: { label: "Suspenso", color: "#6a1b9a" },
};

export function getStatusBadge(status: string | null): StatusBadge {
  if (!status) return { label: "—", color: "#999" };
  const key = status.toLowerCase().trim();
  return STATUS_MAP[key] ?? { label: status, color: "#777" };
}

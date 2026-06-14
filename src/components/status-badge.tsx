import { Badge } from "@/components/ui/badge";
import { LOGISTIC_STATUS_LABELS, type LogisticStatus, type SlaStatus } from "@/lib/types";

const logisticVariant: Record<LogisticStatus, Parameters<typeof Badge>[0]["variant"]> = {
  aguardando_separacao: "muted",
  aguardando_faturamento: "muted",
  aguardando_coleta: "info",
  coletado: "info",
  em_transito: "info",
  entregue: "success",
  atrasado: "danger",
  ocorrencia: "danger",
  finalizado: "success",
};

export function LogisticBadge({ status }: { status: LogisticStatus }) {
  return <Badge variant={logisticVariant[status]}>{LOGISTIC_STATUS_LABELS[status]}</Badge>;
}

const slaVariant: Record<SlaStatus, Parameters<typeof Badge>[0]["variant"]> = {
  no_prazo: "success",
  em_risco: "warning",
  atrasado: "danger",
  concluido: "success",
};
const slaLabel: Record<SlaStatus, string> = {
  no_prazo: "No prazo",
  em_risco: "Em risco",
  atrasado: "Atrasado",
  concluido: "Entregue",
};

export function SlaBadge({ status }: { status: SlaStatus }) {
  return <Badge variant={slaVariant[status]}>{slaLabel[status]}</Badge>;
}

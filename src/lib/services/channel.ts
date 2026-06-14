import type { Channel, ChannelDetectionRule } from "@/lib/types";
import { getByPath } from "@/lib/utils/format";

/**
 * Aplica as regras de detecção de canal (ordenadas por prioridade crescente) sobre
 * o payload bruto do pedido. A primeira regra ativa que casar define o canal.
 * Regras configuráveis no banco (channel_detection_rules) — nunca hardcoded.
 */
export function detectChannel(
  payload: unknown,
  rules: ChannelDetectionRule[],
): { channel: Channel; matchedRule: ChannelDetectionRule | null } {
  const ordered = rules
    .filter((r) => r.active)
    .sort((a, b) => a.priority - b.priority);

  for (const rule of ordered) {
    const value = getByPath(payload, rule.json_path);
    if (matches(value, rule)) {
      return { channel: rule.result_channel, matchedRule: rule };
    }
  }
  return { channel: "indefinido", matchedRule: null };
}

function matches(value: unknown, rule: ChannelDetectionRule): boolean {
  if (rule.operator === "exists") return value != null && value !== "";
  if (value == null) return false;
  const str = String(value).toLowerCase();
  const expected = (rule.expected_value ?? "").toLowerCase();

  switch (rule.operator) {
    case "equals":
      return str === expected;
    case "contains":
      return str.includes(expected);
    case "starts_with":
      return str.startsWith(expected);
    case "ends_with":
      return str.endsWith(expected);
    case "regex":
      try {
        return new RegExp(rule.expected_value ?? "", "i").test(String(value));
      } catch {
        return false;
      }
    default:
      return false;
  }
}

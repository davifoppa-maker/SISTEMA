import { loadStore, commitStore } from "@/lib/db";
import { ok, parseBody } from "@/lib/api";
import { channelRuleSchema } from "@/lib/validation/schemas";
import { uuid } from "@/lib/utils/ids";

export async function GET() {
  const store = await loadStore();
  return ok([...store.channel_detection_rules].sort((a, b) => a.priority - b.priority));
}

export async function POST(req: Request) {
  const parsed = await parseBody(req, channelRuleSchema);
  if (!parsed.ok) return parsed.response;
  const store = await loadStore();
  const rule = {
    id: uuid(),
    name: parsed.data.name,
    source: parsed.data.source,
    json_path: parsed.data.json_path,
    operator: parsed.data.operator,
    expected_value: parsed.data.expected_value ?? null,
    result_channel: parsed.data.result_channel,
    priority: parsed.data.priority,
    active: parsed.data.active,
  };
  store.channel_detection_rules.push(rule);
  await commitStore(store);
  return ok(rule, 201);
}

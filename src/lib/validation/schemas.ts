import { z } from "zod";

// Payload de pedido do Tiny (flexível: aceitamos campos extras e guardamos o bruto).
export const tinyOrderSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    numero: z.union([z.string(), z.number()]).optional(),
    numero_ecommerce: z.union([z.string(), z.number()]).optional().nullable(),
    situacao: z.string().optional(),
    valor: z.union([z.string(), z.number()]).optional(),
    ecommerce: z.object({ nome: z.string().optional() }).partial().optional(),
    marcadores: z.array(z.object({ descricao: z.string().optional() }).partial()).optional(),
    cliente: z
      .object({
        nome: z.string().optional(),
        cpf_cnpj: z.string().optional(),
        email: z.string().optional(),
        fone: z.string().optional(),
        endereco: z.string().optional(),
        cidade: z.string().optional(),
        uf: z.string().optional(),
      })
      .partial()
      .optional(),
    vendedor: z.string().optional(),
    lista_preco: z.string().optional(),
    transportadora: z.string().optional().nullable(),
    data: z.string().optional(),
    vencimento: z.string().optional(),
    itens: z
      .array(
        z.object({
          codigo: z.string().optional(),
          descricao: z.string().optional(),
          quantidade: z.union([z.string(), z.number()]).optional(),
          valor_unitario: z.union([z.string(), z.number()]).optional(),
        }),
      )
      .optional(),
  })
  .passthrough();

export type TinyOrderPayload = z.infer<typeof tinyOrderSchema>;

export const tinyInvoiceSchema = z
  .object({
    pedido_numero: z.union([z.string(), z.number()]),
    numero: z.union([z.string(), z.number()]),
    serie: z.union([z.string(), z.number()]).optional(),
    chave_acesso: z.string().optional(),
    valor: z.union([z.string(), z.number()]).optional(),
    data_emissao: z.string().optional(),
    transportadora: z.string().optional(),
    volumes: z.union([z.string(), z.number()]).optional(),
    peso: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();

export type TinyInvoicePayload = z.infer<typeof tinyInvoiceSchema>;

export const channelRuleSchema = z.object({
  name: z.string().min(1),
  source: z.string().default("tiny"),
  json_path: z.string().min(1),
  operator: z.enum(["equals", "contains", "starts_with", "ends_with", "regex", "exists"]),
  expected_value: z.string().nullable().optional(),
  result_channel: z.enum([
    "b2b_mercos",
    "b2c_nuvemshop",
    "mercado_livre",
    "manual",
    "indefinido",
  ]),
  priority: z.coerce.number().int().default(100),
  active: z.boolean().default(true),
});

export const finalizeCheckoutSchema = z
  .object({
    shipment_id: z.string().min(1),
    // Códigos bipados (1 por volume físico). Cada bipe = 1 volume; aceita repetidos.
    scanned_codes: z.array(z.string().min(1)).min(1),
    // Transportadora: por id (cadastrada) OU por nome (vem do pedido / pickup).
    carrier_id: z.string().optional().nullable(),
    carrier_name: z.string().optional().nullable(),
    collector_name: z.string().optional().nullable(),
    collector_document: z.string().optional().nullable(),
    vehicle_plate: z.string().optional().nullable(),
    photo_url: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    user_id: z.string().optional().nullable(),
  })
  .refine((d) => Boolean(d.carrier_id || d.carrier_name), {
    message: "Informe a transportadora (id ou nome).",
  });

export const scanSchema = z.object({
  shipment_id: z.string().min(1),
  code: z.string().min(1),
});

export const sendMessageSchema = z.object({
  customer_id: z.string().optional().nullable(),
  order_id: z.string().optional().nullable(),
  phone: z.string().min(1),
  content: z.string().min(1),
  template_id: z.string().optional().nullable(),
  trigger_key: z.string().optional().nullable(),
});

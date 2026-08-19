import { getTranslovatoConfig, isTranslovatoConfigured, quoteTranslovato, geraChaveAcesso } from "@/lib/services/freight/translovato";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Diagnóstico da Translovato (roda em PRODUÇÃO, que alcança o WS; o ambiente de
// dev bloqueia o domínio). Mostra config atual e testa uma cotação de exemplo.
//   GET /api/debug/translovato?k=exxdebug
//   opcional: &cep=89202000&valor=500&peso=5
export async function GET(req: Request) {
  const u = new URL(req.url);
  if (u.searchParams.get("k") !== "exxdebug") {
    return Response.json({ ok: false, error: "não autorizado" }, { status: 403 });
  }
  const c = getTranslovatoConfig();
  // Nunca expõe a senha; só indica se está preenchida.
  const configVisivel = {
    cnpj: c.cnpj || "(vazio)",
    usuario: c.usuario || "(vazio)",
    senha: c.senha ? "(preenchida)" : "(vazio)",
    cdEmpresa: c.cdEmpresa,
    cdNatureza: c.cdNatureza,
    cepOrigem: c.cepOrigem,
    cnpjRemetente: c.cnpjRemetente,
    wsUrl: c.wsUrl,
    configurada: isTranslovatoConfigured(),
  };

  const cep = u.searchParams.get("cep") || "89202000"; // Joinville (exemplo)
  const valor = Number(u.searchParams.get("valor") || 500);
  const peso = Number(u.searchParams.get("peso") || 5);

  // Testa SÓ o login (geração da chave) — só precisa de CNPJ/usuário/senha, então
  // valida as credenciais mesmo sem CdEmpresa/CdNatureza.
  const loginTeste = await geraChaveAcesso();

  // Cotação completa só roda se estiver 100% configurada (precisa do CdEmpresa).
  const cotacaoTeste = isTranslovatoConfigured()
    ? await quoteTranslovato({
        cnpjDestinatario: "",
        cepDestino: cep,
        vlrMercadoria: valor,
        peso,
        volumes: 1,
        cubagem: [{ altura: 0.3, largura: 0.3, comprimento: 0.3, volumes: 1 }],
      })
    : { ok: false, error: "Faltam TRANSLOVATO_CD_EMPRESA / _CD_NATUREZA (peça ao comercial). Login testado acima." };

  // SONDA DE CdEmpresa (&emp=1): o "código da empresa que atende" é um inteiro
  // pequeno (ex.: 24 no exemplo da doc). Geramos a chave uma vez (vale 5 min) e
  // testamos 1..60 com CdNatureza=0 — o <Erro> do SOAP diz se a empresa é
  // inválida ou se o problema passou a ser outro (ou até retorna o <Frete>!).
  let sondaEmpresa: Record<string, unknown> | null = null;
  if (u.searchParams.get("emp") === "1") {
    const { getTranslovatoConfig: cfg } = await import("@/lib/services/freight/translovato");
    const conf = cfg();
    const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const chaveR = await geraChaveAcesso();
    if (!chaveR.ok) {
      sondaEmpresa = { erro: `Sem chave de acesso: ${chaveR.error}` };
    } else {
      const xmlEsc = (v: string | number) => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const natureza = Number(u.searchParams.get("natureza") || 0);
      const de = Number(u.searchParams.get("de") || 1);
      const ate = Number(u.searchParams.get("ate") || 40);
      const resultados: Record<string, string> = {};
      let aceito: string | null = null;
      for (let emp = de; emp <= ate; emp++) {
        const envelope =
          `<soapenv:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:uWSSimulacaoFreteIntf-IWSSimulacaoFrete">` +
          `<soapenv:Header/><soapenv:Body>` +
          `<urn:SimulacaoFrete soapenv:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">` +
          `<CNPJ xsi:type="xsd:string">${xmlEsc(conf.cnpj)}</CNPJ>` +
          `<Usuario xsi:type="xsd:string">${xmlEsc(conf.usuario)}</Usuario>` +
          `<ChaveAcesso xsi:type="xsd:string">${xmlEsc(chaveR.chave)}</ChaveAcesso>` +
          `<CdEmpresa xsi:type="xsd:int">${emp}</CdEmpresa>` +
          `<CdRemetente xsi:type="xsd:string">${xmlEsc(conf.cnpjRemetente)}</CdRemetente>` +
          `<CdDestinatario xsi:type="xsd:string"></CdDestinatario>` +
          `<NrCepColeta xsi:type="xsd:int">${Number(conf.cepOrigem)}</NrCepColeta>` +
          `<NrCepCalcAte xsi:type="xsd:int">${Number(cep)}</NrCepCalcAte>` +
          `<InTipoFrete xsi:type="xsd:int">1</InTipoFrete>` +
          `<InICMS xsi:type="xsd:int">0</InICMS>` +
          `<CdNatureza xsi:type="xsd:int">${natureza}</CdNatureza>` +
          `<CdTransporte xsi:type="xsd:int">1</CdTransporte>` +
          `<CdTipoVeiculo xsi:type="xsd:int">0</CdTipoVeiculo>` +
          `<VlMercadoria xsi:type="xsd:double">${valor}</VlMercadoria>` +
          `<QtPeso xsi:type="xsd:double">${peso}</QtPeso>` +
          `<QtVolumes xsi:type="xsd:double">1</QtVolumes>` +
          `<QtMetrosCubicos xsi:type="xsd:double">0.027</QtMetrosCubicos>` +
          `<QtPares xsi:type="xsd:double">0</QtPares>` +
          `</urn:SimulacaoFrete></soapenv:Body></soapenv:Envelope>`;
        try {
          const r = await fetch(conf.wsUrl, {
            method: "POST",
            headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "urn:uWSSimulacaoFreteIntf-IWSSimulacaoFrete#SimulacaoFrete" },
            body: envelope,
          });
          const xml = await r.text();
          const frete = (xml.match(/<Frete[^>]*xsd:double[^>]*>([^<]+)<\/Frete>/i) ?? [])[1];
          const erroDesc = (xml.match(/<Descricao[^>]*>([^<]+)<\/Descricao>/i) ?? [])[1];
          if (frete && Number(frete) > 0) {
            resultados[String(emp)] = `FRETE R$ ${frete}`;
            aceito = String(emp);
            break;
          }
          resultados[String(emp)] = erroDesc ? `erro: ${erroDesc.slice(0, 120)}` : `${r.status}: ${xml.slice(0, 100)}`;
        } catch (e) {
          resultados[String(emp)] = e instanceof Error ? e.message : "erro";
        }
        await pausa(300);
      }
      sondaEmpresa = { cdEmpresaAceito: aceito, naturezaUsada: natureza, resultados };
    }
  }

  // SONDA DE VARIANTES (&var=1): a chave vem da geraChaveAcessoJSON — pode ser
  // que só funcione com a operação JSON de cotação. Testa 3 variantes:
  //   V1 SimulacaoFrete + chave extraída (atual)
  //   V2 SimulacaoFreteJSON2 + chave extraída (variante JSON do WSDL)
  //   V3 SimulacaoFrete + o <return> COMPLETO como ChaveAcesso (JSON inteiro)
  let sondaVariantes: Record<string, unknown> | null = null;
  if (u.searchParams.get("var") === "1") {
    const { getTranslovatoConfig: cfg2 } = await import("@/lib/services/freight/translovato");
    const conf = cfg2();
    const xmlEsc = (v: string | number) => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const ns = "urn:uWSSimulacaoFreteIntf-IWSSimulacaoFrete";

    // Gera a chave e guarda TAMBÉM o <return> bruto (para a V3).
    const senhaB64 = Buffer.from(conf.senha, "utf-8").toString("base64");
    const envChave =
      `<soapenv:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="${ns}">` +
      `<soapenv:Header/><soapenv:Body><urn:geraChaveAcessoJSON soapenv:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">` +
      `<CNPJ xsi:type="xsd:string">${xmlEsc(conf.cnpj)}</CNPJ>` +
      `<Usuario xsi:type="xsd:string">${xmlEsc(conf.usuario)}</Usuario>` +
      `<Senha xsi:type="xsd:string">${xmlEsc(senhaB64)}</Senha>` +
      `</urn:geraChaveAcessoJSON></soapenv:Body></soapenv:Envelope>`;
    const rc = await fetch(conf.wsUrl, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: `${ns}#geraChaveAcessoJSON` },
      body: envChave,
    });
    const xmlChave = await rc.text();
    const retorno = (xmlChave.match(/<return[^>]*>([\s\S]*?)<\/return>/i) ?? [])[1]?.trim() ?? "";
    const retornoLimpo = retorno.replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    const chaveExtraida = (retornoLimpo.match(/"chave"\s*:\s*"([^"]+)"/i) ?? [])[1] ?? "";

    const corpoParams = (chave: string, extraCubado: boolean) =>
      `<CNPJ xsi:type="xsd:string">${xmlEsc(conf.cnpj)}</CNPJ>` +
      `<Usuario xsi:type="xsd:string">${xmlEsc(conf.usuario)}</Usuario>` +
      `<ChaveAcesso xsi:type="xsd:string">${xmlEsc(chave)}</ChaveAcesso>` +
      `<CdEmpresa xsi:type="xsd:int">${conf.cdEmpresa}</CdEmpresa>` +
      `<CdRemetente xsi:type="xsd:string">${xmlEsc(conf.cnpjRemetente)}</CdRemetente>` +
      `<CdDestinatario xsi:type="xsd:string"></CdDestinatario>` +
      (extraCubado ? `<CdConsignatario xsi:type="xsd:string"></CdConsignatario>` : "") +
      `<NrCepColeta xsi:type="xsd:int">${Number(conf.cepOrigem)}</NrCepColeta>` +
      `<NrCepCalcAte xsi:type="xsd:int">${Number(cep)}</NrCepCalcAte>` +
      `<InTipoFrete xsi:type="xsd:int">1</InTipoFrete>` +
      `<InICMS xsi:type="xsd:int">0</InICMS>` +
      `<CdNatureza xsi:type="xsd:int">${conf.cdNatureza}</CdNatureza>` +
      `<CdTransporte xsi:type="xsd:int">1</CdTransporte>` +
      `<CdTipoVeiculo xsi:type="xsd:int">0</CdTipoVeiculo>` +
      `<VlMercadoria xsi:type="xsd:double">${valor}</VlMercadoria>` +
      `<QtPeso xsi:type="xsd:double">${peso}</QtPeso>` +
      (extraCubado ? `<QtPesoCubado xsi:type="xsd:double">${peso}</QtPesoCubado>` : "") +
      `<QtVolumes xsi:type="xsd:double">1</QtVolumes>` +
      `<QtMetrosCubicos xsi:type="xsd:double">0.027</QtMetrosCubicos>` +
      `<QtPares xsi:type="xsd:double">0</QtPares>`;

    const chama = async (op: string, chave: string, extraCubado: boolean): Promise<string> => {
      const env =
        `<soapenv:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="${ns}">` +
        `<soapenv:Header/><soapenv:Body><urn:${op} soapenv:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">` +
        corpoParams(chave, extraCubado) +
        `</urn:${op}></soapenv:Body></soapenv:Envelope>`;
      try {
        const r = await fetch(conf.wsUrl, {
          method: "POST",
          headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: `${ns}#${op}` },
          body: env,
        });
        const xml = await r.text();
        const frete = (xml.match(/<Frete[^>]*xsd:double[^>]*>([^<]+)<\/Frete>/i) ?? [])[1];
        if (frete && Number(frete) > 0) return `FRETE R$ ${frete}`;
        const desc = (xml.match(/<Descricao[^>]*>([^<]+)<\/Descricao>/i) ?? [])[1];
        if (desc) return `erro: ${desc.slice(0, 150)}`;
        // Retorno JSON (SimulacaoFreteJSON2): pega o <return> cru.
        const ret = (xml.match(/<return[^>]*>([\s\S]*?)<\/return>/i) ?? [])[1];
        if (ret) return `return: ${ret.replace(/&quot;/g, '"').slice(0, 300)}`;
        return `${r.status}: ${xml.slice(0, 200)}`;
      } catch (e) {
        return e instanceof Error ? e.message : "erro";
      }
    };

    sondaVariantes = {
      chaveExtraida: chaveExtraida.slice(0, 30) + "…",
      v1_SimulacaoFrete_chave: await chama("SimulacaoFrete", chaveExtraida, false),
      v2_SimulacaoFreteJSON2_chave: await chama("SimulacaoFreteJSON2", chaveExtraida, true),
      v3_SimulacaoFrete_returnCompleto: await chama("SimulacaoFrete", retornoLimpo, false),
    };
  }

  return Response.json({ versao: "v4-variantes", ok: true, config: configVisivel, loginTeste, cotacaoTeste, sondaEmpresa, sondaVariantes });
}

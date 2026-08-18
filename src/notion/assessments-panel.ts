import { CAMPUS_ASSESSMENT_PREFIX, type Assessment } from "../domain/assessment.js";
import { notionSelectValue } from "./select-value.js";

const NOTION_API_VERSION = "2026-03-11";
type JsonObject = Record<string, unknown>;

export type TravelPeriod = { start: string; end: string };

export type UpsertAssessmentsOptions = {
  token: string;
  dataSourceId: string;
  entries: Assessment[];
  travel: TravelPeriod;
  /**
   * Arquiva as linhas do Campus que nao vieram nesta rodada -- atividade
   * apagada ou escondida no Moodle. Linhas do plano de ensino nunca sao
   * tocadas: elas nao tem como ser reconferidas automaticamente.
   */
  pruneCampusEntries?: boolean;
  fetcher?: typeof fetch;
};

export type UpsertAssessmentsResult = {
  created: number;
  updated: number;
  archived: number;
};

function objectValue(value: unknown): JsonObject | undefined {
  return typeof value === "object" && value !== null ? (value as JsonObject) : undefined;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function richTextValue(property: unknown): string | undefined {
  const text = arrayValue(objectValue(property)?.rich_text)
    .map((item) => objectValue(item)?.plain_text)
    .filter((item): item is string => typeof item === "string")
    .join("");
  return text || undefined;
}

function overlapsTravel(entry: Assessment, travel: TravelPeriod): boolean {
  if (!entry.start) return false;
  return entry.start <= travel.end && (entry.end ?? entry.start) >= travel.start;
}

export function assessmentProperties(entry: Assessment, travel: TravelPeriod): JsonObject {
  const duringTravel = overlapsTravel(entry, travel);
  return {
    Evento: { title: [{ text: { content: entry.title } }] },
    Disciplina: { select: { name: notionSelectValue(entry.courseName) } },
    Data: entry.start
      ? { date: { start: entry.start, ...(entry.end ? { end: entry.end } : {}) } }
      : { date: null },
    Tipo: { select: { name: entry.type } },
    Peso: entry.weight === undefined ? { number: null } : { number: entry.weight },
    Conteúdo: { rich_text: entry.content ? [{ text: { content: entry.content } }] : [] },
    Observações: { rich_text: entry.notes ? [{ text: { content: entry.notes } }] : [] },
    Viagem: { select: { name: duringTravel ? "✈️ Durante a viagem" : "Sem conflito" } },
    Link: { url: entry.link ?? null },
    Fonte: { select: { name: entry.source } },
    "ID externo": { rich_text: [{ text: { content: entry.id } }] },
  };
}

/**
 * Grava as avaliacoes na base, casando pelo "ID externo". Os ids do Campus
 * comecam com `campus:` e os do plano de ensino nao, entao as duas fontes
 * convivem na mesma base sem uma sobrescrever a outra.
 */
export async function upsertAssessments(
  options: UpsertAssessmentsOptions,
): Promise<UpsertAssessmentsResult> {
  const fetcher = options.fetcher ?? fetch;
  const request = async (path: string, init: RequestInit = {}): Promise<JsonObject> => {
    const response = await fetcher(`https://api.notion.com/v1${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${options.token}`,
        "content-type": "application/json",
        "notion-version": NOTION_API_VERSION,
        ...init.headers,
      },
    });
    if (!response.ok) {
      const details = (await response.text()).slice(0, 800);
      throw new Error(`Falha ao gravar as avaliacoes (HTTP ${response.status}): ${details}`);
    }
    return (await response.json()) as JsonObject;
  };

  const existing = new Map<string, string>();
  let cursor: string | undefined;
  do {
    const pages = await request(`/data_sources/${options.dataSourceId}/query`, {
      method: "POST",
      body: JSON.stringify({ ...(cursor ? { start_cursor: cursor } : {}) }),
    });
    for (const value of arrayValue(pages.results)) {
      const page = objectValue(value);
      const id = richTextValue(objectValue(page?.properties)?.["ID externo"]);
      if (id && typeof page?.id === "string") existing.set(id, page.id);
    }
    cursor = typeof pages.next_cursor === "string" ? pages.next_cursor : undefined;
  } while (cursor);

  const result: UpsertAssessmentsResult = { created: 0, updated: 0, archived: 0 };
  for (const entry of options.entries) {
    const properties = assessmentProperties(entry, options.travel);
    const pageId = existing.get(entry.id);
    if (pageId) {
      await request(`/pages/${pageId}`, { method: "PATCH", body: JSON.stringify({ properties }) });
      result.updated += 1;
    } else {
      await request("/pages", {
        method: "POST",
        body: JSON.stringify({
          parent: { type: "data_source_id", data_source_id: options.dataSourceId },
          properties,
        }),
      });
      result.created += 1;
    }
  }

  if (options.pruneCampusEntries) {
    const incoming = new Set(options.entries.map((entry) => entry.id));
    for (const [id, pageId] of existing) {
      if (!id.startsWith(CAMPUS_ASSESSMENT_PREFIX) || incoming.has(id)) continue;
      // `archived` foi recusado pela API 2026-03-11; a versao atual manda a
      // pagina para a lixeira com `in_trash`.
      await request(`/pages/${pageId}`, {
        method: "PATCH",
        body: JSON.stringify({ in_trash: true }),
      });
      result.archived += 1;
    }
  }

  return result;
}

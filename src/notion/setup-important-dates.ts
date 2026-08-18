import type { Assessment } from "../domain/assessment.js";
import type { ImportantDate } from "../plans/semester-2026-2.js";
import { upsertAssessments, type TravelPeriod } from "./assessments-panel.js";
import { saveEnvAssessmentsDataSourceId } from "./setup-notion.js";

const NOTION_API_VERSION = "2026-03-11";
const DATABASE_TITLE = "Provas e Trabalhos";
type JsonObject = Record<string, unknown>;

type Options = {
  token: string;
  parentPageId: string;
  /** Provas e trabalhos transcritos do plano de ensino do SIG. */
  dates: ImportantDate[];
  /** Entregas avaliativas lidas do Campus Virtual, ja classificadas. */
  campusAssessments?: Assessment[];
  travel: TravelPeriod;
  fetcher?: typeof fetch;
  saveDataSourceId?: (dataSourceId: string) => Promise<void>;
};

export type ImportantDatesResult = {
  databaseId: string;
  dataSourceId: string;
  created: boolean;
  entriesCreated: number;
  entriesUpdated: number;
  entriesArchived: number;
};

function objectValue(value: unknown): JsonObject | undefined {
  return typeof value === "object" && value !== null ? (value as JsonObject) : undefined;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export async function setupImportantDatesPanel(options: Options): Promise<ImportantDatesResult> {
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
      throw new Error(`Falha ao configurar o painel de provas e trabalhos (HTTP ${response.status}): ${details}`);
    }
    return (await response.json()) as JsonObject;
  };

  let databaseId: string | undefined;
  let cursor: string | undefined;
  do {
    const children = await request(
      `/blocks/${options.parentPageId}/children?page_size=100${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ""}`,
    );
    for (const value of arrayValue(children.results)) {
      const block = objectValue(value);
      if (objectValue(block?.child_database)?.title === DATABASE_TITLE && typeof block?.id === "string") {
        databaseId = block.id;
        break;
      }
    }
    cursor = typeof children.next_cursor === "string" ? children.next_cursor : undefined;
  } while (!databaseId && cursor);

  let created = false;
  if (!databaseId) {
    const database = await request("/databases", {
      method: "POST",
      body: JSON.stringify({
        parent: { type: "page_id", page_id: options.parentPageId },
        title: [{ type: "text", text: { content: DATABASE_TITLE } }],
        description: [{ type: "text", text: { content: "Provas, trabalhos e atividades avaliativas. As entregas online vêm do Campus Virtual a cada sincronização; as provas presenciais vêm do plano de ensino." } }],
        icon: { type: "emoji", emoji: "🗓️" },
        is_inline: true,
        initial_data_source: {
          title: [{ type: "text", text: { content: "Avaliações 2026/2" } }],
          properties: {
            Evento: { title: {} },
            Disciplina: { select: { options: [
              { name: "Inteligência Artificial", color: "purple" },
              { name: "Metodologia de Pesquisa", color: "blue" },
              { name: "Sistemas Gerenciadores de Banco de Dados", color: "orange" },
            ] } },
            Data: { date: {} },
            Tipo: { select: { options: [
              { name: "Prova", color: "red" },
              { name: "Trabalho", color: "purple" },
              { name: "Atividade", color: "blue" },
              { name: "Recuperação", color: "orange" },
            ] } },
            Peso: { number: { format: "number" } },
            Conteúdo: { rich_text: {} },
            Observações: { rich_text: {} },
            Viagem: { select: { options: [
              { name: "✈️ Durante a viagem", color: "red" },
              { name: "Sem conflito", color: "green" },
            ] } },
            Link: { url: {} },
            Fonte: { select: { options: [
              { name: "Campus Virtual", color: "blue" },
              { name: "Plano de ensino", color: "gray" },
            ] } },
            "ID externo": { rich_text: {} },
          },
        },
      }),
    });
    if (typeof database.id !== "string") throw new Error("O Notion não retornou o ID do painel de datas.");
    databaseId = database.id;
    created = true;
  }

  const database = await request(`/databases/${databaseId}`);
  const source = objectValue(arrayValue(database.data_sources)[0]);
  if (typeof source?.id !== "string") throw new Error("O Notion não retornou a fonte de dados do painel de datas.");
  const dataSourceId = source.id;

  // Gravado sempre, e nao so na criacao: e assim que o `npm run sync` acha o
  // painel para atualizar as entregas do Campus a cada meia hora.
  await (options.saveDataSourceId ?? saveEnvAssessmentsDataSourceId)(dataSourceId);

  const entries: Assessment[] = [
    ...options.dates.map((date) => ({ ...date, source: "Plano de ensino" as const })),
    ...(options.campusAssessments ?? []),
  ];
  const upsert = await upsertAssessments({
    token: options.token,
    dataSourceId,
    entries,
    travel: options.travel,
    pruneCampusEntries: options.campusAssessments !== undefined,
    fetcher: options.fetcher,
  });

  const details = await request(`/data_sources/${dataSourceId}`);
  const properties = objectValue(details.properties);
  const propertyId = (name: string): string | undefined => {
    const id = objectValue(properties?.[name])?.id;
    return typeof id === "string" ? decodeURIComponent(id) : undefined;
  };
  const views = await request(`/views?database_id=${encodeURIComponent(databaseId)}`);
  const existingViews: JsonObject[] = [];
  const names = new Set<string>();
  for (const value of arrayValue(views.results)) {
    let view = objectValue(value);
    if (typeof view?.name !== "string" && typeof view?.id === "string") view = await request(`/views/${view.id}`);
    if (view) existingViews.push(view);
    if (typeof view?.name === "string") names.add(view.name);
  }
  const table = existingViews.find((view) => view.type === "table");
  if (typeof table?.id === "string") {
    const columns: Array<[string, number]> = [
      ["Data", 190], ["Disciplina", 260], ["Evento", 320], ["Tipo", 120], ["Peso", 90],
      ["Fonte", 140], ["Link", 120], ["Conteúdo", 300], ["Observações", 320],
    ];
    await request(`/views/${table.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        configuration: {
          type: "table",
          properties: [
            ...columns.flatMap(([name, width]) => {
              const id = propertyId(name);
              return id ? [{ property_id: id, visible: true, width }] : [];
            }),
            ...["Viagem", "ID externo"].flatMap((name) => {
              const id = propertyId(name);
              return id ? [{ property_id: id, visible: false }] : [];
            }),
          ],
          frozen_column_index: 0,
        },
        sorts: [{ property: "Data", direction: "ascending" }],
      }),
    });
  }
  const dateId = propertyId("Data");
  if (dateId && !names.has("Calendário de avaliações")) {
    await request("/views", {
      method: "POST",
      body: JSON.stringify({
        database_id: databaseId,
        data_source_id: dataSourceId,
        name: "Calendário de avaliações",
        type: "calendar",
        configuration: { type: "calendar", date_property_id: dateId },
        sorts: [{ property: "Data", direction: "ascending" }],
      }),
    });
  }

  return {
    databaseId,
    dataSourceId,
    created,
    entriesCreated: upsert.created,
    entriesUpdated: upsert.updated,
    entriesArchived: upsert.archived,
  };
}

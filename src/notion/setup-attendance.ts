const NOTION_API_VERSION = "2026-03-11";
const DATABASE_TITLE = "Controle de Faltas";

/**
 * Cada dia de aula perdido custa duas faltas: os encontros da UFLA tem duas
 * horas-aula, e a chamada e por hora-aula.
 */
const LESSONS_PER_DAY = 2;

/**
 * Limite de 25% da carga horaria, que da quatro faltas por credito. Como o
 * credito equivale a uma hora-aula semanal, uma disciplina de 2 creditos
 * tolera 8 faltas (4 dias), uma de 4 creditos tolera 16 (8 dias) e uma de 6
 * creditos tolera 24 (12 dias). Por isso o limite nao pode ser uma constante
 * unica: ele so existe em funcao dos creditos de cada disciplina.
 */
const ABSENCES_PER_CREDIT = 4;

/** Fracao do limite a partir da qual a disciplina entra em alerta laranja. */
const WARNING_RATIO = 0.75;

type JsonObject = Record<string, unknown>;

export type AttendanceCourse = { code: string; name: string; credits?: number };

type SetupAttendanceOptions = {
  token: string;
  parentPageId: string;
  courses: AttendanceCourse[];
  fetcher?: typeof fetch;
};

export type SetupAttendanceResult = {
  databaseId: string;
  dataSourceId: string;
  created: boolean;
  coursesCreated: number;
  /** Linhas que ja existiam e tiveram os creditos corrigidos. */
  creditsUpdated: number;
};

function objectValue(value: unknown): JsonObject | undefined {
  return typeof value === "object" && value !== null ? (value as JsonObject) : undefined;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function titleValue(property: unknown): string | undefined {
  const value = arrayValue(objectValue(property)?.title)
    .map((item) => objectValue(item)?.plain_text)
    .filter((item): item is string => typeof item === "string")
    .join("");
  return value || undefined;
}

function numberValue(property: unknown): number | undefined {
  const value = objectValue(property)?.number;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function attendanceProperties(): JsonObject {
  return {
    Disciplina: { title: {} },
    "Créditos": { number: { format: "number" } },
    "Dias faltados": { number: { format: "number" } },
    Faltas: {
      formula: {
        expression: `if(empty(prop("Dias faltados")), 0, prop("Dias faltados") * ${LESSONS_PER_DAY})`,
      },
    },
    Limite: {
      formula: {
        expression: `if(empty(prop("Créditos")), 0, prop("Créditos") * ${ABSENCES_PER_CREDIT})`,
      },
    },
    Restantes: { formula: { expression: 'prop("Limite") - prop("Faltas")' } },
    Status: {
      formula: {
        expression:
          'if(empty(prop("Créditos")), "⚪ Informe os créditos", ' +
          'if(prop("Faltas") >= prop("Limite"), "🔴 Limite atingido", ' +
          `if(prop("Faltas") >= prop("Limite") * ${WARNING_RATIO}, "🟠 Atenção", "🟢 Dentro do limite")))`,
      },
    },
    "Ausências planejadas": { rich_text: {} },
    Codigo: { rich_text: {} },
  };
}

export async function setupAttendancePanel(
  options: SetupAttendanceOptions,
): Promise<SetupAttendanceResult> {
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
      throw new Error(`Falha ao configurar controle de faltas (HTTP ${response.status}): ${details}`);
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
      if (
        objectValue(block?.child_database)?.title === DATABASE_TITLE &&
        typeof block?.id === "string"
      ) {
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
        description: [
          {
            type: "text",
            text: {
              content:
                `Informe os créditos e anote quantos dias de aula você perdeu. Cada dia conta ${LESSONS_PER_DAY} faltas, e o limite é de ${ABSENCES_PER_CREDIT} faltas por crédito.`,
            },
          },
        ],
        icon: { type: "emoji", emoji: "📅" },
        is_inline: true,
        initial_data_source: {
          title: [{ type: "text", text: { content: "Faltas por disciplina" } }],
          properties: attendanceProperties(),
        },
      }),
    });
    if (typeof database.id !== "string") {
      throw new Error("O Notion nao retornou o ID do controle de faltas.");
    }
    databaseId = database.id;
    created = true;
  }

  const database = await request(`/databases/${databaseId}`);
  const source = objectValue(arrayValue(database.data_sources)[0]);
  if (typeof source?.id !== "string") {
    throw new Error("O Notion nao retornou a fonte de dados do controle de faltas.");
  }
  const dataSourceId = source.id;

  const sourceDetails = await request(`/data_sources/${dataSourceId}`);
  if (!objectValue(sourceDetails.properties)?.["Ausências planejadas"]) {
    await request(`/data_sources/${dataSourceId}`, {
      method: "PATCH",
      body: JSON.stringify({ properties: { "Ausências planejadas": { rich_text: {} } } }),
    });
  }

  const existingCourses = new Map<string, { id: string; credits?: number }>();
  cursor = undefined;
  do {
    const pages = await request(`/data_sources/${dataSourceId}/query`, {
      method: "POST",
      body: JSON.stringify({ ...(cursor ? { start_cursor: cursor } : {}) }),
    });
    for (const value of arrayValue(pages.results)) {
      const page = objectValue(value);
      const properties = objectValue(page?.properties);
      const name = titleValue(properties?.Disciplina);
      if (name && typeof page?.id === "string") {
        existingCourses.set(name, { id: page.id, credits: numberValue(properties?.["Créditos"]) });
      }
    }
    cursor = typeof pages.next_cursor === "string" ? pages.next_cursor : undefined;
  } while (cursor);

  let coursesCreated = 0;
  let creditsUpdated = 0;
  for (const course of options.courses) {
    const existing = existingCourses.get(course.name);
    if (existing) {
      // Os creditos sao a unica coluna que o setup mantem: os dias faltados
      // sao do aluno e nunca se sobrepoem.
      if (course.credits !== undefined && course.credits !== existing.credits) {
        await request(`/pages/${existing.id}`, {
          method: "PATCH",
          body: JSON.stringify({ properties: { "Créditos": { number: course.credits } } }),
        });
        creditsUpdated += 1;
      }
      continue;
    }
    await request("/pages", {
      method: "POST",
      body: JSON.stringify({
        parent: { type: "data_source_id", data_source_id: dataSourceId },
        properties: {
          Disciplina: { title: [{ text: { content: course.name } }] },
          Codigo: { rich_text: [{ text: { content: course.code } }] },
          ...(course.credits === undefined ? {} : { "Créditos": { number: course.credits } }),
          "Dias faltados": { number: 0 },
        },
      }),
    });
    coursesCreated += 1;
  }

  const views = await request(`/views?database_id=${encodeURIComponent(databaseId)}`);
  let table = arrayValue(views.results).map(objectValue).find((view) => view?.type === "table");
  if (!table) {
    const listed = arrayValue(views.results).map(objectValue).find((view) => typeof view?.id === "string");
    if (typeof listed?.id === "string") table = await request(`/views/${listed.id}`);
  }
  if (typeof table?.id === "string") {
    const currentSourceDetails = await request(`/data_sources/${dataSourceId}`);
    const properties = objectValue(currentSourceDetails.properties);
    const propertyId = (name: string): string | undefined => {
      const id = objectValue(properties?.[name])?.id;
      return typeof id === "string" ? decodeURIComponent(id) : undefined;
    };
    // As larguras acomodam o cabecalho, que e o piso real: "Dias faltados" e
    // "Ausências planejadas" nao cabem em coluna estreita nem com a celula
    // vazia. O conteudo em si quebra em varias linhas por causa de wrap_cells.
    const columns: Array<[string, number]> = [
      ["Disciplina", 320],
      ["Créditos", 120],
      ["Dias faltados", 140],
      ["Faltas", 100],
      ["Limite", 100],
      ["Restantes", 120],
      ["Status", 190],
      ["Ausências planejadas", 260],
    ];
    const codeId = propertyId("Codigo");
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
            ...(codeId ? [{ property_id: codeId, visible: false }] : []),
          ],
          // Nome de disciplina nao cabe em uma linha; sem isto o Notion corta.
          wrap_cells: true,
          frozen_column_index: 0,
        },
        sorts: [{ property: "Disciplina", direction: "ascending" }],
      }),
    });
  }

  return { databaseId, dataSourceId, created, coursesCreated, creditsUpdated };
}

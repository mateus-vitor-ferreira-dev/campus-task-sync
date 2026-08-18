import assert from "node:assert/strict";
import test from "node:test";

import { setupAttendancePanel } from "../src/notion/setup-attendance.js";

type CapturedRequest = {
  url: string;
  method: string;
  body?: Record<string, unknown>;
};

test("cria painel com limite derivado dos creditos e uma linha por disciplina", async () => {
  const requests: CapturedRequest[] = [];
  const fetcher: typeof fetch = async (input, init = {}) => {
    const url = String(input);
    const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    requests.push({ url, method: init.method ?? "GET", body });
    if (url.includes("/blocks/page-1/children")) return Response.json({ results: [] });
    if (url.endsWith("/databases") && init.method === "POST") {
      return Response.json({ id: "attendance-database" });
    }
    if (url.endsWith("/databases/attendance-database")) {
      return Response.json({ data_sources: [{ id: "attendance-source" }] });
    }
    if (url.endsWith("/data_sources/attendance-source/query")) {
      return Response.json({ results: [], next_cursor: null });
    }
    if (url.includes("/views?database_id=")) {
      return Response.json({ results: [{ id: "table-view" }] });
    }
    if (url.endsWith("/views/table-view") && init.method !== "PATCH") {
      return Response.json({ id: "table-view", type: "table" });
    }
    if (url.endsWith("/data_sources/attendance-source")) {
      return Response.json({
        properties: Object.fromEntries(
          [
            "Disciplina",
            "Créditos",
            "Dias faltados",
            "Faltas",
            "Limite",
            "Restantes",
            "Status",
            "Ausências planejadas",
            "Codigo",
          ].map((name, index) => [name, { id: `property-${index}` }]),
        ),
      });
    }
    return Response.json({ id: "ok" });
  };

  const result = await setupAttendancePanel({
    token: "token",
    parentPageId: "page-1",
    courses: [
      { code: "GCC128", name: "Inteligência Artificial", credits: 4 },
      { code: "GCC220", name: "Metodologia de Pesquisa" },
    ],
    fetcher,
  });

  assert.deepEqual(result, {
    databaseId: "attendance-database",
    dataSourceId: "attendance-source",
    created: true,
    coursesCreated: 2,
    creditsUpdated: 0,
  });
  const databaseRequest = requests.find(
    (request) => request.url.endsWith("/databases") && request.method === "POST",
  );
  const source = databaseRequest?.body?.initial_data_source as Record<string, unknown>;
  const properties = source.properties as Record<string, unknown>;
  assert.deepEqual(properties["Créditos"], { number: { format: "number" } });
  assert.deepEqual(properties["Dias faltados"], { number: { format: "number" } });
  // Um dia de aula custa duas faltas, e o limite e de quatro faltas por credito.
  const expression = (property: unknown): string =>
    ((property as { formula: { expression: string } }).formula.expression);
  assert.match(expression(properties.Faltas), /prop\("Dias faltados"\) \* 2/);
  assert.match(expression(properties.Limite), /prop\("Créditos"\) \* 4/);
  assert.equal(properties["Falta 1"], undefined);

  const pageCreations = requests.filter(
    (request) => request.url.endsWith("/pages") && request.method === "POST",
  );
  assert.equal(pageCreations.length, 2);
  const withCredits = pageCreations[0]?.body?.properties as Record<string, unknown>;
  assert.deepEqual(withCredits["Créditos"], { number: 4 });
  assert.deepEqual(withCredits["Dias faltados"], { number: 0 });
  // Sem creditos conhecidos a coluna nasce vazia, para ser preenchida no Notion.
  const withoutCredits = pageCreations[1]?.body?.properties as Record<string, unknown>;
  assert.equal(withoutCredits["Créditos"], undefined);

  // Nome de disciplina nao cabe numa linha: a tabela precisa quebrar a celula.
  const viewPatch = requests.find(
    (request) => request.url.endsWith("/views/table-view") && request.method === "PATCH",
  );
  const configuration = viewPatch?.body?.configuration as Record<string, unknown>;
  assert.equal(configuration.wrap_cells, true);
});

test("grava os creditos numa disciplina que ja existe sem tocar nos dias faltados", async () => {
  const patches: Array<Record<string, unknown>> = [];
  const fetcher: typeof fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.includes("/blocks/page-1/children")) {
      return Response.json({
        results: [{ id: "attendance-database", child_database: { title: "Controle de Faltas" } }],
      });
    }
    if (url.endsWith("/databases/attendance-database")) {
      return Response.json({ data_sources: [{ id: "attendance-source" }] });
    }
    if (url.endsWith("/data_sources/attendance-source/query")) {
      return Response.json({
        results: [
          {
            id: "course-page",
            properties: {
              Disciplina: { title: [{ plain_text: "Inteligência Artificial" }] },
              "Créditos": { number: null },
              "Dias faltados": { number: 3 },
            },
          },
        ],
      });
    }
    if (url.endsWith("/pages/course-page") && init.method === "PATCH") {
      patches.push(JSON.parse(String(init.body)) as Record<string, unknown>);
    }
    if (url.includes("/views?database_id=")) return Response.json({ results: [] });
    if (url.endsWith("/data_sources/attendance-source")) {
      return Response.json({ properties: { "Ausências planejadas": { id: "planned" } } });
    }
    return Response.json({ id: "ok" });
  };

  const result = await setupAttendancePanel({
    token: "token",
    parentPageId: "page-1",
    courses: [{ code: "GCC128", name: "Inteligência Artificial", credits: 6 }],
    fetcher,
  });

  assert.equal(result.coursesCreated, 0);
  assert.equal(result.creditsUpdated, 1);
  assert.equal(patches.length, 1);
  assert.deepEqual(patches[0]?.properties, { "Créditos": { number: 6 } });
});

test("reutiliza painel existente e nao duplica disciplinas", async () => {
  let pageCreations = 0;
  const fetcher: typeof fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.includes("/blocks/page-1/children")) {
      return Response.json({
        results: [
          {
            id: "attendance-database",
            child_database: { title: "Controle de Faltas" },
          },
        ],
      });
    }
    if (url.endsWith("/databases/attendance-database")) {
      return Response.json({ data_sources: [{ id: "attendance-source" }] });
    }
    if (url.endsWith("/data_sources/attendance-source/query")) {
      return Response.json({
        results: [
          {
            id: "course-page",
            properties: {
              Disciplina: { title: [{ plain_text: "Inteligência Artificial" }] },
            },
          },
        ],
      });
    }
    if (url.endsWith("/pages") && init.method === "POST") pageCreations += 1;
    if (url.includes("/views?database_id=")) return Response.json({ results: [] });
    return Response.json({ id: "ok" });
  };

  const result = await setupAttendancePanel({
    token: "token",
    parentPageId: "page-1",
    courses: [{ code: "GCC128", name: "Inteligência Artificial" }],
    fetcher,
  });

  assert.equal(result.created, false);
  assert.equal(result.coursesCreated, 0);
  assert.equal(pageCreations, 0);
});

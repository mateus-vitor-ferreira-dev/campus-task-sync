import assert from "node:assert/strict";
import test from "node:test";

import type { Assessment } from "../src/domain/assessment.js";
import { upsertAssessments } from "../src/notion/assessments-panel.js";

type Call = { url: string; method: string; body: Record<string, unknown> };

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

function panelFetcher(existingPages: Array<{ id: string; externalId: string }>) {
  const calls: Call[] = [];
  const fetcher: typeof fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push({
      url,
      method: init.method ?? "GET",
      body: init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {},
    });
    if (url.endsWith("/data_sources/source-1/query")) {
      return Response.json({
        results: existingPages.map((page) => ({
          id: page.id,
          properties: {
            "ID externo": { rich_text: [{ plain_text: page.externalId }] },
          },
        })),
      });
    }
    return Response.json({ id: "ok" });
  };
  return { calls, fetcher };
}

const campusEntry: Assessment = {
  id: "campus:501",
  courseCode: "GCC262",
  courseName: "Grafos e suas Aplicações",
  title: "Entrega da PROG1",
  type: "Trabalho",
  start: "2026-09-17T02:59:00.000Z",
  link: "https://campusvirtual.ufla.br/presencial/mod/assign/view.php?id=501",
  source: "Campus Virtual",
};

const travel = { start: "9999-12-31", end: "0000-01-01" };

test("cria o que falta e atualiza o que ja existe pelo ID externo", async () => {
  const { calls, fetcher } = panelFetcher([{ id: "page-501", externalId: "campus:501" }]);

  const result = await upsertAssessments({
    token: "token",
    dataSourceId: "source-1",
    entries: [
      campusEntry,
      { ...campusEntry, id: "campus:502", title: "Atividade Avaliativa 1", type: "Atividade" },
    ],
    travel,
    fetcher,
  });

  assert.deepEqual(result, { created: 1, updated: 1, archived: 0 });
  const patch = calls.find((call) => call.url.endsWith("/pages/page-501"));
  const properties = object(object(patch?.body)?.properties);
  assert.equal(object(object(properties?.Fonte)?.select)?.name, "Campus Virtual");
  assert.equal(object(properties?.Link)?.url, campusEntry.link);
});

test("arquiva a entrega que sumiu do Campus e nao encosta no plano de ensino", async () => {
  const { calls, fetcher } = panelFetcher([
    { id: "page-501", externalId: "campus:501" },
    { id: "page-900", externalId: "campus:900" },
    { id: "page-plano", externalId: "gcc129-prova-1" },
  ]);

  const result = await upsertAssessments({
    token: "token",
    dataSourceId: "source-1",
    entries: [campusEntry],
    travel,
    pruneCampusEntries: true,
    fetcher,
  });

  assert.deepEqual(result, { created: 0, updated: 1, archived: 1 });
  const archived = calls.filter((call) => call.body.in_trash === true).map((call) => call.url);
  assert.deepEqual(archived, ["https://api.notion.com/v1/pages/page-900"]);
});

test("grava data vazia quando o Campus nao publica prazo nem abertura", async () => {
  const { calls, fetcher } = panelFetcher([]);

  await upsertAssessments({
    token: "token",
    dataSourceId: "source-1",
    entries: [{ ...campusEntry, id: "campus:502", start: undefined }],
    travel,
    fetcher,
  });

  const created = calls.find((call) => call.url.endsWith("/pages") && call.method === "POST");
  const properties = object(object(created?.body)?.properties);
  assert.equal(object(properties?.Data)?.date, null);
});

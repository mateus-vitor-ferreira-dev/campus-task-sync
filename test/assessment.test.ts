import assert from "node:assert/strict";
import test from "node:test";

import { assessmentsFromActivities, classifyAssessment } from "../src/domain/assessment.js";

test("classifica pelo titulo antes de olhar o tipo do modulo", () => {
  // Titulos reais das disciplinas de 2026/2.
  assert.equal(classifyAssessment("Atividade Avaliativa Online 1", "quiz"), "Atividade");
  assert.equal(classifyAssessment("Entrega da LISTA1 (unico PDF)", "assign"), "Trabalho");
  assert.equal(classifyAssessment("Exercício Prático 01", "assign"), "Trabalho");
  assert.equal(classifyAssessment("Wiki: divisão de grupos e *ENTREGA*", "wiki"), "Trabalho");
  // Uma prova aplicada em sala vira `assign` de envio da foto: o titulo decide.
  assert.equal(classifyAssessment("Prova 1 - envio da resolução", "assign"), "Prova");
  assert.equal(classifyAssessment("P2", "quiz"), "Prova");
  assert.equal(classifyAssessment("Segunda chamada da P1", "assign"), "Recuperação");
  // Sem pista no titulo, o modulo decide.
  assert.equal(classifyAssessment("Semana 3", "assign"), "Trabalho");
  assert.equal(classifyAssessment("Semana 3", "quiz"), "Atividade");
});

test("monta o painel so com entregas avaliativas da oferta atual", () => {
  const { assessments, previousOffering } = assessmentsFromActivities([
    {
      courseCode: "GCC262",
      courseName: "Grafos e suas Aplicações",
      moduleId: 501,
      moduleType: "assign",
      name: "Entrega da PROG1",
      url: "https://campusvirtual.ufla.br/presencial/mod/assign/view.php?id=501",
      opensAt: "2026-09-01T12:00:00.000Z",
      dueAt: "2026-09-17T02:59:00.000Z",
      courseStartsAt: "2026-07-23T03:00:00.000Z",
    },
    {
      courseCode: "GCC175",
      courseName: "Sistemas Gerenciadores de Banco de Dados",
      moduleId: 502,
      moduleType: "wiki",
      name: "Wiki: divisão de grupos e *ENTREGA*",
      courseStartsAt: "2026-07-23T03:00:00.000Z",
    },
    {
      // Restaurada da oferta passada: o prazo e anterior ao inicio do semestre.
      courseCode: "GCC137",
      courseName: "Empreendedorismo em Sistemas de Informação",
      moduleId: 503,
      moduleType: "assign",
      name: "Entrega 3 - Validação inicial",
      dueAt: "2026-06-02T02:59:00.000Z",
      courseStartsAt: "2026-07-23T03:00:00.000Z",
    },
    {
      courseCode: "GCC262",
      courseName: "Grafos e suas Aplicações",
      moduleId: 504,
      moduleType: "resource",
      name: "Slides da aula 1",
      courseStartsAt: "2026-07-23T03:00:00.000Z",
    },
  ]);

  assert.equal(previousOffering, 1);
  assert.deepEqual(
    assessments.map((entry) => [entry.id, entry.type, entry.start]),
    [
      ["campus:501", "Trabalho", "2026-09-17T02:59:00.000Z"],
      ["campus:502", "Trabalho", undefined],
    ],
  );
  assert.equal(assessments[0]?.link, "https://campusvirtual.ufla.br/presencial/mod/assign/view.php?id=501");
  assert.match(assessments[0]?.content ?? "", /^Abre em /);
  assert.match(assessments[1]?.notes ?? "", /nao publicou data/);
});

test("usa a abertura quando a atividade nao tem prazo", () => {
  const { assessments } = assessmentsFromActivities([
    {
      courseCode: "GAC111",
      courseName: "Técnicas de Programação",
      moduleId: 600,
      moduleType: "quiz",
      name: "Questionário da semana",
      opensAt: "2026-08-20T03:01:00.000Z",
      courseStartsAt: "2026-07-23T03:00:00.000Z",
    },
  ]);

  assert.equal(assessments[0]?.start, "2026-08-20T03:01:00.000Z");
  assert.equal(assessments[0]?.content, undefined);
});

import assert from "node:assert/strict";
import test from "node:test";

import { sectionFolderName, sectionLabel } from "../src/drive/section-folder.js";

test("traduz as secoes genericas do Moodle", () => {
  assert.equal(sectionLabel("Topic 5"), "Tópico 5");
  assert.equal(sectionLabel("Topic 12"), "Tópico 12");
  assert.equal(sectionLabel("General"), "Geral");
  assert.equal(sectionLabel("Geral"), "Geral");
});

test("remove o prefixo de datas e fica com a primeira oracao", () => {
  assert.equal(
    sectionLabel("11, 12 e 13 de agosto: Apresentação da Disciplina. // Linguagem Java"),
    "Apresentação da Disciplina",
  );
  assert.equal(sectionLabel("05/09: Revisão para a prova"), "Revisão para a prova");
});

test("encurta nomes longos sem cortar palavra no meio", () => {
  const label = sectionLabel(
    "Apresentação da Disciplina, Plano de Curso, Metodologia de ensino e avaliação",
  );
  assert.ok(label.length <= 60, `esperado no maximo 60 caracteres, veio ${label.length}`);
  assert.ok(!label.endsWith(","), "nao deve terminar em pontuacao");
  assert.ok(label.startsWith("Apresentação da Disciplina"));
  assert.ok(!/\S$/.test(label) || label.split(" ").at(-1) !== "avaliaçã", "nao corta palavra ao meio");
});

test("preserva nomes que ja sao curtos e uteis", () => {
  assert.equal(sectionLabel("Plano de Ensino e Bibliografia"), "Plano de Ensino e Bibliografia");
  assert.equal(sectionLabel("Trabalho Final (TP)"), "Trabalho Final (TP)");
  assert.equal(sectionLabel("Módulo 1"), "Módulo 1");
});

test("cai no rotulo padrao quando a secao nao tem nome", () => {
  assert.equal(sectionLabel(undefined), "Materiais gerais");
  assert.equal(sectionLabel("   "), "Materiais gerais");
});

test("prefixa com o indice real da secao, com dois digitos", () => {
  assert.equal(sectionFolderName({ sectionName: "General", sectionNumber: 0 }), "00 - Geral");
  assert.equal(sectionFolderName({ sectionName: "Topic 5", sectionNumber: 5 }), "05 - Tópico 5");
  assert.equal(sectionFolderName({ sectionName: "Topic 12", sectionNumber: 12 }), "12 - Tópico 12");
});

test("dispensa o prefixo quando o Moodle nao informa a posicao", () => {
  assert.equal(sectionFolderName({ sectionName: "Módulo 1" }), "Módulo 1");
});

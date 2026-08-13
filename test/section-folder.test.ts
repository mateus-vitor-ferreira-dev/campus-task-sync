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

test("encurta nomes longos sem deixar palavra pendurada no fim", () => {
  assert.equal(
    sectionLabel("Apresentação da Disciplina, Plano de Curso, Metodologia de ensino e avaliação"),
    "Apresentação da Disciplina, Plano de Curso, Metodologia",
  );
  assert.equal(sectionLabel("Introdução a Banco de Dados e a Modelagem Conceitual de Sistemas"), "Introdução a Banco de Dados e a Modelagem Conceitual");
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
  assert.equal(sectionFolderName({ sectionName: "Módulo 1", sectionNumber: 1 }), "01 - Módulo 1");
  assert.equal(sectionFolderName({ sectionName: "Trabalho Final (TP)", sectionNumber: 18 }), "18 - Trabalho Final (TP)");
});

test("secao generica usa o indice, nao o numero que o professor escreveu", () => {
  // GCC137 tem duas secoes chamadas "Topic 8", nos indices 8 e 11.
  assert.equal(sectionFolderName({ sectionName: "Topic 8", sectionNumber: 8 }), "08 - Tópico");
  assert.equal(sectionFolderName({ sectionName: "Topic 8", sectionNumber: 11 }), "11 - Tópico");
  assert.notEqual(
    sectionFolderName({ sectionName: "Topic 8", sectionNumber: 8 }),
    sectionFolderName({ sectionName: "Topic 8", sectionNumber: 11 }),
  );
});

test("nome real parecido com generico nao e confundido", () => {
  assert.equal(sectionFolderName({ sectionName: "Tópicos Avançados", sectionNumber: 4 }), "04 - Tópicos Avançados");
});

test("dispensa o prefixo quando o Moodle nao informa a posicao", () => {
  assert.equal(sectionFolderName({ sectionName: "Módulo 1" }), "Módulo 1");
});

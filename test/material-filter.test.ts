import assert from "node:assert/strict";
import test from "node:test";

import { isFromOtherSemester, parseSemester } from "../src/drive/material-filter.js";

const ATUAL = parseSemester("2026/2");

test("le o semestre no formato do shortname do Moodle", () => {
  assert.deepEqual(parseSemester("2026/2"), { year: 2026, term: 2 });
  assert.equal(parseSemester("2026-2"), undefined);
  assert.equal(parseSemester("qualquer"), undefined);
});

test("reconhece marcador de oferta anterior no nome", () => {
  assert.equal(isFromOtherSemester("01_GCC137_Plano_de_Aula_2026s1.pdf", ATUAL), true);
  assert.equal(isFromOtherSemester("prova-2025-2.pdf", ATUAL), true);
  assert.equal(isFromOtherSemester("cronograma 2025 1.pdf", ATUAL), true);
});

test("mantem arquivo da oferta atual", () => {
  assert.equal(isFromOtherSemester("Tp_Empreendedorismo_2026_2.pdf", ATUAL), false);
  assert.equal(isFromOtherSemester("Plano_2026s2.pdf", ATUAL), false);
});

test("nao confunde ano solto nem sequencia de digitos com semestre", () => {
  // O ano de publicacao do relatorio nao diz nada sobre a oferta.
  assert.equal(isFromOtherSemester("sobrevivencia-das-empresas-relatorio-2016.pdf", ATUAL), false);
  assert.equal(isFromOtherSemester("12716123.pdf", ATUAL), false);
  assert.equal(isFromOtherSemester("851-3508-2-PB.pdf", ATUAL), false);
  assert.equal(isFromOtherSemester("4439.pdf", ATUAL), false);
  assert.equal(isFromOtherSemester("Casos_18.pdf", ATUAL), false);
});

test("sem semestre conhecido nao descarta nada", () => {
  assert.equal(isFromOtherSemester("01_GCC137_Plano_de_Aula_2026s1.pdf", undefined), false);
});

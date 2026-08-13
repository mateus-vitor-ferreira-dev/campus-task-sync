import assert from "node:assert/strict";
import test from "node:test";

import { syncMaterialsToDrive } from "../src/drive/sync-materials.js";

test("organiza materiais por disciplina e seção e cria guia de avaliações", async () => {
  const folders: string[] = [];
  const files: Array<{ name: string; parentId: string; sourceId: string }> = [];
  const result = await syncMaterialsToDrive({
    courses: [{ code: "GCC128", name: "Inteligência Artificial", period: "2026/2" }],
    importantDates: [{
      id: "exam-1",
      courseCode: "GCC128",
      courseName: "Inteligência Artificial",
      title: "Projeto #01",
      type: "Trabalho",
      start: "2026-09-01",
      content: "KNN",
    }],
    moodle: {
      async getActivities() {
        return [{
          courseCode: "GCC128",
          courseName: "Inteligência Artificial",
          moduleId: 10,
          name: "Aula de KNN",
          sectionName: "Aprendizado de Máquina",
          attachments: [
            { name: "knn.pdf", apiUrl: "https://campus/webservice/pluginfile.php/knn.pdf", mimeType: "application/pdf" },
            { name: "Vídeo KNN", apiUrl: "https://video.example/knn" },
          ],
        }];
      },
      async downloadAttachment() {
        return new Uint8Array([1, 2, 3]);
      },
    },
    drive: {
      async getOrCreateFolder(name, parentId) {
        folders.push(`${parentId ?? "root"}/${name}`);
        return `folder-${folders.length}`;
      },
      async uploadFile(file) {
        files.push({ name: file.name, parentId: file.parentId, sourceId: file.sourceId });
        return "created";
      },
    },
  });

  assert.deepEqual(folders, [
    "root/Campus Virtual - 2026.2",
    "folder-1/GCC128 - Inteligência Artificial",
    "folder-2/Aprendizado de Máquina",
  ]);
  assert.deepEqual(files.map((file) => file.name), ["Guia de avaliações.md", "Links dos materiais.md", "knn.pdf"]);
  assert.equal(files[2]?.sourceId, "https://campus/webservice/pluginfile.php/knn.pdf");
  assert.deepEqual(result, {
    rootFolderId: "folder-1",
    activitiesFound: 1,
    filesCreated: 3,
    filesUpdated: 0,
    filesUnchanged: 0,
    filesFailed: 0,
    coursesSkipped: 0,
    skipped: { duplicate: 0, genericSection: 0, tooLarge: 0 },
    filesMarkedOldSemester: 0,
  });
});

test("nao cria pasta para disciplina sem material, sem link e sem data", async () => {
  const folders: string[] = [];
  const result = await syncMaterialsToDrive({
    courses: [
      { code: "GCC262", name: "Grafos e suas Aplicações", period: "2026/2" },
      { code: "GCC128", name: "Inteligência Artificial", period: "2026/2" },
    ],
    importantDates: [],
    moodle: {
      async getActivities() {
        return [{
          courseCode: "GCC128",
          courseName: "Inteligência Artificial",
          moduleId: 10,
          name: "Aula de KNN",
          sectionName: "Topic 3",
          sectionNumber: 3,
          attachments: [
            { name: "knn.pdf", apiUrl: "https://campus/webservice/pluginfile.php/knn.pdf", mimeType: "application/pdf" },
          ],
        }];
      },
      async downloadAttachment() {
        return new Uint8Array([1, 2, 3]);
      },
    },
    drive: {
      async getOrCreateFolder(name, parentId) {
        folders.push(`${parentId ?? "root"}/${name}`);
        return `folder-${folders.length}`;
      },
      async uploadFile() {
        return "created";
      },
    },
  });

  assert.deepEqual(folders, [
    "root/Campus Virtual - 2026.2",
    "folder-1/GCC128 - Inteligência Artificial",
    "folder-2/03 - Tópico",
  ]);
  assert.equal(result.coursesSkipped, 1);
});

test("ignora o mesmo arquivo republicado em outra atividade", async () => {
  const uploaded: string[] = [];
  const result = await syncMaterialsToDrive({
    courses: [{ code: "GCC137", name: "Empreendedorismo", period: "2026/2" }],
    importantDates: [],
    moodle: {
      async getActivities() {
        return [1, 2].map((id) => ({
          courseCode: "GCC137",
          courseName: "Empreendedorismo",
          moduleId: id,
          name: `Atividade ${id}`,
          sectionName: "Topic 5",
          sectionNumber: 5,
          attachments: [{
            name: "sobrevivencia-2016.pdf",
            apiUrl: `https://campus/webservice/pluginfile.php/${id}/sobrevivencia-2016.pdf`,
            mimeType: "application/pdf",
          }],
        }));
      },
      async downloadAttachment() {
        return new Uint8Array([9, 9, 9]);
      },
    },
    drive: {
      async getOrCreateFolder() {
        return "folder";
      },
      async uploadFile(file) {
        uploaded.push(file.name);
        return "created";
      },
    },
  });

  assert.deepEqual(uploaded, ["sobrevivencia-2016.pdf"]);
  assert.equal(result.skipped.duplicate, 1);
  assert.equal(result.filesCreated, 1);
});

test("descarta seção sem nome e arquivo grande, mas marca a oferta anterior", async () => {
  const uploaded: string[] = [];
  const attachment = (name: string, size: number) => ({
    name,
    apiUrl: `https://campus/webservice/pluginfile.php/${name}`,
    mimeType: "application/pdf",
    size,
  });
  const result = await syncMaterialsToDrive({
    courses: [{ code: "GCC137", name: "Empreendedorismo", period: "2026/2" }],
    importantDates: [],
    skipGenericSections: true,
    maximumFileBytes: 3 * 1024 * 1024,
    moodle: {
      async getActivities() {
        return [
          {
            courseCode: "GCC137",
            courseName: "Empreendedorismo",
            moduleId: 1,
            name: "Deposito",
            sectionName: "Topic 8",
            sectionNumber: 8,
            attachments: [attachment("CasoDBACorp.pdf", 34_000)],
          },
          {
            courseCode: "GCC137",
            courseName: "Empreendedorismo",
            moduleId: 2,
            name: "Plano",
            sectionName: "Geral",
            sectionNumber: 0,
            attachments: [
              attachment("01_GCC137_Plano_de_Aula_2026s1.pdf", 239_000),
              attachment("Sobrevivencia-empresas-sebrae_Final.pdf", 6 * 1024 * 1024),
              attachment("Tp_Empreendedorismo_2026_2.pdf", 286_000),
            ],
          },
        ];
      },
      // Conteudo distinto por arquivo, senao a deduplicacao por hash
      // engoliria o segundo e o teste mediria a coisa errada.
      async downloadAttachment(file) {
        return new TextEncoder().encode(file.name);
      },
    },
    drive: {
      async getOrCreateFolder() {
        return "folder";
      },
      async uploadFile(file) {
        uploaded.push(file.name);
        return "created";
      },
    },
  });

  assert.deepEqual(uploaded, [
    "[oferta anterior] 01_GCC137_Plano_de_Aula_2026s1.pdf",
    "Tp_Empreendedorismo_2026_2.pdf",
  ]);
  assert.deepEqual(result.skipped, { duplicate: 0, genericSection: 1, tooLarge: 1 });
  assert.equal(result.filesMarkedOldSemester, 1);
});

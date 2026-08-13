import { createHash } from "node:crypto";

import type { MoodleActivity, MoodleCourseSummary } from "../moodle/client.js";
import type { ImportantDate } from "../plans/semester-2026-2.js";
import type { GoogleDriveDestination, UploadResult } from "./google-drive.js";
import { sectionFolderName } from "./section-folder.js";

type MaterialSource = {
  getActivities(courseCodes: string[]): Promise<MoodleActivity[]>;
  downloadAttachment: (attachment: MoodleActivity["attachments"][number]) => Promise<Uint8Array>;
};

type MaterialDestination = {
  getOrCreateFolder(name: string, parentId?: string): Promise<string>;
  uploadFile(file: {
    name: string;
    mimeType: string;
    bytes: Uint8Array;
    parentId: string;
    sourceId: string;
    courseCode: string;
  }): Promise<UploadResult>;
};

type Options = {
  moodle: MaterialSource;
  drive: MaterialDestination;
  courses: MoodleCourseSummary[];
  importantDates: ImportantDate[];
  rootFolderId?: string;
  semester?: string;
};

export type MaterialsSyncResult = {
  rootFolderId: string;
  activitiesFound: number;
  filesCreated: number;
  filesUpdated: number;
  filesUnchanged: number;
  filesFailed: number;
  /** Disciplinas sem material, sem link e sem data: nao ganham pasta. */
  coursesSkipped: number;
  /** Anexos identicos republicados em atividades diferentes. */
  duplicatesSkipped: number;
};

function guideFor(course: MoodleCourseSummary, dates: ImportantDate[]): string {
  const rows = dates
    .filter((date) => date.courseCode === course.code)
    .sort((left, right) => left.start.localeCompare(right.start))
    .map((date) => [
      `## ${date.title}`,
      `- Data prevista: ${date.start}${date.end ? ` a ${date.end}` : ""}`,
      `- Tipo: ${date.type}`,
      ...(date.weight === undefined ? [] : [`- Peso: ${date.weight}%`]),
      ...(date.content ? [`- Conteúdo: ${date.content}`] : []),
      ...(date.notes ? [`- Observação: ${date.notes}`] : []),
    ].join("\n"))
    .join("\n\n");
  return `# Guia de avaliações — ${course.name}\n\n` +
    "Gerado a partir do plano de ensino. Confirme datas e alterações no Campus Virtual.\n\n" +
    (rows || "Nenhuma avaliação com data disponível no plano de ensino atual.\n");
}

function isCampusFile(activity: MoodleActivity, index: number): boolean {
  return activity.attachments[index]?.apiUrl?.includes("/webservice/pluginfile.php/") === true;
}

function linksGuide(course: MoodleCourseSummary, activities: MoodleActivity[]): string | undefined {
  const links = activities.flatMap((activity) =>
    activity.attachments.flatMap((attachment, index) => {
      if (isCampusFile(activity, index)) return [];
      const url = attachment.browserUrl ?? attachment.apiUrl;
      return url ? [`- [${attachment.name}](${url}) — ${sectionFolderName(activity)}`] : [];
    }),
  );
  if (links.length === 0) return undefined;
  return `# Links dos materiais — ${course.name}\n\n` +
    "Estes materiais foram publicados como páginas ou links externos, não como arquivos para download.\n\n" +
    links.join("\n") + "\n";
}

export async function syncMaterialsToDrive(options: Options): Promise<MaterialsSyncResult> {
  const semester = options.semester ?? options.courses.map((course) => course.period).sort().at(-1) ?? "Atual";
  const rootFolderId = options.rootFolderId ?? await options.drive.getOrCreateFolder(`Campus Virtual - ${semester.replace("/", ".")}`);
  const activities = await options.moodle.getActivities(options.courses.map((course) => course.code));
  let filesCreated = 0;
  let filesUpdated = 0;
  let filesUnchanged = 0;
  let filesFailed = 0;
  let coursesSkipped = 0;
  let duplicatesSkipped = 0;

  const count = (result: UploadResult): void => {
    if (result === "created") filesCreated += 1;
    else if (result === "updated") filesUpdated += 1;
    else filesUnchanged += 1;
  };

  for (const course of options.courses) {
    const courseActivities = activities.filter((item) => item.courseCode === course.code);
    const courseDates = options.importantDates.filter((date) => date.courseCode === course.code);
    const externalLinks = linksGuide(course, courseActivities);
    const withFiles = courseActivities
      .map((activity) => ({
        activity,
        attachments: activity.attachments.filter((_, index) => isCampusFile(activity, index)),
      }))
      .filter((entry) => entry.attachments.length > 0);

    // Sem arquivo, sem link e sem data nao ha o que guardar: criar a pasta so
    // encheria o Drive de disciplinas vazias.
    if (withFiles.length === 0 && !externalLinks && courseDates.length === 0) {
      coursesSkipped += 1;
      continue;
    }

    const courseFolderId = await options.drive.getOrCreateFolder(`${course.code} - ${course.name}`, rootFolderId);
    if (courseDates.length > 0) {
      count(await options.drive.uploadFile({
        name: "Guia de avaliações.md",
        mimeType: "text/markdown",
        bytes: Buffer.from(guideFor(course, courseDates), "utf8"),
        parentId: courseFolderId,
        sourceId: `guide:${semester}:${course.code}`,
        courseCode: course.code,
      }));
    }

    if (externalLinks) {
      count(await options.drive.uploadFile({
        name: "Links dos materiais.md",
        mimeType: "text/markdown",
        bytes: Buffer.from(externalLinks, "utf8"),
        parentId: courseFolderId,
        sourceId: `links:${semester}:${course.code}`,
        courseCode: course.code,
      }));
    }

    const seenContent = new Set<string>();
    for (const { activity, attachments } of withFiles) {
      const folderId = await options.drive.getOrCreateFolder(sectionFolderName(activity), courseFolderId);
      for (const attachment of attachments) {
        try {
          const bytes = await options.moodle.downloadAttachment(attachment);
          // O mesmo PDF costuma ser republicado em varias atividades; cada uma
          // tem apiUrl propria, entao so o conteudo denuncia a repeticao.
          const contentHash = createHash("sha256").update(bytes).digest("hex");
          if (seenContent.has(contentHash)) {
            duplicatesSkipped += 1;
            continue;
          }
          seenContent.add(contentHash);
          const result = await options.drive.uploadFile({
            name: attachment.name,
            mimeType: attachment.mimeType ?? "application/octet-stream",
            bytes,
            parentId: folderId,
            sourceId: attachment.apiUrl ?? `${activity.moduleId}:${attachment.name}`,
            courseCode: course.code,
          });
          count(result);
        } catch (error) {
          filesFailed += 1;
          const message = error instanceof Error ? error.message : "erro desconhecido";
          console.warn(`Não foi possível sincronizar ${course.code}/${attachment.name}: ${message}`);
        }
      }
    }
  }
  return {
    rootFolderId,
    activitiesFound: activities.length,
    filesCreated,
    filesUpdated,
    filesUnchanged,
    filesFailed,
    coursesSkipped,
    duplicatesSkipped,
  };
}

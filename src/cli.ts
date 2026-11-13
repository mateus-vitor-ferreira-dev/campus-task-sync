import "dotenv/config";

import { fetchCalendar } from "./calendar/fetch-calendar.js";
import { loadAppConfig, loadCalendarConfig, type AppConfig } from "./config.js";
import { assessmentsFromActivities } from "./domain/assessment.js";
import { NotionDestination } from "./notion/notion-destination.js";
import { upsertAssessments } from "./notion/assessments-panel.js";
import { createOpenAiAnswerGenerator } from "./ai/generate-answer.js";
import { MoodleClient, type MoodleActivity } from "./moodle/client.js";
import { TRAVEL_PERIOD } from "./plans/semester-2026-2.js";
import { enrichTasksWithMoodle } from "./moodle/enrich-tasks.js";
import { syncTasks } from "./sync/sync-tasks.js";

const dryRun = process.argv.includes("--dry-run");

async function loadTasks(calendarUrl: string, moodleToken?: string) {
  const calendarTasks = await fetchCalendar(calendarUrl);
  const noActivities: MoodleActivity[] = [];
  if (!moodleToken) return { tasks: calendarTasks, enriched: 0, activities: noActivities };

  try {
    const client = new MoodleClient({ calendarUrl, token: moodleToken });
    // O calendario so lista o que tem evento com data. Uma disciplina cuja
    // prova esta apenas no plano de ensino nao aparece nele, e sem consultar
    // as disciplinas do semestre ela ficaria fora do painel de avaliacoes.
    const semesterCourses = await client.getCurrentSemesterCourses();
    const courseCodes = [
      ...new Set([
        ...calendarTasks.flatMap((task) => (task.courseCode ? [task.courseCode] : [])),
        ...semesterCourses.map((course) => course.code),
      ]),
    ];
    const activities = await client.getActivities(courseCodes);
    const tasks = await enrichTasksWithMoodle(calendarTasks, {
      getActivities: async () => activities,
    });
    const enriched = tasks.filter((task, index) => task !== calendarTasks[index]).length;
    return { tasks, enriched, activities };
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    console.error(`Detalhes do Moodle indisponiveis; usando somente o calendario: ${message}`);
    return { tasks: calendarTasks, enriched: 0, activities: noActivities };
  }
}

/**
 * Atualiza o painel "Provas e Trabalhos" com o que o Campus publica. Sai calado
 * quando o painel nao foi criado ainda ou quando o Moodle falhou: sem
 * atividades em maos, podar levaria a arquivar o painel inteiro.
 */
async function syncAssessments(config: AppConfig, activities: MoodleActivity[]) {
  if (!config.notionAssessmentsDataSourceId || activities.length === 0) return {};
  const { assessments, previousOffering } = assessmentsFromActivities(activities);
  const upsert = await upsertAssessments({
    token: config.notionToken,
    dataSourceId: config.notionAssessmentsDataSourceId,
    entries: assessments,
    travel: TRAVEL_PERIOD,
    pruneCampusEntries: true,
  });
  return {
    assessmentsCreated: upsert.created,
    assessmentsUpdated: upsert.updated,
    assessmentsArchived: upsert.archived,
    assessmentsFromPreviousOffering: previousOffering,
  };
}

async function main(): Promise<void> {
  if (dryRun) {
    const { calendarUrl, moodleToken } = loadCalendarConfig();
    const { tasks, enriched } = await loadTasks(calendarUrl, moodleToken);
    console.log(JSON.stringify({ count: tasks.length, enriched, tasks }, null, 2));
    return;
  }

  const config = loadAppConfig();
  const { tasks, enriched, activities } = await loadTasks(config.calendarUrl, config.moodleToken);
  const destination = new NotionDestination({
    token: config.notionToken,
    dataSourceId: config.notionDataSourceId,
    assigneeUserId: config.notionAssigneeUserId,
    answerGenerator: config.openAiSuggestionsEnabled && config.openAiApiKey
      ? createOpenAiAnswerGenerator({
          apiKey: config.openAiApiKey,
          model: config.openAiModel,
        })
      : undefined,
  });
  const result = await syncTasks(tasks, destination);
  const restoredCompleted = await destination.restoreCompletedMarkedCancelled();
  const assessments = await syncAssessments(config, activities);

  console.log(
    JSON.stringify({
      calendarTasks: tasks.length,
      moodleEnriched: enriched,
      ...result,
      restoredCompleted,
      ...assessments,
    }),
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Erro desconhecido.";
  console.error(message);
  process.exitCode = 1;
});

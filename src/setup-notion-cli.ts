import "dotenv/config";

import { fetchCalendar } from "./calendar/fetch-calendar.js";
import { loadNotionSetupConfig } from "./config.js";
import { MoodleClient } from "./moodle/client.js";
import { enrichTasksWithMoodle } from "./moodle/enrich-tasks.js";
import { setupNotion } from "./notion/setup-notion.js";

async function main(): Promise<void> {
  const config = loadNotionSetupConfig();
  const calendarTasks = await fetchCalendar(config.calendarUrl);
  // Sem o enriquecimento, as cores nasceriam nos codigos (GAC111) enquanto o
  // sync grava o nome completo da disciplina, criando opcoes orfas.
  const tasks = config.moodleToken
    ? await enrichTasksWithMoodle(
        calendarTasks,
        new MoodleClient({ calendarUrl: config.calendarUrl, token: config.moodleToken }),
      )
    : calendarTasks;
  const result = await setupNotion({
    token: config.notionToken,
    parentPageUrl: config.notionParentPageUrl,
    existingDataSourceId: config.notionDataSourceId,
    courses: tasks.flatMap((task) => (task.course ? [task.course] : [])),
  });

  console.log(
    JSON.stringify({
      created: result.created,
      dataSourceConfigured: true,
      viewsCreated: result.viewsCreated,
      notificationsConfigured: Boolean(result.assigneeUserId),
    }),
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Erro desconhecido.";
  console.error(message);
  process.exitCode = 1;
});

import "dotenv/config";

import { loadNotionSetupConfig } from "./config.js";
import { assessmentsFromActivities } from "./domain/assessment.js";
import { MoodleClient } from "./moodle/client.js";
import { markPlannedAbsences } from "./notion/mark-planned-absences.js";
import { setupAttendancePanel } from "./notion/setup-attendance.js";
import { setupImportantDatesPanel } from "./notion/setup-important-dates.js";
import { parseNotionPageId } from "./notion/setup-notion.js";
import { COURSE_CREDITS_2026_2, IMPORTANT_DATES_2026_2, PLANNED_ABSENCES_2026_2, TRAVEL_PERIOD } from "./plans/semester-2026-2.js";

async function main(): Promise<void> {
  const config = loadNotionSetupConfig();
  if (!config.moodleToken) throw new Error("MOODLE_TOKEN é obrigatório para localizar o controle de faltas.");
  const parentPageId = parseNotionPageId(config.notionParentPageUrl);
  const moodle = new MoodleClient({ calendarUrl: config.calendarUrl, token: config.moodleToken });
  const courses = await moodle.getCurrentSemesterCourses();
  const attendance = await setupAttendancePanel({
    token: config.notionToken,
    parentPageId,
    courses: courses.map((course) => ({ ...course, credits: COURSE_CREDITS_2026_2[course.code] })),
  });
  // O painel ja nasce com o que o Campus publica; o plano de ensino entra por
  // cima, sem se sobrepor, porque os ids das duas fontes nao se cruzam.
  const activities = await moodle.getActivities(courses.map((course) => course.code));
  const { assessments, previousOffering } = assessmentsFromActivities(activities);
  const result = await setupImportantDatesPanel({
    token: config.notionToken,
    parentPageId,
    dates: IMPORTANT_DATES_2026_2,
    campusAssessments: assessments,
    travel: TRAVEL_PERIOD,
  });
  const attendanceRowsUpdated = await markPlannedAbsences({
    token: config.notionToken,
    dataSourceId: attendance.dataSourceId,
    absences: PLANNED_ABSENCES_2026_2,
  });
  console.log(
    JSON.stringify({
      ...result,
      assessmentsFromPreviousOffering: previousOffering,
      attendanceDataSourceId: attendance.dataSourceId,
      attendanceRowsUpdated,
    }),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Erro desconhecido.");
  process.exitCode = 1;
});

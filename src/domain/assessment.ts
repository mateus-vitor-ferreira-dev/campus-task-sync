/**
 * Provas, trabalhos e atividades avaliativas -- o conteudo do painel "Provas e
 * Trabalhos". Duas fontes alimentam o mesmo tipo e convivem na mesma base:
 *
 * - o Campus Virtual, que so conhece o que tem entrega online (`assign`,
 *   `quiz`, `wiki`, `workshop`);
 * - o plano de ensino do SIG, que e onde moram as provas presenciais. Sem ele,
 *   disciplinas sem entrega online ficam sem nenhuma avaliacao no painel.
 */
export type AssessmentType = "Prova" | "Trabalho" | "Atividade" | "Recuperação";

export type AssessmentSource = "Plano de ensino" | "Campus Virtual";

export type Assessment = {
  id: string;
  courseCode: string;
  courseName: string;
  title: string;
  type: AssessmentType;
  /** Ausente quando a atividade do Campus nao publica data nenhuma. */
  start?: string;
  end?: string;
  weight?: number;
  content?: string;
  notes?: string;
  link?: string;
  source: AssessmentSource;
};

/** Prefixo dos ids vindos do Moodle; separa as duas fontes na mesma base. */
export const CAMPUS_ASSESSMENT_PREFIX = "campus:";

export type AssessmentActivity = {
  courseCode: string;
  courseName: string;
  moduleId: number;
  moduleType?: string;
  name: string;
  url?: string;
  opensAt?: string;
  dueAt?: string;
  courseStartsAt?: string;
};

export type AssessmentsFromActivities = {
  assessments: Assessment[];
  /**
   * Quantas atividades foram descartadas por serem da oferta anterior. As
   * disciplinas sao restauradas de uma copia do semestre passado e as entregas
   * chegam com as datas antigas; mostra-las no painel afirmaria prazos falsos.
   */
  previousOffering: number;
};

/**
 * Modulos do Moodle que representam entrega avaliativa. `resource`, `url`,
 * `page`, `folder`, `label` e `forum` sao material ou conversa e ficam de fora.
 */
const ASSESSMENT_MODULES = new Set(["assign", "quiz", "wiki", "workshop"]);

/** Modulos cuja entrega e, por natureza, um trabalho e nao uma atividade. */
const ASSIGNMENT_MODULES = new Set(["assign", "wiki", "workshop"]);

const RECOVERY = /\b(recuperacao|segunda chamada|prova substitutiva|substitutiva)\b/;
const EXAM = /\b(prova|exame|avaliacao (escrita|presencial)|p[12])\b/;
const ASSIGNMENT =
  /\b(trabalho|seminario|projeto|lista|entrega|exercicio|relatorio|apresentacao|pratica)\b/;

function normalized(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * O titulo manda, porque o professor escolhe o modulo por conveniencia: uma
 * prova online e um `quiz` e uma prova aplicada em sala costuma virar um
 * `assign` de envio da foto. So quando o titulo nao diz nada e que o tipo do
 * modulo decide.
 */
export function classifyAssessment(title: string, moduleType?: string): AssessmentType {
  const text = normalized(title);
  if (RECOVERY.test(text)) return "Recuperação";
  if (EXAM.test(text)) return "Prova";
  if (ASSIGNMENT.test(text)) return "Trabalho";
  if (moduleType && ASSIGNMENT_MODULES.has(moduleType)) return "Trabalho";
  return "Atividade";
}

/** Data que representa a avaliacao: o prazo, ou a abertura quando nao ha prazo. */
function assessmentDate(activity: AssessmentActivity): string | undefined {
  return activity.dueAt ?? activity.opensAt;
}

function openingNote(activity: AssessmentActivity): string | undefined {
  if (!activity.opensAt || !activity.dueAt) return undefined;
  const opens = new Date(activity.opensAt);
  if (Number.isNaN(opens.getTime())) return undefined;
  return `Abre em ${opens.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}`;
}

export function assessmentsFromActivities(
  activities: AssessmentActivity[],
): AssessmentsFromActivities {
  const assessments: Assessment[] = [];
  let previousOffering = 0;

  for (const activity of activities) {
    if (!activity.moduleType || !ASSESSMENT_MODULES.has(activity.moduleType)) continue;

    const start = assessmentDate(activity);
    if (start && activity.courseStartsAt && start < activity.courseStartsAt) {
      previousOffering += 1;
      continue;
    }

    const note = openingNote(activity);
    assessments.push({
      id: `${CAMPUS_ASSESSMENT_PREFIX}${activity.moduleId}`,
      courseCode: activity.courseCode,
      courseName: activity.courseName,
      title: activity.name,
      type: classifyAssessment(activity.name, activity.moduleType),
      ...(start ? { start } : {}),
      ...(note ? { content: note } : {}),
      ...(start ? {} : { notes: "O Campus nao publicou data para esta entrega." }),
      ...(activity.url ? { link: activity.url } : {}),
      source: "Campus Virtual",
    });
  }

  return { assessments, previousOffering };
}

export type ImportantDate = {
  id: string;
  courseCode: string;
  courseName: string;
  title: string;
  type: "Atividade" | "Prova" | "Trabalho" | "Recuperação";
  start: string;
  end?: string;
  weight?: number;
  content?: string;
  notes?: string;
};

export type PlannedAbsence = {
  courseCode: string;
  courseName: string;
  dates: string[];
};

/**
 * Intervalo vazio de proposito: o upstream usa isto para marcar avaliacoes que
 * caem numa viagem, mas a viagem era do dono original. Com o fim antes do
 * inicio, `overlapsTravel` nunca da positivo.
 */
export const TRAVEL_PERIOD = {
  start: "9999-12-31",
  end: "0000-01-01",
};

/**
 * Vazio ate que os planos de ensino de GAC111, GCC242 e GCC175 sejam
 * transcritos. O upstream traz aqui as datas das disciplinas do dono original
 * (GCC128, GCC220 e um GCC175 que coincide no codigo mas nao necessariamente
 * na turma) -- manter aquilo faria o "Guia de avaliacoes.md" no Drive e o
 * painel de datas no Notion afirmarem provas e pesos que nunca foram
 * conferidos no Campus Virtual.
 */
export const IMPORTANT_DATES_2026_2: ImportantDate[] = [];

/** Vazio pelo mesmo motivo: as faltas planejadas eram as dele. */
export const PLANNED_ABSENCES_2026_2: PlannedAbsence[] = [];

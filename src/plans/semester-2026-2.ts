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

/**
 * Creditos por codigo de disciplina. O Moodle nao publica esse numero em lugar
 * nenhum -- shortname, fullname e idnumber trazem so codigo, periodo e turma --
 * e sem ele nao da para calcular o limite de faltas, que e de quatro faltas por
 * credito. O que estiver aqui e gravado na coluna "Créditos" do painel; o que
 * faltar continua em branco para ser preenchido a mao no Notion, e o setup
 * nunca sobrescreve um valor digitado por la.
 */
export const COURSE_CREDITS_2026_2: Record<string, number> = {
  /** Técnicas de Programação Aplicada à Engenharia: 12 dias de aula, 24 faltas. */
  GAC111: 6,
  /** As demais tem 4 creditos: 8 dias de aula, 16 faltas. */
  GCC129: 4, // Sistemas Distribuídos
  GCC137: 4, // Empreendedorismo em Sistemas de Informação
  GCC175: 4, // Sistemas Gerenciadores de Banco de Dados
  GCC227: 4, // Manutenção e Evolução de Software
  GCC242: 4, // Segurança, Auditoria e Avaliação de Sistemas de Informação
  GCC262: 4, // Grafos e suas Aplicações
};

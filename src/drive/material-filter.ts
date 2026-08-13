/**
 * Marcador de oferta no nome do arquivo: "2026s1", "2026_1", "2025-2", "2026 2".
 * Exige o ano em 20xx seguido do numero do semestre para nao confundir com ano
 * solto no nome ("relatorio-2016.pdf") nem com sequencia de digitos qualquer
 * ("12716123.pdf").
 *
 * A borda e por digito, nao \b: o separador mais comum e o sublinhado, que
 * conta como caractere de palavra e faria \b falhar bem no caso principal
 * ("Plano_de_Aula_2026s1.pdf").
 */
const SEMESTER_IN_NAME = /(?<!\d)(20\d{2})[\s._-]?(?:s|sem|semestre)?[\s._-]?([12])(?!\d)/i;

export type Semester = { year: number; term: number };

/** Le "2026/2" -- o formato que o shortname do Moodle usa. */
export function parseSemester(value: string): Semester | undefined {
  const match = value.match(/^(\d{4})\/([12])$/);
  if (!match) return undefined;
  return { year: Number(match[1]), term: Number(match[2]) };
}

/**
 * Verdadeiro quando o nome do arquivo aponta para uma oferta diferente da
 * atual. As disciplinas sao restauradas de uma copia do semestre anterior, e
 * o `timemodified` do Moodle vem carimbado com a data da restauracao -- o
 * nome do arquivo e o unico sinal que sobra para separar o que envelheceu.
 */
export function isFromOtherSemester(fileName: string, semester: Semester | undefined): boolean {
  if (!semester) return false;
  const match = fileName.match(SEMESTER_IN_NAME);
  if (!match) return false;
  return Number(match[1]) !== semester.year || Number(match[2]) !== semester.term;
}

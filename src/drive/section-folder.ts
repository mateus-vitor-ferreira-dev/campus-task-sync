const MAXIMUM_LENGTH = 60;

const MONTHS = "janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro";

/** "Topic 5", "Tema 5", "Section 5", "Unidade 5" -> "Tópico 5". */
const GENERIC_SECTION = new RegExp(`^(?:topic|t[óo]pico|tema|section|se[çc][ãa]o|unidade)\\s*(\\d+)$`, "i");

const GENERAL_SECTION = /^(?:general|geral)$/i;

/**
 * Remove um prefixo de datas seguido de dois-pontos, do tipo
 * "11, 12 e 13 de agosto:" ou "05/09:", que o professor usa para marcar a
 * semana da aula. A data ja esta no calendario; na pasta ela so ocupa espaco.
 */
function stripDatePrefix(value: string): string {
  const prefix = new RegExp(`^\\s*\\d{1,2}[\\d\\s,/e.-]*(?:de\\s+(?:${MONTHS}))?[\\s,e]*(?:\\d{1,2}[\\d\\s,/e.-]*(?:de\\s+(?:${MONTHS}))?)*\\s*:`, "i");
  return value.replace(prefix, "").trim();
}

/**
 * Fica com a primeira oracao do nome. Secoes longas costumam listar todo o
 * conteudo da aula ("Apresentacao. // Linguagem Java"); o primeiro trecho ja
 * identifica a pasta e o resto vira ruido no painel do Drive.
 */
function firstClause(value: string): string {
  const [head] = value.split(/\s*\/\/\s*|(?<=[a-zà-ú)\]])\.\s+/u);
  return (head ?? value).trim();
}

/** Palavras que nao podem terminar o nome de uma pasta: ficam penduradas. */
const TRAILING_STOP_WORDS = /(?:\s+(?:de|da|do|das|dos|e|em|no|na|nos|nas|a|o|as|os|para|por|com|ao|à|aos|às))+$/iu;

function truncate(value: string): string {
  if (value.length <= MAXIMUM_LENGTH) return value;
  const cut = value.slice(0, MAXIMUM_LENGTH);
  const lastSpace = cut.lastIndexOf(" ");
  const trimmed = lastSpace > MAXIMUM_LENGTH / 2 ? cut.slice(0, lastSpace) : cut;
  return trimmed.replace(/[\s,;:.\-]+$/u, "").replace(TRAILING_STOP_WORDS, "");
}

export function sectionLabel(rawName: string | undefined): string {
  const name = (rawName ?? "").replace(/\s+/g, " ").trim();
  if (!name) return "Materiais gerais";
  if (GENERAL_SECTION.test(name)) return "Geral";
  const generic = name.match(GENERIC_SECTION);
  if (generic) return `Tópico ${generic[1]}`;
  const cleaned = truncate(firstClause(stripDatePrefix(name))).replace(/\//g, "-").trim();
  return cleaned || "Materiais gerais";
}

/**
 * Nome final da pasta, prefixado pela posicao da secao no curso para que o
 * Drive liste na ordem do Moodle em vez de alfabetica.
 *
 * O numero e o indice real da secao, nao uma contagem sequencial: se o
 * professor inserir uma secao no meio do semestre, as pastas ja criadas
 * mantem o nome. Renumerar faria `getOrCreateFolder` criar pastas novas e
 * deixar as antigas orfas, com os arquivos divididos entre as duas.
 */
export function sectionFolderName(section: { sectionName?: string; sectionNumber?: number }): string {
  if (section.sectionNumber === undefined) return sectionLabel(section.sectionName);
  // O numero embutido num nome generico e do professor e nem sempre bate com a
  // posicao da secao -- GCC137 tem duas secoes chamadas "Topic 8", nos indices
  // 8 e 11. Como o rotulo generico nao informa nada, quem manda e o indice.
  const label = GENERIC_SECTION.test((section.sectionName ?? "").trim())
    ? "Tópico"
    : sectionLabel(section.sectionName);
  return `${String(section.sectionNumber).padStart(2, "0")} - ${label}`;
}

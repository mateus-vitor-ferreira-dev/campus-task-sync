/**
 * O Notion rejeita virgulas em nomes de opcoes de select/multi-select.
 * Mantemos o texto legivel usando um separador visual equivalente.
 *
 * Divergimos do upstream, que usa " · ": as disciplinas ja gravadas neste
 * Notion nasceram com hifen, e a API ignora renomeacao de opcao de select --
 * trocar o separador criaria opcoes novas e deixaria as antigas orfas.
 */
export function notionSelectValue(value: string): string {
  return value.replace(/\s*,\s*/g, " - ").replace(/\s{2,}/g, " ").trim();
}


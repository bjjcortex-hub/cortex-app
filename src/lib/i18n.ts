import { createContext, useContext } from 'react'

export type Lang = 'pt' | 'en'

export const LangContext = createContext<Lang>('pt')
export const useLang = () => useContext(LangContext)

// ── node / edge type labels ────────────────────────────────────────────────────

const NODE_TYPE: Record<Lang, Record<string, string>> = {
  pt: { position: 'posição', transition: 'transição', submission: 'finalização', principle: 'princípio', system: 'sistema' },
  en: { position: 'position', transition: 'transition', submission: 'submission', principle: 'principle', system: 'system' },
}
const EDGE_TYPE: Record<Lang, Record<string, string>> = {
  pt: { transition: 'transição', counter: 'counter', related: 'relacionado', submission_from: 'submissão', part_of_system: 'parte do sistema', role_of: 'papel de' },
  en: { transition: 'transition', counter: 'counter', related: 'related', submission_from: 'submission', part_of_system: 'part of system', role_of: 'role of' },
}
const RESULT_TYPE: Record<Lang, Record<string, string>> = {
  pt: { success: 'sucesso', failure: 'falha', counter: 'counter' },
  en: { success: 'success', failure: 'failure', counter: 'counter' },
}

export function tNodeType(v: string | null | undefined, lang: Lang = 'pt'): string {
  return (v && NODE_TYPE[lang][v]) ?? v ?? '—'
}
export function tEdgeType(v: string | null | undefined, lang: Lang = 'pt'): string {
  return (v && EDGE_TYPE[lang][v]) ?? v ?? '—'
}
export function tResultType(v: string | null | undefined, lang: Lang = 'pt'): string {
  return (v && RESULT_TYPE[lang][v]) ?? v ?? '—'
}

// ── UI strings ─────────────────────────────────────────────────────────────────

const UI: Record<string, Record<Lang, string>> = {
  // App
  'app.search_placeholder': { pt: 'Iniciar em… (posição, técnica)', en: 'Start at… (position, technique)' },
  'app.mode_map':           { pt: 'Mapa Mental', en: 'Mind Map' },
  'app.mode_flow':          { pt: 'Fluxo', en: 'Flow' },

  // NodePanel
  'panel.attack':           { pt: 'Ataque', en: 'Attack' },
  'panel.defense':          { pt: 'Defesa', en: 'Defense' },
  'panel.role':             { pt: 'Papel', en: 'Role' },
  'panel.type':             { pt: 'Tipo', en: 'Type' },
  'panel.dominance':        { pt: 'Dominância', en: 'Dominance' },
  'panel.see_desc':         { pt: 'Ver descrição', en: 'See description' },
  'panel.tech_from':        { pt: 'Depois', en: 'After' },
  'panel.how_to_get':       { pt: 'Antes', en: 'Before' },
  'panel.opponent_tech':    { pt: 'Técnicas do adversário', en: 'Opponent techniques' },
  'panel.available_from':   { pt: 'Disponível a partir de', en: 'Available from' },
  'panel.dest_success':     { pt: 'Posição de destino (sucesso)', en: 'Destination (success)' },
  'panel.none':             { pt: 'Nenhum', en: 'None' },
  'panel.none_tech':        { pt: 'Sem técnicas mapeadas.', en: 'No techniques mapped.' },
  'panel.none_pos':         { pt: 'Sem conexões mapeadas para esta posição.', en: 'No connections mapped for this position.' },
  'panel.none_opponent':    { pt: 'Sem técnicas mapeadas para o adversário.', en: 'No techniques mapped for the opponent.' },
  'panel.none_origin':      { pt: 'Sem posições de origem mapeadas.', en: 'No origin positions mapped.' },
  'panel.none_dest':        { pt: 'Destino não mapeado.', en: 'Destination not mapped.' },
  'panel.videos':           { pt: 'Vídeos', en: 'Videos' },

  // FlowBuilder — start screen
  'flow.fighter_a':         { pt: 'Lutador A', en: 'Fighter A' },
  'flow.fighter_b':         { pt: 'Lutador B', en: 'Fighter B' },
  'flow.vs':                { pt: 'vs', en: 'vs' },
  'flow.how_start':         { pt: 'Como a luta começa?', en: 'How does the fight start?' },
  'flow.standing':          { pt: 'Em Pé', en: 'Standing' },
  'flow.standing_sub':      { pt: 'Luta de pé', en: 'Standing fight' },
  'flow.kneeling':          { pt: 'Rola de Treino', en: 'Training Roll' },
  'flow.kneeling_sub':      { pt: 'De joelhos', en: 'From knees' },
  'flow.search_pos':        { pt: 'Buscar posição...', en: 'Search position...' },
  'flow.load_saved':        { pt: 'Carregar fluxo salvo', en: 'Load saved flow' },
  'flow.none_saved':        { pt: 'Nenhum salvo', en: 'None saved' },

  // FlowBuilder — header
  'flow.new_flow':          { pt: 'Novo fluxo', en: 'New flow' },
  'flow.save':              { pt: 'Salvar', en: 'Save' },
  'flow.saved':             { pt: 'Salvos', en: 'Saved' },
  'flow.restart':           { pt: 'Reiniciar', en: 'Restart' },

  // FlowBuilder — canvas
  'flow.start_fight':       { pt: 'Início da luta', en: 'Start of fight' },
  'flow.no_mirror':         { pt: 'sem espelho', en: 'no mirror' },
  'flow.cancel':            { pt: 'Cancelar', en: 'Cancel' },
  'flow.new_pos':           { pt: 'Nova posição...', en: 'New position...' },
  'flow.alter_pos':         { pt: 'Alterar posição', en: 'Change position' },
  'flow.remove':            { pt: 'Remover', en: 'Remove' },
  'flow.insert_pos':        { pt: 'Inserir posição aqui', en: 'Insert position here' },

  // FlowBuilder — action panel
  'flow.tech_of':           { pt: 'Técnica de', en: 'Technique by' },
  'flow.next_action':       { pt: 'Próxima ação', en: 'Next action' },
  'flow.failed_next':       { pt: 'Falhou — próxima ação:', en: 'Failed — next action:' },
  'flow.from':              { pt: 'de:', en: 'from:' },
  'flow.outside_list':      { pt: 'Fora da lista:', en: 'Not in list:' },
  'flow.tech_name':         { pt: 'Nome da técnica...', en: 'Technique name...' },
  'flow.choose_result':     { pt: 'Escolher resultado', en: 'Choose result' },
  'flow.reg_failure':       { pt: 'Registrar como falha', en: 'Register as failure' },
  'flow.tried':             { pt: 'tentou', en: 'attempted' },
  'flow.success_btn':       { pt: '✓ Sucesso', en: '✓ Success' },
  'flow.failure_btn':       { pt: '✗ Falhou', en: '✗ Failed' },
  'flow.back':              { pt: '← Voltar', en: '← Back' },
  'flow.pick_dest':         { pt: 'Posição de chegada', en: 'Destination position' },
  'flow.success_with':      { pt: 'Sucesso com', en: 'Success with' },
  'flow.arrives_at':        { pt: 'Chega em:', en: 'Arrives at:' },
  'flow.where_arrived':     { pt: 'Onde chegou?', en: 'Where did they end up?' },
  'flow.dest_pos':          { pt: 'Posição de chegada:', en: 'Destination:' },
  'flow.free_name':         { pt: 'Nome livre (sem espelho automático):', en: 'Free name (no auto mirror):' },
  'flow.search_dest':       { pt: 'Buscar posição de chegada...', en: 'Search destination position...' },
  'flow.insert_panel':      { pt: 'Inserir posição', en: 'Insert position' },
  'flow.search_insert':     { pt: 'Buscar posição...', en: 'Search position...' },

  // GroupedTechList type labels
  'tech.submissions':       { pt: 'Finalizações', en: 'Submissions' },
  'tech.transitions':       { pt: 'Transições', en: 'Transitions' },
  'tech.positions':         { pt: 'Posições', en: 'Positions' },

  // App — extra UI
  'app.hidden':             { pt: 'Ocultos', en: 'Hidden' },
  'app.root_label':         { pt: 'Raiz', en: 'Root' },
  'app.view_full':          { pt: 'Completo', en: 'Full' },
  'app.view_simple':        { pt: 'Simples', en: 'Simple' },
  'app.view_all':           { pt: 'Tudo', en: 'All' },
  'app.clear':              { pt: 'Limpar canvas', en: 'Clear canvas' },
  'app.reset_btn':          { pt: 'Reiniciar', en: 'Restart' },
  'app.hide_node':          { pt: 'Ocultar este nó', en: 'Hide this node' },
  'app.disable':            { pt: 'Desabilitar', en: 'Disable' },
  'app.enable':             { pt: 'Reabilitar', en: 'Enable' },
  'app.delete':             { pt: 'Excluir', en: 'Delete' },
  'app.empty_hint':         { pt: 'Busque uma posição para começar.', en: 'Search for a position to start.' },
  'app.nodes_edges':        { pt: 'nós · arestas', en: 'nodes · edges' },
  'app.children_all':       { pt: 'Todos os filhos', en: 'All children' },
  'app.children_active':    { pt: 'Só ativos', en: 'Active only' },
  'app.auto_layout':        { pt: 'Auto organizar', en: 'Auto layout' },
}

export function t(key: string, lang: Lang): string {
  return UI[key]?.[lang] ?? UI[key]?.['pt'] ?? key
}

export function nodeName(
  attrs: { name: string; name_en?: string | null },
  lang: Lang,
): string {
  return lang === 'en' ? (attrs.name_en ?? attrs.name) : attrs.name
}

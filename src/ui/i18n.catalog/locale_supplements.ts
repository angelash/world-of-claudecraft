// Source-backed locale supplements for strings that must ship with real
// non-English text in the current build, without hand-editing the sparse
// locale overlays. Keys are flat dotted TranslationKey paths.

type LocaleSupplement = Record<string, string>;

const hostedPlayEs: LocaleSupplement = {
  'hudChrome.hostedPlay.actionLogLabel': 'Registro de acciones',
  'hudChrome.hostedPlay.log.accept': 'Juego asistido: yendo a aceptar {quest}.',
  'hudChrome.hostedPlay.log.questWork': 'Juego asistido: avanzando en {quest}.',
  'hudChrome.hostedPlay.log.turnIn': 'Juego asistido: yendo a entregar {quest}.',
  'hudChrome.hostedPlay.log.resupply': 'Juego asistido: yendo a un vendedor para reabastecerse.',
  'hudChrome.hostedPlay.log.upgrade': 'Juego asistido: yendo a un vendedor para comprar una mejora.',
  'hudChrome.hostedPlay.log.grind': 'Juego asistido: ganando experiencia.',
  'hudChrome.hostedPlay.log.recover': 'Juego asistido: recuperandose entre combates.',
  'hudChrome.hostedPlay.log.retreat': 'Juego asistido: retirandose a una zona segura.',
  'hudChrome.hostedPlay.log.release': 'Juego asistido: liberando espiritu.',
  'hudChrome.hostedPlay.log.gatherParty': 'Juego asistido: reuniendo un grupo para {quest}.',
  'hudChrome.hostedPlay.log.leaveDungeon': 'Juego asistido: saliendo de {dungeon}.',
  'hudChrome.hostedPlay.log.leaveDungeonForQuest': 'Juego asistido: saliendo de la mazmorra para entregar {quest}.',
};

const hostedPlayFrFR: LocaleSupplement = {
  'hudChrome.hostedPlay.actionLogLabel': "Journal d'actions",
  'hudChrome.hostedPlay.log.accept': 'Jeu assiste : en route pour accepter {quest}.',
  'hudChrome.hostedPlay.log.questWork': 'Jeu assiste : progression de {quest}.',
  'hudChrome.hostedPlay.log.turnIn': 'Jeu assiste : en route pour rendre {quest}.',
  'hudChrome.hostedPlay.log.resupply': 'Jeu assiste : en route vers un vendeur pour se reapprovisionner.',
  'hudChrome.hostedPlay.log.upgrade': 'Jeu assiste : en route vers un vendeur pour acheter une amelioration.',
  'hudChrome.hostedPlay.log.grind': "Jeu assiste : gain d'experience en cours.",
  'hudChrome.hostedPlay.log.recover': 'Jeu assiste : recuperation entre les combats.',
  'hudChrome.hostedPlay.log.retreat': 'Jeu assiste : retraite vers une zone sure.',
  'hudChrome.hostedPlay.log.release': "Jeu assiste : liberation de l'esprit.",
  'hudChrome.hostedPlay.log.gatherParty': 'Jeu assiste : rassemblement du groupe pour {quest}.',
  'hudChrome.hostedPlay.log.leaveDungeon': 'Jeu assiste : sortie de {dungeon}.',
  'hudChrome.hostedPlay.log.leaveDungeonForQuest': 'Jeu assiste : sortie du donjon pour rendre {quest}.',
};

const hostedPlayItIT: LocaleSupplement = {
  'hudChrome.hostedPlay.actionLogLabel': 'Registro azioni',
  'hudChrome.hostedPlay.log.accept': 'Gioco assistito: in arrivo per accettare {quest}.',
  'hudChrome.hostedPlay.log.questWork': 'Gioco assistito: avanzamento di {quest}.',
  'hudChrome.hostedPlay.log.turnIn': 'Gioco assistito: in arrivo per consegnare {quest}.',
  'hudChrome.hostedPlay.log.resupply': 'Gioco assistito: in arrivo da un venditore per rifornirsi.',
  'hudChrome.hostedPlay.log.upgrade': 'Gioco assistito: in arrivo da un venditore per comprare un miglioramento.',
  'hudChrome.hostedPlay.log.grind': 'Gioco assistito: esperienza in corso.',
  'hudChrome.hostedPlay.log.recover': 'Gioco assistito: recupero tra uno scontro e l altro.',
  'hudChrome.hostedPlay.log.retreat': 'Gioco assistito: ritirata verso una zona sicura.',
  'hudChrome.hostedPlay.log.release': 'Gioco assistito: rilascio dello spirito.',
  'hudChrome.hostedPlay.log.gatherParty': 'Gioco assistito: raduno del gruppo per {quest}.',
  'hudChrome.hostedPlay.log.leaveDungeon': 'Gioco assistito: uscita da {dungeon}.',
  'hudChrome.hostedPlay.log.leaveDungeonForQuest': 'Gioco assistito: uscita dal dungeon per consegnare {quest}.',
};

const hostedPlayDeDE: LocaleSupplement = {
  'hudChrome.hostedPlay.actionLogLabel': 'Aktionsprotokoll',
  'hudChrome.hostedPlay.log.accept': 'Betreutes Spiel: auf dem Weg, um {quest} anzunehmen.',
  'hudChrome.hostedPlay.log.questWork': 'Betreutes Spiel: Fortschritt bei {quest}.',
  'hudChrome.hostedPlay.log.turnIn': 'Betreutes Spiel: auf dem Weg, um {quest} abzugeben.',
  'hudChrome.hostedPlay.log.resupply': 'Betreutes Spiel: auf dem Weg zu einem Haendler fuer Nachschub.',
  'hudChrome.hostedPlay.log.upgrade': 'Betreutes Spiel: auf dem Weg zu einem Haendler fuer eine Aufwertung.',
  'hudChrome.hostedPlay.log.grind': 'Betreutes Spiel: sammelt Erfahrung.',
  'hudChrome.hostedPlay.log.recover': 'Betreutes Spiel: erholt sich zwischen Kaempfen.',
  'hudChrome.hostedPlay.log.retreat': 'Betreutes Spiel: Rueckzug an einen sicheren Ort.',
  'hudChrome.hostedPlay.log.release': 'Betreutes Spiel: Geist wird freigelassen.',
  'hudChrome.hostedPlay.log.gatherParty': 'Betreutes Spiel: sammelt eine Gruppe fuer {quest}.',
  'hudChrome.hostedPlay.log.leaveDungeon': 'Betreutes Spiel: verlaesst {dungeon}.',
  'hudChrome.hostedPlay.log.leaveDungeonForQuest': 'Betreutes Spiel: verlaesst den Dungeon, um {quest} abzugeben.',
};

const hostedPlayZhCN: LocaleSupplement = {
  'hudChrome.hostedPlay.actionLogLabel': '聊天行为日志',
  'hudChrome.hostedPlay.log.accept': '托管：前往接取 {quest}。',
  'hudChrome.hostedPlay.log.questWork': '托管：正在推进 {quest}。',
  'hudChrome.hostedPlay.log.turnIn': '托管：前往交付 {quest}。',
  'hudChrome.hostedPlay.log.resupply': '托管：前往商人处补给。',
  'hudChrome.hostedPlay.log.upgrade': '托管：前往商人处购买升级。',
  'hudChrome.hostedPlay.log.grind': '托管：正在刷怪获取经验。',
  'hudChrome.hostedPlay.log.recover': '托管：正在两次战斗间恢复。',
  'hudChrome.hostedPlay.log.retreat': '托管：正在撤退到安全位置。',
  'hudChrome.hostedPlay.log.release': '托管：正在释放灵魂。',
  'hudChrome.hostedPlay.log.gatherParty': '托管：正在为 {quest} 集合队伍。',
  'hudChrome.hostedPlay.log.leaveDungeon': '托管：正在离开 {dungeon}。',
  'hudChrome.hostedPlay.log.leaveDungeonForQuest': '托管：正在离开副本，准备交付 {quest}。',
};

const hostedPlayZhTW: LocaleSupplement = {
  'hudChrome.hostedPlay.actionLogLabel': '聊天行為日誌',
  'hudChrome.hostedPlay.log.accept': '託管：前往接取 {quest}。',
  'hudChrome.hostedPlay.log.questWork': '託管：正在推進 {quest}。',
  'hudChrome.hostedPlay.log.turnIn': '託管：前往交付 {quest}。',
  'hudChrome.hostedPlay.log.resupply': '託管：前往商人處補給。',
  'hudChrome.hostedPlay.log.upgrade': '託管：前往商人處購買升級。',
  'hudChrome.hostedPlay.log.grind': '託管：正在刷怪取得經驗。',
  'hudChrome.hostedPlay.log.recover': '託管：正在兩次戰鬥間恢復。',
  'hudChrome.hostedPlay.log.retreat': '託管：正在撤退到安全位置。',
  'hudChrome.hostedPlay.log.release': '託管：正在釋放靈魂。',
  'hudChrome.hostedPlay.log.gatherParty': '託管：正在為 {quest} 集合隊伍。',
  'hudChrome.hostedPlay.log.leaveDungeon': '託管：正在離開 {dungeon}。',
  'hudChrome.hostedPlay.log.leaveDungeonForQuest': '託管：正在離開副本，準備交付 {quest}。',
};

const hostedPlayKoKR: LocaleSupplement = {
  'hudChrome.hostedPlay.actionLogLabel': '채팅 행동 기록',
  'hudChrome.hostedPlay.log.accept': '자동 플레이: {quest} 수락하러 이동 중.',
  'hudChrome.hostedPlay.log.questWork': '자동 플레이: {quest} 진행 중.',
  'hudChrome.hostedPlay.log.turnIn': '자동 플레이: {quest} 완료 보고하러 이동 중.',
  'hudChrome.hostedPlay.log.resupply': '자동 플레이: 보급을 위해 상인에게 이동 중.',
  'hudChrome.hostedPlay.log.upgrade': '자동 플레이: 업그레이드를 사기 위해 상인에게 이동 중.',
  'hudChrome.hostedPlay.log.grind': '자동 플레이: 경험치를 위해 사냥 중.',
  'hudChrome.hostedPlay.log.recover': '자동 플레이: 전투 사이에 회복 중.',
  'hudChrome.hostedPlay.log.retreat': '자동 플레이: 안전한 곳으로 후퇴 중.',
  'hudChrome.hostedPlay.log.release': '자동 플레이: 영혼을 해방하는 중.',
  'hudChrome.hostedPlay.log.gatherParty': '자동 플레이: {quest} 를 위해 파티를 모으는 중.',
  'hudChrome.hostedPlay.log.leaveDungeon': '자동 플레이: {dungeon} 에서 나가는 중.',
  'hudChrome.hostedPlay.log.leaveDungeonForQuest': '자동 플레이: {quest} 보고를 위해 던전에서 나가는 중.',
};

const hostedPlayJaJP: LocaleSupplement = {
  'hudChrome.hostedPlay.actionLogLabel': 'チャット行動ログ',
  'hudChrome.hostedPlay.log.accept': '自動プレイ: {quest} を受けに向かっています。',
  'hudChrome.hostedPlay.log.questWork': '自動プレイ: {quest} を進行中です。',
  'hudChrome.hostedPlay.log.turnIn': '自動プレイ: {quest} を報告しに向かっています。',
  'hudChrome.hostedPlay.log.resupply': '自動プレイ: 補給のため商人に向かっています。',
  'hudChrome.hostedPlay.log.upgrade': '自動プレイ: 強化を買うため商人に向かっています。',
  'hudChrome.hostedPlay.log.grind': '自動プレイ: 経験値のために狩りをしています。',
  'hudChrome.hostedPlay.log.recover': '自動プレイ: 戦闘の合間に回復しています。',
  'hudChrome.hostedPlay.log.retreat': '自動プレイ: 安全な場所へ退避しています。',
  'hudChrome.hostedPlay.log.release': '自動プレイ: 魂を解放しています。',
  'hudChrome.hostedPlay.log.gatherParty': '自動プレイ: {quest} のためにパーティーを集めています。',
  'hudChrome.hostedPlay.log.leaveDungeon': '自動プレイ: {dungeon} から退出しています。',
  'hudChrome.hostedPlay.log.leaveDungeonForQuest': '自動プレイ: {quest} の報告のためダンジョンを離れています。',
};

const hostedPlayPtBR: LocaleSupplement = {
  'hudChrome.hostedPlay.actionLogLabel': 'Registro de acoes',
  'hudChrome.hostedPlay.log.accept': 'Jogo assistido: indo aceitar {quest}.',
  'hudChrome.hostedPlay.log.questWork': 'Jogo assistido: avancando em {quest}.',
  'hudChrome.hostedPlay.log.turnIn': 'Jogo assistido: indo entregar {quest}.',
  'hudChrome.hostedPlay.log.resupply': 'Jogo assistido: indo a um vendedor para reabastecer.',
  'hudChrome.hostedPlay.log.upgrade': 'Jogo assistido: indo a um vendedor para comprar uma melhoria.',
  'hudChrome.hostedPlay.log.grind': 'Jogo assistido: ganhando experiencia.',
  'hudChrome.hostedPlay.log.recover': 'Jogo assistido: recuperando entre combates.',
  'hudChrome.hostedPlay.log.retreat': 'Jogo assistido: recuando para uma area segura.',
  'hudChrome.hostedPlay.log.release': 'Jogo assistido: liberando o espirito.',
  'hudChrome.hostedPlay.log.gatherParty': 'Jogo assistido: reunindo um grupo para {quest}.',
  'hudChrome.hostedPlay.log.leaveDungeon': 'Jogo assistido: saindo de {dungeon}.',
  'hudChrome.hostedPlay.log.leaveDungeonForQuest': 'Jogo assistido: saindo da masmorra para entregar {quest}.',
};

const hostedPlayRuRU: LocaleSupplement = {
  'hudChrome.hostedPlay.actionLogLabel': 'Журнал действий',
  'hudChrome.hostedPlay.log.accept': 'Автоигра: идем брать {quest}.',
  'hudChrome.hostedPlay.log.questWork': 'Автоигра: выполняем {quest}.',
  'hudChrome.hostedPlay.log.turnIn': 'Автоигра: идем сдавать {quest}.',
  'hudChrome.hostedPlay.log.resupply': 'Автоигра: идем к торговцу за припасами.',
  'hudChrome.hostedPlay.log.upgrade': 'Автоигра: идем к торговцу за улучшением.',
  'hudChrome.hostedPlay.log.grind': 'Автоигра: набираем опыт.',
  'hudChrome.hostedPlay.log.recover': 'Автоигра: восстанавливаемся между боями.',
  'hudChrome.hostedPlay.log.retreat': 'Автоигра: отступаем в безопасное место.',
  'hudChrome.hostedPlay.log.release': 'Автоигра: освобождаем дух.',
  'hudChrome.hostedPlay.log.gatherParty': 'Автоигра: собираем группу для {quest}.',
  'hudChrome.hostedPlay.log.leaveDungeon': 'Автоигра: покидаем {dungeon}.',
  'hudChrome.hostedPlay.log.leaveDungeonForQuest': 'Автоигра: выходим из подземелья, чтобы сдать {quest}.',
};

export const localeSupplements = {
  es: hostedPlayEs,
  es_ES: hostedPlayEs,
  fr_FR: hostedPlayFrFR,
  fr_CA: hostedPlayFrFR,
  it_IT: hostedPlayItIT,
  de_DE: hostedPlayDeDE,
  zh_CN: hostedPlayZhCN,
  zh_TW: hostedPlayZhTW,
  ko_KR: hostedPlayKoKR,
  ja_JP: hostedPlayJaJP,
  pt_BR: hostedPlayPtBR,
  ru_RU: hostedPlayRuRU,
} satisfies Record<string, LocaleSupplement>;

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
  'hudChrome.hostedPlay.log.upgrade':
    'Juego asistido: yendo a un vendedor para comprar una mejora.',
  'hudChrome.hostedPlay.log.grind': 'Juego asistido: ganando experiencia.',
  'hudChrome.hostedPlay.log.recover': 'Juego asistido: recuperandose entre combates.',
  'hudChrome.hostedPlay.log.retreat': 'Juego asistido: retirandose a una zona segura.',
  'hudChrome.hostedPlay.log.release': 'Juego asistido: liberando espiritu.',
  'hudChrome.hostedPlay.log.gatherParty': 'Juego asistido: reuniendo un grupo para {quest}.',
  'hudChrome.hostedPlay.log.leaveDungeon': 'Juego asistido: saliendo de {dungeon}.',
  'hudChrome.hostedPlay.log.leaveDungeonForQuest':
    'Juego asistido: saliendo de la mazmorra para entregar {quest}.',
};

const hostedPlayFrFR: LocaleSupplement = {
  'hudChrome.hostedPlay.actionLogLabel': "Journal d'actions",
  'hudChrome.hostedPlay.log.accept': 'Jeu assiste : en route pour accepter {quest}.',
  'hudChrome.hostedPlay.log.questWork': 'Jeu assiste : progression de {quest}.',
  'hudChrome.hostedPlay.log.turnIn': 'Jeu assiste : en route pour rendre {quest}.',
  'hudChrome.hostedPlay.log.resupply':
    'Jeu assiste : en route vers un vendeur pour se reapprovisionner.',
  'hudChrome.hostedPlay.log.upgrade':
    'Jeu assiste : en route vers un vendeur pour acheter une amelioration.',
  'hudChrome.hostedPlay.log.grind': "Jeu assiste : gain d'experience en cours.",
  'hudChrome.hostedPlay.log.recover': 'Jeu assiste : recuperation entre les combats.',
  'hudChrome.hostedPlay.log.retreat': 'Jeu assiste : retraite vers une zone sure.',
  'hudChrome.hostedPlay.log.release': "Jeu assiste : liberation de l'esprit.",
  'hudChrome.hostedPlay.log.gatherParty': 'Jeu assiste : rassemblement du groupe pour {quest}.',
  'hudChrome.hostedPlay.log.leaveDungeon': 'Jeu assiste : sortie de {dungeon}.',
  'hudChrome.hostedPlay.log.leaveDungeonForQuest':
    'Jeu assiste : sortie du donjon pour rendre {quest}.',
};

const hostedPlayItIT: LocaleSupplement = {
  'hudChrome.hostedPlay.actionLogLabel': 'Registro azioni',
  'hudChrome.hostedPlay.log.accept': 'Gioco assistito: in arrivo per accettare {quest}.',
  'hudChrome.hostedPlay.log.questWork': 'Gioco assistito: avanzamento di {quest}.',
  'hudChrome.hostedPlay.log.turnIn': 'Gioco assistito: in arrivo per consegnare {quest}.',
  'hudChrome.hostedPlay.log.resupply': 'Gioco assistito: in arrivo da un venditore per rifornirsi.',
  'hudChrome.hostedPlay.log.upgrade':
    'Gioco assistito: in arrivo da un venditore per comprare un miglioramento.',
  'hudChrome.hostedPlay.log.grind': 'Gioco assistito: esperienza in corso.',
  'hudChrome.hostedPlay.log.recover': 'Gioco assistito: recupero tra uno scontro e l altro.',
  'hudChrome.hostedPlay.log.retreat': 'Gioco assistito: ritirata verso una zona sicura.',
  'hudChrome.hostedPlay.log.release': 'Gioco assistito: rilascio dello spirito.',
  'hudChrome.hostedPlay.log.gatherParty': 'Gioco assistito: raduno del gruppo per {quest}.',
  'hudChrome.hostedPlay.log.leaveDungeon': 'Gioco assistito: uscita da {dungeon}.',
  'hudChrome.hostedPlay.log.leaveDungeonForQuest':
    'Gioco assistito: uscita dal dungeon per consegnare {quest}.',
};

const hostedPlayDeDE: LocaleSupplement = {
  'hudChrome.hostedPlay.actionLogLabel': 'Aktionsprotokoll',
  'hudChrome.hostedPlay.log.accept': 'Betreutes Spiel: auf dem Weg, um {quest} anzunehmen.',
  'hudChrome.hostedPlay.log.questWork': 'Betreutes Spiel: Fortschritt bei {quest}.',
  'hudChrome.hostedPlay.log.turnIn': 'Betreutes Spiel: auf dem Weg, um {quest} abzugeben.',
  'hudChrome.hostedPlay.log.resupply':
    'Betreutes Spiel: auf dem Weg zu einem Haendler fuer Nachschub.',
  'hudChrome.hostedPlay.log.upgrade':
    'Betreutes Spiel: auf dem Weg zu einem Haendler fuer eine Aufwertung.',
  'hudChrome.hostedPlay.log.grind': 'Betreutes Spiel: sammelt Erfahrung.',
  'hudChrome.hostedPlay.log.recover': 'Betreutes Spiel: erholt sich zwischen Kaempfen.',
  'hudChrome.hostedPlay.log.retreat': 'Betreutes Spiel: Rueckzug an einen sicheren Ort.',
  'hudChrome.hostedPlay.log.release': 'Betreutes Spiel: Geist wird freigelassen.',
  'hudChrome.hostedPlay.log.gatherParty': 'Betreutes Spiel: sammelt eine Gruppe fuer {quest}.',
  'hudChrome.hostedPlay.log.leaveDungeon': 'Betreutes Spiel: verlaesst {dungeon}.',
  'hudChrome.hostedPlay.log.leaveDungeonForQuest':
    'Betreutes Spiel: verlaesst den Dungeon, um {quest} abzugeben.',
};

const hostedPlayZhCN: LocaleSupplement = {
  'hudChrome.hostedPlay.actionLogLabel': '聊天行为日志',
  'hudChrome.hostedPlay.autoInviteNearbyLabel': '自动邀请附近玩家',
  'hudChrome.hostedPlay.autoInviteTargetPartySizeLabel': '自动邀请目标队伍人数',
  'hudChrome.hostedPlay.autoInviteTargetPartySizeAria': '邀请到队伍达到 {count} 人',
  'hudChrome.hostedPlay.serverRestartRequired':
    '托管后端还是旧版本，重启本地联机服务后这个开关才会生效。',
  'hudChrome.hostedPlay.groupMode.inviteNearby': '正在邀请附近玩家',
  'hudChrome.hostedPlay.partyMode.preferGroup': '优先组队',
  'hudChrome.hostedPlay.socialAction.friendAdd': '已将 {name} 加入好友',
  'hudChrome.hostedPlay.details.partyRole': '队伍职责',
  'hudChrome.hostedPlay.details.partyIntent': '队伍意图',
  'hudChrome.hostedPlay.details.partyIntentTarget': '意图目标',
  'hudChrome.hostedPlay.details.lastPartyChat': '最近的队伍聊天',
  'hudChrome.hostedPlay.groupMode.acceptInvite': '正在接受队伍邀请',
  'hudChrome.hostedPlay.groupMode.assistParty': '正在协助队伍战斗',
  'hudChrome.hostedPlay.groupMode.prepareParty': '等待队伍完成战前准备',
  'hudChrome.hostedPlay.groupMode.recoverParty': '等待队伍恢复',
  'hudChrome.hostedPlay.partyRole.healer': '治疗',
  'hudChrome.hostedPlay.partyRole.dps': '伤害输出',
  'hudChrome.hostedPlay.partyIntent.routePlan': '路线规划',
  'hudChrome.hostedPlay.partyIntent.buffs': '增益与战前准备',
  'hudChrome.hostedPlay.partyIntent.focus': '集火',
  'hudChrome.hostedPlay.partyIntent.praise': '表扬',
  'hudChrome.hostedPlay.partyIntent.correction': '纠正',
  'hudChrome.hostedPlay.partyIntent.recovery': '恢复',
  'hudChrome.hostedPlay.partyBehavior.advance': '推进',
  'hudChrome.hostedPlay.partyBehavior.prepare': '准备',
  'hudChrome.hostedPlay.partyBehavior.assist': '支援',
  'hudChrome.hostedPlay.partyBehavior.celebrate': '庆祝',
  'hudChrome.hostedPlay.partyBehavior.regroup': '重新集结',
  'hudChrome.hostedPlay.partyBehavior.recover': '恢复',
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
  'hudChrome.hostedPlay.autoInviteNearbyLabel': '自動邀請附近玩家',
  'hudChrome.hostedPlay.autoInviteTargetPartySizeLabel': '自動邀請目標隊伍人數',
  'hudChrome.hostedPlay.autoInviteTargetPartySizeAria': '邀請到隊伍達到 {count} 人',
  'hudChrome.hostedPlay.serverRestartRequired':
    '託管後端還是舊版本，重新啟動本地連線服務後這個開關才會生效。',
  'hudChrome.hostedPlay.groupMode.inviteNearby': '正在邀請附近玩家',
  'hudChrome.hostedPlay.partyMode.preferGroup': '優先組隊',
  'hudChrome.hostedPlay.socialAction.friendAdd': '已將 {name} 加入好友',
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
  'hudChrome.hostedPlay.log.leaveDungeonForQuest':
    '자동 플레이: {quest} 보고를 위해 던전에서 나가는 중.',
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
  'hudChrome.hostedPlay.log.leaveDungeonForQuest':
    '自動プレイ: {quest} の報告のためダンジョンを離れています。',
};

const hostedPlayPtBR: LocaleSupplement = {
  'hudChrome.hostedPlay.actionLogLabel': 'Registro de acoes',
  'hudChrome.hostedPlay.log.accept': 'Jogo assistido: indo aceitar {quest}.',
  'hudChrome.hostedPlay.log.questWork': 'Jogo assistido: avancando em {quest}.',
  'hudChrome.hostedPlay.log.turnIn': 'Jogo assistido: indo entregar {quest}.',
  'hudChrome.hostedPlay.log.resupply': 'Jogo assistido: indo a um vendedor para reabastecer.',
  'hudChrome.hostedPlay.log.upgrade':
    'Jogo assistido: indo a um vendedor para comprar uma melhoria.',
  'hudChrome.hostedPlay.log.grind': 'Jogo assistido: ganhando experiencia.',
  'hudChrome.hostedPlay.log.recover': 'Jogo assistido: recuperando entre combates.',
  'hudChrome.hostedPlay.log.retreat': 'Jogo assistido: recuando para uma area segura.',
  'hudChrome.hostedPlay.log.release': 'Jogo assistido: liberando o espirito.',
  'hudChrome.hostedPlay.log.gatherParty': 'Jogo assistido: reunindo um grupo para {quest}.',
  'hudChrome.hostedPlay.log.leaveDungeon': 'Jogo assistido: saindo de {dungeon}.',
  'hudChrome.hostedPlay.log.leaveDungeonForQuest':
    'Jogo assistido: saindo da masmorra para entregar {quest}.',
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
  'hudChrome.hostedPlay.log.leaveDungeonForQuest':
    'Автоигра: выходим из подземелья, чтобы сдать {quest}.',
};

const forkAiZhTW: LocaleSupplement = {
  'hudChrome.keybinds.inspect': '檢視附近',
  'hudChrome.aiQuestion.recent': '最近聽到什麼了嗎？',
  'hudChrome.aiQuestion.rumor': '這裡有什麼傳聞嗎？',
  'hudChrome.aiQuestion.place': '你注意到這裡有什麼異常？',
  'hudChrome.aiQuestion.questHint': '對我目前的任務有什麼建議？',
  'hudChrome.aiReaction.approach': '有興趣',
  'hudChrome.aiReaction.avoid': '不安',
  'hudChrome.aiReaction.inspect': '觀察中',
  'hudChrome.aiReaction.thinking': '思考中',
  'hudChrome.aiError.responseFailed': 'AI 回應失敗：{reason}',
  'hudChrome.aiError.responseRejected': 'AI 響應被拒絕：{reason}',
  'hudChrome.aiSpeech.brotherAldricAwake': '今晚死者不得安寧。把你的日誌收好，{playerName}。',
  'hudChrome.aiSpeech.merchantMarketPulse':
    '硬幣跑得比傳聞快，{playerName}，但傳聞留下的腳印更清楚。',
  'hudChrome.aiSpeech.genericNpcAwake': '{speakerName}打量著道路，隨後帶著新的注意力轉向你。',
  'hudChrome.aiSpeech.marshalRedbrookAwake':
    '{speakerName}掃視廣場，像在看一張隨時會出事的地圖，然後盯住你，{playerName}。',
  'hudChrome.aiSpeech.traderWilkesAwake':
    '{speakerName}先註意到你的背包，才看見你的臉，隨後露出像在算帳一樣的笑。',
  'hudChrome.aiSpeech.apothecaryLinAwake':
    '{speakerName}正按氣味和危險性分類葉片，你的影子越過了桌面。',
  'hudChrome.aiSpeech.fishermanBrandtAwake': '{speakerName}越過你傾聽水面，彷彿湖水先打斷了談話。',
  'hudChrome.aiSpeech.foremanOdellAwake': '{speakerName}話裡帶著塵土，望著通往礦洞的路。',
  'hudChrome.aiSpeech.rangerElwynAwake': '{speakerName}豎起兩根手指示意安靜，追蹤著林線外的動靜。',
  'hudChrome.aiSpeech.wardenFenwickAwake': '{speakerName}先看橋，再來看蘆葦，最後才看你。',
  'hudChrome.aiSpeech.provisionerHaleAwake':
    '{speakerName}掂量你的靴子、背包和天氣，才判斷你需要什麼。',
  'hudChrome.aiSpeech.herbalistYaraAwake': '{speakerName}一隻手靠近包好的藥膏，一隻眼盯著灌木叢。',
  'hudChrome.aiSpeech.captainThessalyAwake': '{speakerName}從城牆上望下，像是在估算它還能撐多久。',
  'hudChrome.aiSpeech.quartermasterBreeAwake':
    '{speakerName}低聲清點短缺，然後把你也算進了這筆帳。',
  'hudChrome.aiSpeech.armorerHodeAwake': '{speakerName}用拇指試了試刃口，又用同樣的眼神打量你。',
  'hudChrome.aiSpeech.itemInterestApproach': '{speakerName}注意到{itemName}，向前挪近了一點。',
  'hudChrome.aiSpeech.itemInterestAvoid': '{speakerName}從{itemName}旁退開。',
  'hudChrome.aiSpeech.itemInterestInspect': '{speakerName}帶著戒心細看{itemName}。',
  'hudChrome.aiSpeech.singularityApproach':
    '{speakerName}的反應和其他人不同，帶著奇怪的專注守住{itemName}。',
  'hudChrome.aiSpeech.singularityAvoid':
    '{speakerName}僵住了，隨後帶著幾乎私人的恐懼從{itemName}旁退開。',
  'hudChrome.aiSpeech.singularityInspect':
    '{speakerName}過度仔細地盯著{itemName}，彷彿正在形成一段記憶。',
  'hudChrome.aiSpeech.singularityFoodFixated':
    '{speakerName}朝{itemName}挪近，像是飢餓學會了一個名字。',
  'hudChrome.aiSpeech.singularityCollector': '{speakerName}用一種私密而佔有的沉默看著{itemName}。',
  'hudChrome.aiSpeech.singularityOmenSensitive':
    '{speakerName}在{itemName}前遲疑，像聽見了別人聽不見的預兆。',
  'hudChrome.aiSpeech.singularityCowardly':
    '{speakerName}從{itemName}旁猛地退開，恐懼幾乎像認得它。',
  'hudChrome.aiSpeech.singularityTerritorial':
    '{speakerName}擋在地面和{itemName}之間，宣稱這一刻屬於自己。',
  'hudChrome.aiSpeech.singularityVengeful':
    '{speakerName}盯住{itemName}，像終於找到舊日羞辱的來源了。',
  'hudChrome.aiSpeech.singularityStargazer':
    '{speakerName}從{itemName}望向天空，被某種遼闊的東西分了神。',
  'hudChrome.aiSpeech.singularityRemembersPlayer':
    '{speakerName}對{itemName}的反應像是已經認出你的模式，{playerName}。',
  'hudChrome.aiSpeech.singularityRemembersScene':
    '{speakerName}又一次在這裡注意到你，{playerName}，它看著你，彷彿這片場景本身留下了痕跡。',
  'hudChrome.aiSpeech.singularityAliasFoodFixated': '被飢餓命名的{baseName}',
  'hudChrome.aiSpeech.singularityAliasCollector': '飾物眼的{baseName}',
  'hudChrome.aiSpeech.singularityAliasOmenSensitive': '觸兆的{baseName}',
  'hudChrome.aiSpeech.singularityAliasCowardly': '受驚的{baseName}',
  'hudChrome.aiSpeech.singularityAliasTerritorial': '佔巢的{baseName}',
  'hudChrome.aiSpeech.singularityAliasVengeful': '懷恨的{baseName}',
  'hudChrome.aiSpeech.singularityAliasStargazer': '觀星的{baseName}',
  'hudChrome.aiSpeech.singularityAliasDefault': '覺醒的{baseName}',
  'hudChrome.aiSpeech.companionUndeadFear':
    '{companionName}緊貼著你，就連{speakerName}也注意到了這片地方裡的恐懼。',
  'hudChrome.aiSpeech.companionSelfUndeadFear':
    '{companionName}貼得更近了，對空氣裡的死亡感到不安。',
  'hudChrome.aiSpeech.companionSelfRainTired': '{companionName}甩掉雨水，看起來想找個地方避一避。',
  'hudChrome.aiSpeech.companionSelfStarrySky': '{companionName}抬頭停了一口氣，被星光吸引住了。',
  'hudChrome.aiSpeech.companionSelfNightNervous': '{companionName}不停瞥向黑暗深處。',
  'hudChrome.aiSpeech.companionSelfDemonDefiance':
    '{companionName}迎著不安靠近，幾乎像是在享受這股有序的氣息。',
  'hudChrome.aiSpeech.companionSelfUndeadDayHollow': '{companionName}在活人的日光下顯得更空薄。',
  'hudChrome.aiSpeech.companionSelfBeastScentUneasy':
    '{companionName}貼近地面，火、血或舊日亡者的氣味讓它不安。',
  'hudChrome.aiSpeech.companionSelfMurlocWaterCall':
    '{companionName}朝潮濕的空氣豎起精神，聽見了別人只當作天氣的水聲。',
  'hudChrome.aiSpeech.companionSelfSpiderStillness':
    '{companionName}變得極為靜止，透過細微動靜讀取霧氣。',
  'hudChrome.aiSpeech.companionSelfElementalResonance':
    '{companionName}周圍的空氣回應天氣，發出低沉而陌生的共鳴。',
  'hudChrome.aiSpeech.companionSelfDragonkinWatch':
    '{companionName}打量高處和古老石面，帶著像是繼承而來的耐心。',
  'hudChrome.aiSpeech.companionSelfMortalSafeHaven':
    '{companionName}在這片安全地的日光裡放鬆下來，但仍盯著出口。',
  'hudChrome.aiSpeech.sceneDemonCompanionUnease':
    '{speakerName}始終留意著{companionName}；那樣的影子會改變一間屋子。',
  'hudChrome.aiSpeech.sceneUndeadCompanionUnease':
    '{speakerName}因{companionName}而繃緊，讀出了它周圍的寂靜。',
  'hudChrome.aiSpeech.sceneUndeadPressure': '{speakerName}壓低聲音，對近在咫尺的亡者感到不安。',
  'hudChrome.aiSpeech.sceneRainWeariness': '雨水掛在{speakerName}肩上；回答也比平常短了些。',
  'hudChrome.aiSpeech.sceneFogUnease': '{speakerName}說話間仍不斷看向霧裡。',
  'hudChrome.aiSpeech.sceneClearNightAwe': '{speakerName}開口前偷看了一眼星空。',
  'hudChrome.aiSpeech.sceneDayEnergy': '{speakerName}在日光下顯得更清醒。',
  'hudChrome.aiSpeech.sceneNightFatigue': '{speakerName}的聲音因深夜倦意而放輕。',
  'hudChrome.aiSpeech.familySceneApproach':
    '{speakerName}對這地方本身起了反應，像是地面說了什麼，於是挪近過來。',
  'hudChrome.aiSpeech.familySceneAvoid': '{speakerName}誤讀了空氣，從這片場景旁退開。',
  'hudChrome.aiSpeech.familySceneInspect':
    '{speakerName}靜止下來，比起你，它更在意天氣、牆面和蹤跡。',
  'hudChrome.aiSpeech.familySceneBeastUneasy':
    '{speakerName}用氣味捕捉這地方，在飢餓和謹慎之間搖擺。',
  'hudChrome.aiSpeech.familySceneUndeadDrawn':
    '{speakerName}朝空氣裡的死亡漂去，像是聽見了自己的名字。',
  'hudChrome.aiSpeech.familySceneElementalResonance': '{speakerName}以低沉的非人共鳴回應這片地方。',
  'hudChrome.aiSpeech.familySceneDemonAmused': '{speakerName}迎接這裡的恐懼，明顯感到愉悅。',
  'hudChrome.aiSpeech.memoryRecognizesPlayer':
    '{speakerName}現在認得你了，{playerName}。道路已經開始帶著你的名字。',
  'hudChrome.aiSpeech.memoryRumorEcho':
    '{speakerName}望向{itemName}。你留下的東西已經開始變成傳聞，{playerName}。',
  'hudChrome.aiSpeech.memorySingularityRumorEcho':
    '{speakerName}壓低聲音；{playerName}的{itemName}讓附近某個東西像是醒了一下。',
  'hudChrome.aiSpeech.memoryQuestRumorEcho':
    '{speakerName}聽過{questName}，{playerName}。完成的差事也會留下自己的腳印。',
  'hudChrome.aiSpeech.memoryPriestRecognizesPlayer':
    '{speakerName}現在認得你的腳步了，{playerName}。連禮拜堂的路也留著它。',
  'hudChrome.aiSpeech.memoryPriestRumorEcho':
    '{speakerName}在{itemName}和你之間來回打量，像是在衡量這是預兆還是懺悔。',
  'hudChrome.aiSpeech.memoryPriestQuestRumorEcho':
    '{speakerName}談起{questName}，像一支從一條禮拜堂小路傳到另一條路上的蠟燭。',
  'hudChrome.aiSpeech.memoryCommanderRecognizesPlayer':
    '{speakerName}已經開始把你歸入可靠見證人一類，{playerName}。',
  'hudChrome.aiSpeech.memoryCommanderRumorEcho':
    '{speakerName}把{itemName}當作報告，而不是稀奇物。',
  'hudChrome.aiSpeech.memoryCommanderQuestRumorEcho':
    '{speakerName}把{questName}當作已確認的戰地事務，並開始據此調動人手。',
  'hudChrome.aiSpeech.memoryMerchantRecognizesPlayer':
    '{speakerName}記得你，{playerName}。有來路的名字比硬幣更值錢。',
  'hudChrome.aiSpeech.memoryMerchantRumorEcho':
    '{speakerName}端詳{itemName}。到黃昏前，就會有人問是誰留下了它，又意味著什麼。',
  'hudChrome.aiSpeech.memoryMerchantQuestRumorEcho':
    '{speakerName}已經在盤算{questName}會怎樣影響路價和膽怯的買家。',
  'hudChrome.aiSpeech.memoryHerbalistRecognizesPlayer':
    '{speakerName}記得你常需要哪些藥方，{playerName}。',
  'hudChrome.aiSpeech.memoryHerbalistRumorEcho':
    '{speakerName}先用氣味，再用擔憂來研究{itemName}。',
  'hudChrome.aiSpeech.memoryHerbalistQuestRumorEcho':
    '{speakerName}說{questName}改變了本地事物的病相，即使還沒治好它。',
  'hudChrome.aiSpeech.memorySmithRecognizesPlayer':
    '{speakerName}向你點頭，{playerName}，像鐵匠憑缺口認出一把刀。',
  'hudChrome.aiSpeech.memorySmithRumorEcho':
    '{speakerName}盯著{itemName}。好鋼和怪異遺留物都會在鐵砧旁被談論。',
  'hudChrome.aiSpeech.memorySmithQuestRumorEcho':
    '{speakerName}說{questName}聽起來像是一次終於乾淨俐落收尾的活。',
  'hudChrome.aiSpeech.memoryScoutRecognizesPlayer':
    '{speakerName}已經摸清你的份量了，{playerName}：足跡、時機，全都算上。',
  'hudChrome.aiSpeech.memoryScoutRumorEcho':
    '{speakerName}瞥了一眼{itemName}，已經把它放進腦中的道路地圖。',
  'hudChrome.aiSpeech.memoryScoutQuestRumorEcho':
    '{speakerName}把{questName}標為已確認，而不是篝火旁的閒話。',
  'hudChrome.aiSpeech.memoryLoremasterRecognizesPlayer':
    '{speakerName}記得你的名字，{playerName}，並把它歸在那些未解問題旁邊。',
  'hudChrome.aiSpeech.memoryLoremasterRumorEcho':
    '{speakerName}把{itemName}當作證據研究，而不是八卦，儘管八卦會先把它帶走。',
  'hudChrome.aiSpeech.memoryLoremasterQuestRumorEcho':
    '{speakerName}把{questName}看作一條從腳註走進正文的註釋。',
  'hudChrome.aiSpeech.memoryTidewatcherRecognizesPlayer':
    '{speakerName}現在認識你了，{playerName}。你的名字已經不只一次越過水面。',
  'hudChrome.aiSpeech.memoryTidewatcherRumorEcho':
    '{speakerName}看著{itemName}，像看一圈尚未擴散的漣漪。',
  'hudChrome.aiSpeech.memoryTidewatcherQuestRumorEcho':
    '{speakerName}說{questName}已經傳到水線，而水線會重複一切。',
  'hudChrome.aiSpeech.topicRecentFirstMeet':
    '{speakerName}答得很謹慎，{playerName}。你們還談不上熟，但這地方已經有些細小動靜值得留意。',
  'hudChrome.aiSpeech.topicRecentKnown':
    '{speakerName}用一種已經開始記錄你的語氣回答，{playerName}。',
  'hudChrome.aiSpeech.topicRumorQuiet': '{speakerName}傾聽傳聞，但還沒有確切消息傳到這個角落。',
  'hudChrome.aiSpeech.topicPlace': '{speakerName}先看了看附近的道路、天氣和牆面才回答。',
  'hudChrome.aiSpeech.topicQuestHint': '{speakerName}把建議牢牢繫在日誌裡已經知道的事情上。',
  'hudChrome.aiSpeech.topicQuestNoHint': '{speakerName}目前還沒有能誠實給的線索。',
  'hudChrome.aiSpeech.objectInspectForge': '{itemName}映著爐光；金屬、汗水和路塵講著一個小故事。',
  'hudChrome.aiSpeech.objectInspectGrave': '{itemName}帶著埋葬之地的寒意，周圍的空氣彷彿在傾聽。',
  'hudChrome.aiSpeech.objectInspectLake':
    '潮濕的空氣聚到{itemName}周圍，彷彿附近的水面對此有自己的意見。',
  'hudChrome.aiSpeech.objectInspectDoor':
    '門檻有種被注視的感覺；無論裡面等著什麼，仍遵循古老的規則。',
  'hudChrome.aiSpeech.objectInspectSingularity':
    '{itemName}拒絕顯得普通；這片場景有一瞬間圍著它彎曲。',
  'hudChrome.aiSpeech.objectInspectGeneric': '你研究{itemName}。附近的場景以細小的細節回應。',
  'hudChrome.aiSpeech.sceneTraceSingularity':
    '你注意到{itemName}曾經扭轉所有註意力的位置；空氣仍像剛醒來。',
  'hudChrome.aiSpeech.sceneTraceCursed': '地面似乎仍被{itemName}標記著；連普通細節都和它保持距離。',
  'hudChrome.aiSpeech.sceneTraceFood':
    '{itemName}漸淡的氣味吸引了細小足跡，也讓附近黑暗裡的傾聽變得更尖銳。',
  'hudChrome.aiSpeech.sceneTraceValuable':
    '你看見{itemName}周圍留下的小刮痕；曾有什麼人或東西在這裡衡量過它的價值。',
  'hudChrome.aiSpeech.sceneTraceGeneric': '這地方仍在細小的擾動裡記著{itemName}。',
  'hudChrome.aiSpeech.worldTraceNpcSingularity':
    '{speakerName}研究{itemName}留下的痕跡，然後開口時像房間不再那麼空了。',
  'hudChrome.aiSpeech.worldTraceNpcCursed': '{speakerName}與{itemName}標記過的地方保持距離。',
  'hudChrome.aiSpeech.worldTraceNpcFood':
    '{speakerName}注意到{itemName}漸淡的跡象；飢餓也會留下見證。',
  'hudChrome.aiSpeech.worldTraceNpcValuable':
    '{speakerName}盯著{itemName}周圍的刮痕。價值總會教導地面學會新的紋路。',
  'hudChrome.aiSpeech.worldTraceNpcGeneric':
    '{speakerName}先讀過{itemName}周圍被擾動的細節，才開口回答。',
  'hudChrome.aiSpeech.worldDirectorUncanny': '整片區域圍著{itemName}顯得新近醒來。',
  'hudChrome.aiSpeech.worldDirectorSceneUncanny': '這地方顯得新近醒來，彷彿這裡有什麼開始認得你。',
  'hudChrome.aiSpeech.worldDirectorHaunted': '這片區域因{itemName}而維持著更冷的氣息。',
  'hudChrome.aiSpeech.worldDirectorHungry': '細小足跡和氣味圍繞著{itemName}聚成了一種飢餓的圖樣。',
  'hudChrome.aiSpeech.worldDirectorCovetous':
    '{itemName}周圍新鮮的刮痕讓這地方顯得警覺而精於算計。',
  'hudChrome.aiSpeech.worldDirectorStirred': '自從{itemName}擾動過這裡，這裡就沒有真正平靜下來。',
  'hudChrome.aiSpeech.worldDirectorQuestComplete':
    '{questName}之後，這區域輕了一些。不完全安全，但不再那麼孤單。',
  'hudChrome.aiSpeech.bossMemoryDefeated':
    '空氣仍記得{bossName}倒下的位置；這個房間看你的方式似乎變了。',
  'hudChrome.aiSpeech.bossMemoryWipe': '{bossName}的勝利仍壓在這地方；連你的影子都像記得曾經倒下。',
  'hudChrome.aiSpeech.worldDirectorBossDefeated': '這片區域仍帶著{bossName}被擊倒後的震動。',
  'hudChrome.aiSpeech.worldDirectorBossWipe': '這片區域彷彿被{bossName}最後的勝利壓彎了。',
  'hudChrome.aiSpeech.bossPhaseBloodied': '{bossName}改變了節奏，傷勢已經重到開始觀察每一個動作。',
  'hudChrome.aiSpeech.bossPhaseDesperate': '{bossName}接近崩潰，戰鬥忽然變得更加鋒利。',
  'hudChrome.aiSpeech.sceneInspectForge':
    '你看清了鍛爐：熱鐵、勞動聲，還有城鎮邊緣那一點家屋般的溫暖。',
  'hudChrome.aiSpeech.sceneInspectChapel': '你看清了廢棄禮拜堂：舊石、墓土，還有一口像被記住的鐘。',
  'hudChrome.aiSpeech.sceneInspectLake':
    '你看清了湖邊碼頭：魚腥味、開闊水面，還有天空下安靜的漣漪。',
  'hudChrome.aiSpeech.sceneInspectWatchpost':
    '你看清了哨站：有秩序的牆、視線通道，還有掠過高地的天氣。',
  'hudChrome.aiSpeech.sceneInspectCrypt':
    '你看清了墓穴入口：封閉的空氣、陳舊的血，以及一條彷彿會吞下聲音的路。',
  'hudChrome.aiSpeech.sceneInspectGeneric': '你看清了這裡：天氣、足跡和細小細節開始自行排列。',
  'hudChrome.aiSpeech.unknownItem': '某個遺留物',
  'hudChrome.aiSpeech.unknownObject': '眼前的東西',
  'hudChrome.aiSpeech.unknownCompanion': '你的同伴',
  'hudChrome.aiSpeech.unknownBoss': '這場遭遇',
  'hudChrome.aiSpeech.unknownQuest': '那件差事',
};

const forkHostedZhTW: LocaleSupplement = {
  'hudChrome.hostedPlay.details.partyRole': '黨的角色',
  'hudChrome.hostedPlay.details.partyIntent': '聚會意圖',
  'hudChrome.hostedPlay.details.partyIntentTarget': '意向目標',
  'hudChrome.hostedPlay.details.lastPartyChat': '最後一次聚會聊天',
  'hudChrome.hostedPlay.groupMode.acceptInvite': '接受聚會邀請',
  'hudChrome.hostedPlay.groupMode.assistParty': '協助黨的戰鬥',
  'hudChrome.hostedPlay.groupMode.prepareParty': '堅守備戰',
  'hudChrome.hostedPlay.groupMode.recoverParty': '為聚會恢復而舉行',
  'hudChrome.hostedPlay.partyRole.healer': '治癒者',
  'hudChrome.hostedPlay.partyRole.dps': '損害',
  'hudChrome.hostedPlay.partyIntent.routePlan': '路線圖',
  'hudChrome.hostedPlay.partyIntent.buffs': '增益和準備',
  'hudChrome.hostedPlay.partyIntent.focus': '集中火力',
  'hudChrome.hostedPlay.partyIntent.praise': '稱讚',
  'hudChrome.hostedPlay.partyIntent.correction': '更正',
  'hudChrome.hostedPlay.partyIntent.recovery': '恢復',
  'hudChrome.hostedPlay.partyBehavior.advance': '進步',
  'hudChrome.hostedPlay.partyBehavior.prepare': '準備',
  'hudChrome.hostedPlay.partyBehavior.assist': '協助',
  'hudChrome.hostedPlay.partyBehavior.celebrate': '慶祝',
  'hudChrome.hostedPlay.partyBehavior.regroup': '重組',
  'hudChrome.hostedPlay.partyBehavior.recover': '恢復',
};

const forkAiJaJP: LocaleSupplement = {
  'hudChrome.keybinds.inspect': '近くを調べる',
  'hudChrome.aiQuestion.recent': '最近何を聞きましたか？',
  'hudChrome.aiQuestion.rumor': 'この場所に関する噂はありますか？',
  'hudChrome.aiQuestion.place': 'ここで何に気づきますか？',
  'hudChrome.aiQuestion.questHint': '私の現在の仕事に対するアドバイスはありますか？',
  'hudChrome.aiReaction.approach': '興味がある',
  'hudChrome.aiReaction.avoid': '不安な',
  'hudChrome.aiReaction.inspect': '見てる',
  'hudChrome.aiReaction.thinking': '考え',
  'hudChrome.aiError.responseFailed': 'AI 応答失敗: {reason}',
  'hudChrome.aiError.responseRejected': 'AI 応答が拒否されました: {reason}',
  'hudChrome.aiSpeech.brotherAldricAwake':
    '死者たちは今夜も落ち着かない。日記を近くに置いておいてください、{playerName}。',
  'hudChrome.aiSpeech.merchantMarketPulse':
    'コインは噂{playerName}よりも速く動きますが、噂の方が良い足跡を残します。',
  'hudChrome.aiSpeech.genericNpcAwake':
    '{speakerName} は道を研究し、新たな注意を払ってあなたに向き直ります。',
  'hudChrome.aiSpeech.marshalRedbrookAwake':
    '{speakerName} は、問題が発生する可能性のあるものの地図のように正方形をスキャンし、{playerName} というあなたに注目します。',
  'hudChrome.aiSpeech.traderWilkesAwake':
    '{speakerName} はあなたの目の前の荷物に気づき、まるで両方が帳簿であるかのように微笑みました。',
  'hudChrome.aiSpeech.apothecaryLinAwake':
    '{speakerName} が香りと危険性で葉を分類していると、あなたの影がテーブルを横切った。',
  'hudChrome.aiSpeech.fishermanBrandtAwake':
    '{speakerName} は、あたかも湖が最初に中断したかのように、あなたを通り過ぎて水に向かって聞こえます。',
  'hudChrome.aiSpeech.foremanOdellAwake':
    '{speakerName}は言葉から塵を吐き出し、鉱山への道を見守ります。',
  'hudChrome.aiSpeech.rangerElwynAwake':
    '{speakerName} は 2 本の指を立てて沈黙し、森林限界を超えた何かを追跡します。',
  'hudChrome.aiSpeech.wardenFenwickAwake':
    '{speakerName} は、橋、葦、次に自分の順にチェックします。',
  'hudChrome.aiSpeech.provisionerHaleAwake':
    '{speakerName} は、何が必要かを決める前に、ブーツ、バックパック、天候の重さを量ります。',
  'hudChrome.aiSpeech.herbalistYaraAwake':
    '{speakerName} は片手を巻いた湿布の近くに置き、もう片方の目を茂みに向けます。',
  'hudChrome.aiSpeech.captainThessalyAwake':
    '{speakerName}は壁からどれくらい耐えられるかを測るかのように見下ろしています。',
  'hudChrome.aiSpeech.quartermasterBreeAwake':
    '{speakerName} は小声で不足分を数え、あなたを算数に加えます。',
  'hudChrome.aiSpeech.armorerHodeAwake':
    '{speakerName} は親指でエッジをテストし、ほぼ同じような表情を見せます。',
  'hudChrome.aiSpeech.itemInterestApproach':
    '{speakerName} は {itemName} に気づき、エッジが近づきます。',
  'hudChrome.aiSpeech.itemInterestAvoid': '{speakerName}は{itemName}から後退します。',
  'hudChrome.aiSpeech.itemInterestInspect':
    '{speakerName} は{itemName} を慎重な関心を持って研究します。',
  'hudChrome.aiSpeech.singularityApproach':
    '{speakerName} は他のものとは異なり反応し、奇妙な集中力で {itemName} を守ります。',
  'hudChrome.aiSpeech.singularityAvoid':
    '{speakerName} は固まり、ほとんど個人的な恐怖を感じて {itemName} から後ずさりします。',
  'hudChrome.aiSpeech.singularityInspect':
    '{speakerName} は、まるで思い出を作るかのように、{itemName} を注意深く観察します。',
  'hudChrome.aiSpeech.singularityFoodFixated':
    '{speakerName} は飢えが名前を覚えたかのように、{itemName} に向かって進んでいきます。',
  'hudChrome.aiSpeech.singularityCollector':
    '{speakerName} は、プライベートで独占的な静けさで {itemName} を観察します。',
  'hudChrome.aiSpeech.singularityOmenSensitive':
    '{speakerName} は、他の誰も聞いていない前兆を聞いているかのように、{itemName} で躊躇します。',
  'hudChrome.aiSpeech.singularityCowardly':
    '{speakerName} は、ほとんど個人的な恐怖を感じて、{itemName} から反動します。',
  'hudChrome.aiSpeech.singularityTerritorial':
    '{speakerName}は地面と{itemName}の間に位置し、その瞬間を主張します。',
  'hudChrome.aiSpeech.singularityVengeful':
    '{speakerName} は、古い侮辱を見つけたかのように、{itemName} を修正します。',
  'hudChrome.aiSpeech.singularityStargazer':
    '{speakerName} は{itemName} から空を眺め、広大な何かに気を取られています。',
  'hudChrome.aiSpeech.singularityRemembersPlayer':
    '{speakerName} は、今あなたのパターン {playerName} を認識しているかのように、{itemName} に反応します。',
  'hudChrome.aiSpeech.singularityRemembersScene':
    '{speakerName} は、{playerName} が再びこの場所にいることに気づき、その光景自体が痕跡を残したかのように見守ります。',
  'hudChrome.aiSpeech.singularityAliasFoodFixated': '飢餓という名の{baseName}',
  'hudChrome.aiSpeech.singularityAliasCollector': 'トリンケットアイド {baseName}',
  'hudChrome.aiSpeech.singularityAliasOmenSensitive': '前兆に触れた {baseName}',
  'hudChrome.aiSpeech.singularityAliasCowardly': 'びっくり{baseName}',
  'hudChrome.aiSpeech.singularityAliasTerritorial': '巣を主張する {baseName}',
  'hudChrome.aiSpeech.singularityAliasVengeful': '恨みを抱く {baseName}',
  'hudChrome.aiSpeech.singularityAliasStargazer': 'スターウォッチング {baseName}',
  'hudChrome.aiSpeech.singularityAliasDefault': '覚醒 {baseName}',
  'hudChrome.aiSpeech.companionUndeadFear':
    '{companionName} は近くにいます。 {speakerName}でさえ、この場所の恐怖に気づいています。',
  'hudChrome.aiSpeech.companionSelfUndeadFear':
    '{companionName} は空中に死者がいるのに不安を感じながら、近づきました。',
  'hudChrome.aiSpeech.companionSelfRainTired':
    '{companionName} は雨を振り払い、避難の準備ができているようです。',
  'hudChrome.aiSpeech.companionSelfStarrySky':
    '{companionName} は星空を眺めながら息を呑むように見上げます。',
  'hudChrome.aiSpeech.companionSelfNightNervous': '{companionName}は暗闇を見つめ続けます。',
  'hudChrome.aiSpeech.companionSelfDemonDefiance':
    '{companionName} は不安に傾き、秩序ある空気にほとんど満足している。',
  'hudChrome.aiSpeech.companionSelfUndeadDayHollow':
    '{companionName}は明るい光の下では薄く見えます。',
  'hudChrome.aiSpeech.companionSelfBeastScentUneasy':
    '{companionName} は地面近くまで下がり、火、血、空中の古い死者によって落ち着かない。',
  'hudChrome.aiSpeech.companionSelfMurlocWaterCall':
    '{companionName} は湿った空気を好み、他の人が天気だけを聞くのに水の音が聞こえます。',
  'hudChrome.aiSpeech.companionSelfSpiderStillness':
    '{companionName} は非常に静止しており、小さな動きを通して霧を読み取っています。',
  'hudChrome.aiSpeech.companionSelfElementalResonance':
    '{companionName} の周囲の空気は、低く奇妙な響きで天気に応えます。',
  'hudChrome.aiSpeech.companionSelfDragonkinWatch':
    '{companionName} は、受け継がれていると感じる忍耐力で高さと古い石を研究します。',
  'hudChrome.aiSpeech.companionSelfMortalSafeHaven':
    '{companionName} はこの安全な場所で日中は落ち着きますが、出口を見守り続けます。',
  'hudChrome.aiSpeech.sceneDemonCompanionUnease':
    '{speakerName} は{companionName} に目を離しません。そんな影が部屋を変える。',
  'hudChrome.aiSpeech.sceneUndeadCompanionUnease':
    '{speakerName}は{companionName}で固まり、周囲の沈黙を読みます。',
  'hudChrome.aiSpeech.sceneUndeadPressure':
    '{speakerName}は死者が近くにいることに不安を感じて声を低くした。',
  'hudChrome.aiSpeech.sceneRainWeariness':
    '{speakerName} の肩に雨粒が降り注ぐ。答えはいつもより短くなります。',
  'hudChrome.aiSpeech.sceneFogUnease': '{speakerName}は言葉の間の霧を見つめ続けます。',
  'hudChrome.aiSpeech.sceneClearNightAwe': '{speakerName}は話す前に星をちらっと見る。',
  'hudChrome.aiSpeech.sceneDayEnergy': '{speakerName}は日光の下でより鮮明に見えます。',
  'hudChrome.aiSpeech.sceneNightFatigue': '{speakerName}の声は深夜の疲れで柔らかくなった。',
  'hudChrome.aiSpeech.familySceneApproach':
    '{speakerName} はその場所そのものに反応し、地面が何かを言っているかのようにじりじりと近づいていきます。',
  'hudChrome.aiSpeech.familySceneAvoid':
    '{speakerName}は空気を読み間違え、その場から後ずさりする。',
  'hudChrome.aiSpeech.familySceneInspect':
    '{speakerName} は、あなたよりも天気、壁、線路を観察しながら、じっとしています。',
  'hudChrome.aiSpeech.familySceneBeastUneasy':
    '{speakerName}は匂いでその場所を把握し、空腹と警戒の間を行き来します。',
  'hudChrome.aiSpeech.familySceneUndeadDrawn':
    '{speakerName}は自らの名を聞いたかのように空中を死に向かって漂っています。',
  'hudChrome.aiSpeech.familySceneElementalResonance':
    '{speakerName}は低く、非人間的な響きでその場所に答えます。',
  'hudChrome.aiSpeech.familySceneDemonAmused':
    '{speakerName} はこの場所の恐怖に身を乗り出し、明らかに満足している。',
  'hudChrome.aiSpeech.memoryRecognizesPlayer':
    '{speakerName} があなたを認識しました、{playerName}。道路があなたの名前を伝え始めました。',
  'hudChrome.aiSpeech.memoryRumorEcho':
    '{speakerName}は{itemName}の方を見つめます。あなたが残したものの言葉はすでに動き始めています、{playerName}。',
  'hudChrome.aiSpeech.memorySingularityRumorEcho':
    '{speakerName} は声を低くします。 {playerName} の {itemName} により、近くの何かが起きているように見えました。',
  'hudChrome.aiSpeech.memoryQuestRumorEcho':
    '{speakerName} は {questName}、{playerName} について聞いています。完成した作品は独自の軌跡を残します。',
  'hudChrome.aiSpeech.memoryPriestRecognizesPlayer':
    '{speakerName} はあなたの今のステップを知っています、{playerName}。チャペルロードでもそれが保たれています。',
  'hudChrome.aiSpeech.memoryPriestRumorEcho':
    '{speakerName} は、それが前兆か告白かを天秤にかけているかのように、{itemName} からあなたを見つめます。',
  'hudChrome.aiSpeech.memoryPriestQuestRumorEcho':
    '{speakerName} は、礼拝堂の道から別の礼拝堂へ運ばれるろうそくのように、{questName} について語ります。',
  'hudChrome.aiSpeech.memoryCommanderRecognizesPlayer':
    '{speakerName} は、信頼できる証人である {playerName} の下であなたを告発し始めました。',
  'hudChrome.aiSpeech.memoryCommanderRumorEcho':
    '{speakerName} は、{itemName} を好奇心ではなくレポートとしてマークします。',
  'hudChrome.aiSpeech.memoryCommanderQuestRumorEcho':
    '{speakerName} は {questName} を確認済みのフィールドワークとして扱い、その周りで人々を動かし始めます。',
  'hudChrome.aiSpeech.memoryMerchantRecognizesPlayer':
    '{speakerName} はあなたのことを覚えています、{playerName}。痕跡のある名前はコイン以上の価値があります。',
  'hudChrome.aiSpeech.memoryMerchantRumorEcho':
    '{speakerName}は{itemName}を勉強します。夕暮れまでに、誰がそれを残したのか、そしてそれが何を意味するのかを誰かが尋ねるでしょう。',
  'hudChrome.aiSpeech.memoryMerchantQuestRumorEcho':
    '{speakerName} は、{questName} が路線価と神経質な買い手にどのような影響を与えるかをすでに考慮しています。',
  'hudChrome.aiSpeech.memoryHerbalistRecognizesPlayer':
    '{speakerName} は、あなたが常に必要とする治療法を覚えています、{playerName}。',
  'hudChrome.aiSpeech.memoryHerbalistRumorEcho':
    '{speakerName} は {itemName} を最初に香りで、次に心配で勉強します。',
  'hudChrome.aiSpeech.memoryHerbalistQuestRumorEcho':
    '{speakerName} は、{questName} が局所的な病気を治さないにしても、その病気を変えたと言いました。',
  'hudChrome.aiSpeech.memorySmithRecognizesPlayer':
    '{speakerName} は、{playerName} にうなずきます。まるで鍛冶屋が刃の傷を見て認識するように。',
  'hudChrome.aiSpeech.memorySmithRumorEcho':
    '{speakerName}目{itemName}。良い鋼材と奇妙な残材はどちらも金床で話題になります。',
  'hudChrome.aiSpeech.memorySmithQuestRumorEcho':
    '{speakerName} は、{questName} が仕事を初めてきれいに終えた音を出したと言っています。',
  'hudChrome.aiSpeech.memoryScoutRecognizesPlayer':
    '{speakerName} にはメジャーが表示され、{playerName}: トラック、タイミング、その他すべてが表示されます。',
  'hudChrome.aiSpeech.memoryScoutRumorEcho':
    '{speakerName} は {itemName} を一目見て、すでにそれを心の中の道路地図上に置きます。',
  'hudChrome.aiSpeech.memoryScoutQuestRumorEcho':
    '{speakerName} はキャンプファイヤーの騒音ではなく、{questName} を確認済みとしてマークします。',
  'hudChrome.aiSpeech.memoryLoremasterRecognizesPlayer':
    '{speakerName} はあなたの名前、{playerName} を記憶し、未回答の質問の横にファイルします。',
  'hudChrome.aiSpeech.memoryLoremasterRumorEcho':
    '{speakerName} はゴシップではなく証拠として {itemName} を研究しますが、ゴシップが最初にそれを運びます。',
  'hudChrome.aiSpeech.memoryLoremasterQuestRumorEcho':
    '{speakerName}は{questName}を本文に踏み込んだ脚注として扱います。',
  'hudChrome.aiSpeech.memoryTidewatcherRecognizesPlayer':
    '{speakerName} は今、{playerName} のことを知っています。あなたの名前は何度も海を渡ってきました。',
  'hudChrome.aiSpeech.memoryTidewatcherRumorEcho':
    '{speakerName}は広がり終わらない波紋のように{itemName}を見つめます。',
  'hudChrome.aiSpeech.memoryTidewatcherQuestRumorEcho':
    '{speakerName} は、{questName} が水線に到達したと言い、水線はすべてを繰り返します。',
  'hudChrome.aiSpeech.topicRecentFirstMeet':
    '{speakerName} は答えを慎重に保ちます、{playerName}。あなたたちはお互いに初めてですが、その場所にはすでに注目に値する小さな兆候があります。',
  'hudChrome.aiSpeech.topicRecentKnown':
    '{speakerName} は、あなたのことを追跡し始めた誰か、{playerName} の口調で答えます。',
  'hudChrome.aiSpeech.topicRumorQuiet':
    '{speakerName} はゴシップに耳を傾けていますが、確かなことはまだこのコーナーに届いていません。',
  'hudChrome.aiSpeech.topicPlace': '{speakerName} は答える前に近くの道路、天気、壁を調べます。',
  'hudChrome.aiSpeech.topicQuestHint':
    '{speakerName} は、ジャーナルがすでに知っていることに関連付けられたアドバイスを維持します。',
  'hudChrome.aiSpeech.topicQuestNoHint':
    '{speakerName} には、あなたの現在の仕事に対する正当な手がかりがまだありません。',
  'hudChrome.aiSpeech.objectInspectForge':
    '{itemName} は鍛冶の光をキャッチします。金属、汗、道路の埃が小さな物語を語ります。',
  'hudChrome.aiSpeech.objectInspectGrave':
    '{itemName} は埋もれた場所の冷たさを運び、その周りの空気はそれを聞いているようです。',
  'hudChrome.aiSpeech.objectInspectLake':
    'まるで近くの水に意見があるかのように、湿った空気が{itemName}の周りに集まります。',
  'hudChrome.aiSpeech.objectInspectDoor':
    '敷居が監視されているように感じます。その先に待つものは依然として古いルールに従います。',
  'hudChrome.aiSpeech.objectInspectSingularity':
    '{itemName}は普通だと感じることを拒否します。シーンは一呼吸置くためにその周りに曲がります。',
  'hudChrome.aiSpeech.objectInspectGeneric':
    'あなたは{itemName}を勉強します。近くの現場が細かい部分まで答えてくれる。',
  'hudChrome.aiSpeech.sceneTraceSingularity':
    'あなたは、{itemName} がみんなの注意をそらした場所に気づきました。空気はまだ目覚めたばかりのように感じます。',
  'hudChrome.aiSpeech.sceneTraceCursed':
    '地面にはまだ {itemName} の跡が残っているようです。ありきたりな細部さえも距離を保ちます。',
  'hudChrome.aiSpeech.sceneTraceFood':
    '{itemName} の消えゆく匂いが小さな跡を描き、近くの暗闇からより鮮明に聞こえます。',
  'hudChrome.aiSpeech.sceneTraceValuable':
    '{itemName} あたりに小さな擦り傷が残っているのがわかります。誰かまたは何かがここでその価値を評価しました。',
  'hudChrome.aiSpeech.sceneTraceGeneric':
    'この場所は今でも{itemName}のことを、小さな乱れた細部で覚えています。',
  'hudChrome.aiSpeech.worldTraceNpcSingularity':
    '{speakerName} は、{itemName} が残した痕跡を研究し、あたかも部屋が空っぽになったかのように話します。',
  'hudChrome.aiSpeech.worldTraceNpcCursed':
    '{speakerName} は、{itemName} がシーンをマークした場所から距離を保ちます。',
  'hudChrome.aiSpeech.worldTraceNpcFood':
    '{speakerName} は{itemName} の消えゆく気配に気づきます。飢えさえも目撃者を残します。',
  'hudChrome.aiSpeech.worldTraceNpcValuable':
    '{speakerName}は{itemName}の周りの擦り傷に目をつけます。価値観は常に地面に新しいパターンを教えます。',
  'hudChrome.aiSpeech.worldTraceNpcGeneric':
    '{speakerName} は、答える前に {itemName} 周辺の乱れた詳細を読みます。',
  'hudChrome.aiSpeech.worldDirectorUncanny':
    '{itemName}頃にはエリア全体が新たに目覚めたように感じられます。',
  'hudChrome.aiSpeech.worldDirectorSceneUncanny':
    'まるでここの何かがあなたを認識し始めたかのように、その場所は新しく目覚めたように感じられます。',
  'hudChrome.aiSpeech.worldDirectorHaunted': '{itemName}付近では、さらに寒い雰囲気が続いています。',
  'hudChrome.aiSpeech.worldDirectorHungry':
    '小さな足跡と匂いが {itemName} あたりに集まって空腹のパターンになります。',
  'hudChrome.aiSpeech.worldDirectorCovetous':
    '{itemName} の周りの新鮮な擦り傷は、その場所に用心深さと計算高さを感じさせます。',
  'hudChrome.aiSpeech.worldDirectorStirred':
    '{itemName}が邪魔をして以来、その場所は解決していません。',
  'hudChrome.aiSpeech.worldDirectorQuestComplete':
    '{questName} の後、その領域は明るく感じられます。正確には安全ではありませんが、孤独ではなくなります。',
  'hudChrome.aiSpeech.bossMemoryDefeated':
    '空気はまだ{bossName}がどこに落ちたかを知っています。部屋はあなたを違って見ているようです。',
  'hudChrome.aiSpeech.bossMemoryWipe':
    '{bossName} の勝利はまだこの場所に迫っています。あなたの影さえ落ちたことを覚えているようです。',
  'hudChrome.aiSpeech.worldDirectorBossDefeated':
    'この地域には{bossName}が倒された衝撃が伝わってきます。',
  'hudChrome.aiSpeech.worldDirectorBossWipe':
    'このエリアは、{bossName} の最後の勝利を中心に曲がっているように感じられます。',
  'hudChrome.aiSpeech.bossPhaseBloodied':
    '{bossName} はリズムを変え、あらゆる動きを監視し始めるほど傷を負っています。',
  'hudChrome.aiSpeech.bossPhaseDesperate':
    '{bossName} がブレイクに近づき、戦闘が急に鋭くなったように感じられます。',
  'hudChrome.aiSpeech.sceneInspectForge':
    '熱い鉄、仕事の騒音、家のような温かい町の端など、鍛冶場を満喫します。',
  'hudChrome.aiSpeech.sceneInspectChapel':
    'あなたは、古い石、墓の土、そして思い出を感じる鐘など、荒廃した礼拝堂を見学します。',
  'hudChrome.aiSpeech.sceneInspectLake':
    '湖の波止場で魚の匂い、広々とした水面、そして空の下の静かな波紋を満喫します。',
  'hudChrome.aiSpeech.sceneInspectWatchpost':
    '監視塔を観察すると、整然とした壁、視線、高台の上を移動する天候が観察されます。',
  'hudChrome.aiSpeech.sceneInspectCrypt':
    '地下室の入り口に入ると、密閉された空気、古い血、そして音を飲み込むかのような道が広がっています。',
  'hudChrome.aiSpeech.sceneInspectGeneric':
    'あなたはその場に身を置き、天気、軌跡、そして細かいディテールが自動的に調整され始めます。',
  'hudChrome.aiSpeech.unknownItem': '何かが残された',
  'hudChrome.aiSpeech.unknownObject': 'あなたの目の前にあるもの',
  'hudChrome.aiSpeech.unknownCompanion': 'あなたの仲間',
  'hudChrome.aiSpeech.unknownBoss': '出会い',
  'hudChrome.aiSpeech.unknownQuest': 'その仕事',
};

const forkHostedJaJP: LocaleSupplement = {
  'hudChrome.hostedPlay.menuButton': '主催プレイ',
  'hudChrome.hostedPlay.title': '主催プレイ',
  'hudChrome.hostedPlay.statusLabel': '状態',
  'hudChrome.hostedPlay.objectiveLabel': '客観的',
  'hudChrome.hostedPlay.resumeOnLogin': 'ログイン時に再開',
  'hudChrome.hostedPlay.autoInviteNearbyLabel': '近くのプレイヤーを自動招待',
  'hudChrome.hostedPlay.autoInviteTargetPartySizeLabel': '自動招待対象パーティーの規模',
  'hudChrome.hostedPlay.autoInviteTargetPartySizeAria':
    'パーティーのプレイヤーが{count}になるまで招待します',
  'hudChrome.hostedPlay.partyModeLabel': 'パーティーモード',
  'hudChrome.hostedPlay.partyModeStatusLabel': 'パーティーの振る舞い',
  'hudChrome.hostedPlay.groupModeLabel': '現在のグループの状態',
  'hudChrome.hostedPlay.groupLeaderLabel': 'グループリーダー',
  'hudChrome.hostedPlay.groupLeaderDistanceLabel': 'リーダーの距離',
  'hudChrome.hostedPlay.socialPendingRepliesLabel': '保留中の返信',
  'hudChrome.hostedPlay.socialFriendsLabel': '友達',
  'hudChrome.hostedPlay.socialBlocksLabel': 'ブロックされたプレイヤー',
  'hudChrome.hostedPlay.lastWhisperFromLabel': '最後のささやきから',
  'hudChrome.hostedPlay.lastSocialActionLabel': '最後の社会活動',
  'hudChrome.hostedPlay.llmEnabledLabel': 'LLM オーバーレイ',
  'hudChrome.hostedPlay.llmPlanModeLabel': 'LLMソーシャルモード',
  'hudChrome.hostedPlay.llmPlanFocusLabel': 'LLM フォーカス',
  'hudChrome.hostedPlay.llmReplyLabel': 'LLM 返信',
  'hudChrome.hostedPlay.llmReplyTargetLabel': 'LLM 返信ターゲット',
  'hudChrome.hostedPlay.pauseLabel': '一時停止の理由',
  'hudChrome.hostedPlay.errorLabel': 'ランタイム',
  'hudChrome.hostedPlay.loadingStatus': 'ホストプレイのステータスを読み込んでいます...',
  'hudChrome.hostedPlay.statusLoadFailed': '現在、ホストプレイのステータスを読み込めませんでした。',
  'hudChrome.hostedPlay.updateFailed': '現在ホストプレイを更新できませんでした。',
  'hudChrome.hostedPlay.settingsSaveFailed': '現在、ホストプレイ設定を保存できませんでした。',
  'hudChrome.hostedPlay.serverRestartRequired':
    'ホスト型プレイでは、この切り替えが機能する前にローカル サーバーを再起動する必要があります。',
  'hudChrome.hostedPlay.objectiveNone': 'アクティブな目標がありません',
  'hudChrome.hostedPlay.enable': 'ホスト型プレイを有効にする',
  'hudChrome.hostedPlay.disable': 'ホスト型プレイを無効にする',
  'hudChrome.hostedPlay.refresh': 'リフレッシュ',
  'hudChrome.hostedPlay.runtimeIssue': '自動化によりランタイムの問題が発生しました。',
  'hudChrome.hostedPlay.details.show': '詳細を見る',
  'hudChrome.hostedPlay.details.hide': '詳細を隠す',
  'hudChrome.hostedPlay.details.title': '主催プレイの詳細',
  'hudChrome.hostedPlay.details.empty': 'ホストプレイ診断はまだ利用できません。',
  'hudChrome.hostedPlay.details.unavailable': '利用不可',
  'hudChrome.hostedPlay.details.sectionBrain': '脳',
  'hudChrome.hostedPlay.details.sectionMovement': '動き',
  'hudChrome.hostedPlay.details.sectionParty': 'パーティー',
  'hudChrome.hostedPlay.details.sectionSocial': '社交',
  'hudChrome.hostedPlay.details.sectionLlmSocial': 'LLMソーシャル',
  'hudChrome.hostedPlay.details.lastBrain': 'ラストブレインティック',
  'hudChrome.hostedPlay.details.lastAutomation': '最後の自動化チェック',
  'hudChrome.hostedPlay.details.objectiveId': '目標ID',
  'hudChrome.hostedPlay.details.objectiveLabel': '目的のラベル',
  'hudChrome.hostedPlay.details.objectiveQuest': 'クエストID',
  'hudChrome.hostedPlay.details.objectiveDungeon': 'ダンジョンID',
  'hudChrome.hostedPlay.details.partySize': '推奨されるパーティーの規模',
  'hudChrome.hostedPlay.details.objectiveSince': '以来の目標',
  'hudChrome.hostedPlay.details.lastProgress': '前回の進捗状況',
  'hudChrome.hostedPlay.details.lastError': '最後のエラー',
  'hudChrome.hostedPlay.details.brainDrivePaused': 'ブレインドライブが一時停止されました',
  'hudChrome.hostedPlay.details.facing': '対面',
  'hudChrome.hostedPlay.details.pathLength': '経路長',
  'hudChrome.hostedPlay.details.nextPathPoint': '次のパスポイント',
  'hudChrome.hostedPlay.details.campIndex': 'キャンプインデックス',
  'hudChrome.hostedPlay.details.noTargetSince': 'それ以来ターゲットがありません',
  'hudChrome.hostedPlay.details.stuckResets': 'スタックリセット',
  'hudChrome.hostedPlay.details.travelGoal': '旅行の目標',
  'hudChrome.hostedPlay.details.moveInput': '入力の移動',
  'hudChrome.hostedPlay.details.commands': 'コマンド',
  'hudChrome.hostedPlay.details.lastCommandAges': '最近のコマンドの年齢',
  'hudChrome.hostedPlay.details.groupMode': 'グループモード',
  'hudChrome.hostedPlay.details.groupLeader': 'グループリーダー',
  'hudChrome.hostedPlay.details.groupDistance': 'グループの距離',
  'hudChrome.hostedPlay.details.partyPaused': 'パーティー一時停止脳',
  'hudChrome.hostedPlay.details.partyRole': 'パーティーの役割',
  'hudChrome.hostedPlay.details.partyIntent': 'パーティーの意図',
  'hudChrome.hostedPlay.details.partyIntentTarget': 'インテントターゲット',
  'hudChrome.hostedPlay.details.lastPartyChat': '最後のパーティーチャット',
  'hudChrome.hostedPlay.details.llmEnabled': 'LLM を有効にする',
  'hudChrome.hostedPlay.details.llmPending': '保留中',
  'hudChrome.hostedPlay.details.llmStatus': '状態',
  'hudChrome.hostedPlay.details.llmProvider': 'プロバイダー',
  'hudChrome.hostedPlay.details.llmLatency': 'レイテンシー',
  'hudChrome.hostedPlay.details.llmCacheHit': 'キャッシュヒット',
  'hudChrome.hostedPlay.details.llmReason': '理由',
  'hudChrome.hostedPlay.details.llmFocus': '集中',
  'hudChrome.hostedPlay.details.llmTarget': 'ターゲット',
  'hudChrome.hostedPlay.details.promptChars': 'プロンプト文字',
  'hudChrome.hostedPlay.details.rawOutputChars': '生の出力文字',
  'hudChrome.hostedPlay.details.planPrompt': '計画プロンプト',
  'hudChrome.hostedPlay.details.planRawOutput': '生の出力を計画する',
  'hudChrome.hostedPlay.details.socialPrompt': 'ソーシャルプロンプト',
  'hudChrome.hostedPlay.details.socialRawOutput': 'ソーシャル生のアウトプット',
  'hudChrome.hostedPlay.details.travelGoalValue': '{target}、レンジ{range}、キー{key}',
  'hudChrome.hostedPlay.details.pendingReplyHeader': '{name} への返信、リビジョン {revision}',
  'hudChrome.hostedPlay.details.pendingReplyIncoming': '着信',
  'hudChrome.hostedPlay.details.pendingReplyFallback': 'フォールバック応答',
  'hudChrome.hostedPlay.details.pendingReplyAskedFriend': '友達を求めて',
  'hudChrome.hostedPlay.details.pendingReplyLlmStatus': 'LLM ステータス',
  'hudChrome.hostedPlay.details.pendingReplyLlmReply': 'LLM 返信',
  'hudChrome.hostedPlay.details.pendingReplyLlmFriend': 'LLM フレンドアクション',
  'hudChrome.hostedPlay.details.pendingReplyPresence': 'プレゼンスエモート',
  'hudChrome.hostedPlay.details.pendingReplyRequested': 'LLM が要求されました',
  'hudChrome.hostedPlay.partyMode.solo': 'ソロ進行',
  'hudChrome.hostedPlay.partyMode.followLeader': '党首に従う',
  'hudChrome.hostedPlay.partyMode.preferGroup': 'パーティーを優先する',
  'hudChrome.hostedPlay.groupMode.none': '活発なグループ調整ができない',
  'hudChrome.hostedPlay.groupMode.acceptInvite': 'パーティーの招待を承諾する',
  'hudChrome.hostedPlay.groupMode.assistParty': '戦闘中のパーティを支援する',
  'hudChrome.hostedPlay.groupMode.brain': '正常に進行する脳を動かす',
  'hudChrome.hostedPlay.groupMode.followLeader': '党首に続いて',
  'hudChrome.hostedPlay.groupMode.holdRegroup': 'パーティー再結成のための開催',
  'hudChrome.hostedPlay.groupMode.inviteNearby': '近くのプレイヤーを招待する',
  'hudChrome.hostedPlay.groupMode.prepareParty': '戦闘準備のために保持',
  'hudChrome.hostedPlay.groupMode.recoverParty': 'パーティー回復のための保留',
  'hudChrome.hostedPlay.partyRole.healer': 'ヒーラー',
  'hudChrome.hostedPlay.partyRole.dps': 'ダメージ',
  'hudChrome.hostedPlay.partyIntent.routePlan': 'ルート計画',
  'hudChrome.hostedPlay.partyIntent.buffs': 'バフと準備',
  'hudChrome.hostedPlay.partyIntent.focus': '集中射撃',
  'hudChrome.hostedPlay.partyIntent.praise': '賞賛',
  'hudChrome.hostedPlay.partyIntent.correction': '修正',
  'hudChrome.hostedPlay.partyIntent.recovery': '回復',
  'hudChrome.hostedPlay.partyBehavior.advance': '前進',
  'hudChrome.hostedPlay.partyBehavior.prepare': '準備する',
  'hudChrome.hostedPlay.partyBehavior.assist': 'アシスト',
  'hudChrome.hostedPlay.partyBehavior.celebrate': '祝う',
  'hudChrome.hostedPlay.partyBehavior.regroup': '再編成する',
  'hudChrome.hostedPlay.partyBehavior.recover': '回復する',
  'hudChrome.hostedPlay.llmStatus.pending': '保留中',
  'hudChrome.hostedPlay.llmStatus.accepted': '承認されました',
  'hudChrome.hostedPlay.llmStatus.cacheHit': 'キャッシュヒット',
  'hudChrome.hostedPlay.llmStatus.rejected': '拒否されました',
  'hudChrome.hostedPlay.llmStatus.error': 'エラー',
  'hudChrome.hostedPlay.llmStatus.budgetDenied': '予算が限られている',
  'hudChrome.hostedPlay.llmStatus.disabled': '無効',
  'hudChrome.hostedPlay.llmMode.quiet': '静かな',
  'hudChrome.hostedPlay.llmMode.brief': '簡単な',
  'hudChrome.hostedPlay.llmMode.friendly': 'フレンドリー',
  'hudChrome.hostedPlay.llmMode.helpful': '役立つ',
  'hudChrome.hostedPlay.socialAction.friendAdd': '{name} を友達に追加しました',
  'hudChrome.hostedPlay.socialAction.reply': '{name}さんに返信しました',
  'hudChrome.hostedPlay.socialAction.wave': '{name}で手を振った',
  'hudChrome.hostedPlay.socialAction.cheer': '{name}で応援しました',
  'hudChrome.hostedPlay.socialAction.sentChat': 'ソーシャルチャットコマンドを送信しました',
  'hudChrome.hostedPlay.state.offline': 'オフライン',
  'hudChrome.hostedPlay.state.active': 'ランニング',
  'hudChrome.hostedPlay.state.paused': '一時停止中',
  'hudChrome.hostedPlay.pause.runtimeError': '自動化エラーの後に一時停止されました。',
};

const forkAiKoKR: LocaleSupplement = {
  'hudChrome.keybinds.inspect': '주변 검사',
  'hudChrome.aiQuestion.recent': '최근에 무엇을 들었나요?',
  'hudChrome.aiQuestion.rumor': '이 장소에 대한 소문이 있나요?',
  'hudChrome.aiQuestion.place': '여기서 무엇을 발견했나요?',
  'hudChrome.aiQuestion.questHint': '현재 작업에 대한 조언이 있나요?',
  'hudChrome.aiReaction.approach': '관심 있는',
  'hudChrome.aiReaction.avoid': '불안한',
  'hudChrome.aiReaction.inspect': '보고 있다',
  'hudChrome.aiReaction.thinking': '생각',
  'hudChrome.aiError.responseFailed': 'AI 응답 실패: {reason}',
  'hudChrome.aiError.responseRejected': 'AI 응답 거부됨: {reason}',
  'hudChrome.aiSpeech.brotherAldricAwake':
    '죽은 자들은 오늘밤 불안해합니다. 일기를 가까이에 보관하세요, {playerName}.',
  'hudChrome.aiSpeech.merchantMarketPulse':
    '동전은 소문보다 빠르게 움직이지만, {playerName}, 소문은 더 나은 발자국을 남깁니다.',
  'hudChrome.aiSpeech.genericNpcAwake':
    '{speakerName} 길을 연구한 다음 새로운 관심을 가지고 당신에게 돌아옵니다.',
  'hudChrome.aiSpeech.marshalRedbrookAwake':
    '{speakerName} 잘못될 수 있는 일의 지도처럼 사각형을 스캔한 다음 사용자에게 수정합니다. {playerName}.',
  'hudChrome.aiSpeech.traderWilkesAwake':
    '{speakerName} 당신의 얼굴보다 먼저 당신의 짐을 알아채고, 둘 다 장부처럼 웃는다.',
  'hudChrome.aiSpeech.apothecaryLinAwake':
    '{speakerName}는 그림자가 테이블을 가로지르면 냄새와 위험에 따라 나뭇잎을 분류합니다.',
  'hudChrome.aiSpeech.fishermanBrandtAwake':
    '{speakerName} 마치 호수가 먼저 방해를 받은 것처럼 물 쪽으로 지나가는 소리에 귀를 기울입니다.',
  'hudChrome.aiSpeech.foremanOdellAwake':
    '{speakerName} 말에 먼지를 뱉으며 광산으로 가는 길을 지켜본다.',
  'hudChrome.aiSpeech.rangerElwynAwake':
    '{speakerName} 두 손가락을 올려 침묵을 지키며 수목한계선 너머의 무언가를 추적합니다.',
  'hudChrome.aiSpeech.wardenFenwickAwake': '{speakerName} 다리, 갈대, 당신 순으로 확인합니다.',
  'hudChrome.aiSpeech.provisionerHaleAwake':
    '{speakerName} 필요한 것을 결정하기 전에 부츠, 배낭, 날씨의 무게를 달아보세요.',
  'hudChrome.aiSpeech.herbalistYaraAwake':
    '{speakerName} 한 손은 포장된 습포제 가까이에 두고, 한 눈은 덤불에 대고 있습니다.',
  'hudChrome.aiSpeech.captainThessalyAwake':
    '{speakerName} 얼마나 오래 버틸 수 있는지 측정하듯 벽에서 내려다봅니다.',
  'hudChrome.aiSpeech.quartermasterBreeAwake':
    '{speakerName} 숨이 막힐 정도로 부족한 부분을 세어 계산에 당신을 포함시킵니다.',
  'hudChrome.aiSpeech.armorerHodeAwake':
    '{speakerName} 엄지손가락으로 가장자리를 테스트하고 거의 동일한 모습을 보여줍니다.',
  'hudChrome.aiSpeech.itemInterestApproach':
    '{speakerName} 알림 {itemName} 및 가장자리가 더 가까워집니다.',
  'hudChrome.aiSpeech.itemInterestAvoid': '{speakerName}는 {itemName}에서 뒤로 물러납니다.',
  'hudChrome.aiSpeech.itemInterestInspect':
    '{speakerName} 연구 {itemName} 관심을 가지고 공부합니다.',
  'hudChrome.aiSpeech.singularityApproach':
    '{speakerName}는 남들과 다르게 반응하며 이상한 집중력으로 {itemName}을 보호합니다.',
  'hudChrome.aiSpeech.singularityAvoid':
    '{speakerName}는 얼어붙었다가 거의 개인적인 두려움을 안고 {itemName}에서 물러납니다.',
  'hudChrome.aiSpeech.singularityInspect':
    '{speakerName} {itemName} 추억을 만들듯 너무 조심스럽게 지켜봅니다.',
  'hudChrome.aiSpeech.singularityFoodFixated':
    '{speakerName}가 {itemName}쪽으로 향하는 것처럼 배고픔이 이름을 알게 되었습니다.',
  'hudChrome.aiSpeech.singularityCollector':
    '{speakerName} 시계 {itemName} 개인적이고 소유욕 넘치는 고요함을 유지하세요.',
  'hudChrome.aiSpeech.singularityOmenSensitive':
    '{speakerName}는 마치 아무도 듣지 못하는 징조를 듣는 것처럼 {itemName}에서 머뭇거립니다.',
  'hudChrome.aiSpeech.singularityCowardly':
    '{speakerName}는 거의 개인적인 두려움으로 {itemName}로부터 움츠러듭니다.',
  'hudChrome.aiSpeech.singularityTerritorial':
    '{speakerName}는 땅과 {itemName} 사이에 위치하여 순간을 포착합니다.',
  'hudChrome.aiSpeech.singularityVengeful':
    '{speakerName}는 마치 오래된 모욕을 발견한 것처럼 {itemName}을 수정합니다.',
  'hudChrome.aiSpeech.singularityStargazer':
    '{speakerName}는 거대한 무언가에 정신이 팔려 {itemName}에서 하늘을 쳐다봅니다.',
  'hudChrome.aiSpeech.singularityRemembersPlayer':
    '{speakerName}는 이제 당신의 패턴을 인식하는 것처럼 {itemName}에 반응합니다. {playerName}.',
  'hudChrome.aiSpeech.singularityRemembersScene':
    '{speakerName} 다시 이 장소에 있는 당신을 알아차리고, {playerName} 마치 그 장면 자체가 흔적을 남기는 것처럼 지켜봅니다.',
  'hudChrome.aiSpeech.singularityAliasFoodFixated': '헝거네임 {baseName}',
  'hudChrome.aiSpeech.singularityAliasCollector': '장신구 눈 {baseName}',
  'hudChrome.aiSpeech.singularityAliasOmenSensitive': '징조에 감동 {baseName}',
  'hudChrome.aiSpeech.singularityAliasCowardly': '깜짝 놀랐다 {baseName}',
  'hudChrome.aiSpeech.singularityAliasTerritorial': '둥지를 찾는 중 {baseName}',
  'hudChrome.aiSpeech.singularityAliasVengeful': '원한을 품는 것 {baseName}',
  'hudChrome.aiSpeech.singularityAliasStargazer': '별 관찰 {baseName}',
  'hudChrome.aiSpeech.singularityAliasDefault': '깨어남 {baseName}',
  'hudChrome.aiSpeech.companionUndeadFear':
    '{companionName} 가까이 지내세요. {speakerName}조차도 이곳의 두려움을 알아차립니다.',
  'hudChrome.aiSpeech.companionSelfUndeadFear':
    '{companionName} 시체가 공중에 떠 있는 것이 불안해 가까이 누르세요.',
  'hudChrome.aiSpeech.companionSelfRainTired':
    '{companionName} 비를 털고 대피할 준비가 된 모습입니다.',
  'hudChrome.aiSpeech.companionSelfStarrySky': '{companionName} 별에 포착된 숨을 찾아봅니다.',
  'hudChrome.aiSpeech.companionSelfNightNervous':
    '{companionName} 계속 어둠 속을 바라보고 있습니다.',
  'hudChrome.aiSpeech.companionSelfDemonDefiance':
    '{companionName} 주문한 공기에 거의 만족하며 불안감에 몸을 기댄다.',
  'hudChrome.aiSpeech.companionSelfUndeadDayHollow':
    '{companionName} 생활 조명에서는 더 얇아 보입니다.',
  'hudChrome.aiSpeech.companionSelfBeastScentUneasy':
    '{companionName} 불, 피, 공중에 떠 있는 늙은 시체로 인해 불안정한 상태로 땅 가까이로 내려갑니다.',
  'hudChrome.aiSpeech.companionSelfMurlocWaterCall':
    '{companionName} 다른 사람들은 날씨만 듣는 반면 물은 습한 공기를 좋아합니다.',
  'hudChrome.aiSpeech.companionSelfSpiderStillness':
    '{companionName} 아주 조용히 움직이며 작은 움직임을 통해 안개를 읽어냅니다.',
  'hudChrome.aiSpeech.companionSelfElementalResonance':
    '{companionName} 주변의 공기는 낮고 이상한 공명으로 날씨에 응답합니다.',
  'hudChrome.aiSpeech.companionSelfDragonkinWatch':
    '{companionName} 물려받은 듯한 인내심으로 높이와 오래된 돌을 연구합니다.',
  'hudChrome.aiSpeech.companionSelfMortalSafeHaven':
    '{companionName} 낮에는 이 안전한 장소에서 편히 쉬지만 계속해서 출구를 감시합니다.',
  'hudChrome.aiSpeech.sceneDemonCompanionUnease':
    '{speakerName} 한쪽 눈을 떼지 않고 {companionName}; 그런 그림자가 방을 바꿔요.',
  'hudChrome.aiSpeech.sceneUndeadCompanionUnease':
    '{speakerName}는 {companionName}에서 굳어지며 주변의 침묵을 읽습니다.',
  'hudChrome.aiSpeech.sceneUndeadPressure':
    '{speakerName} 죽은 사람이 너무 가까이 있어서 불안해 목소리를 낮춥니다.',
  'hudChrome.aiSpeech.sceneRainWeariness':
    '{speakerName}의 어깨에 비구슬이 있습니다. 평소보다 대답이 짧아진다.',
  'hudChrome.aiSpeech.sceneFogUnease': '{speakerName} 단어 사이의 안개를 계속 지켜봅니다.',
  'hudChrome.aiSpeech.sceneClearNightAwe': '{speakerName} 말을 하기 전에 별을 슬쩍 살펴봅니다.',
  'hudChrome.aiSpeech.sceneDayEnergy': '{speakerName} 낮에 보면 더 선명해 보이네요.',
  'hudChrome.aiSpeech.sceneNightFatigue':
    '{speakerName} 늦은 밤의 피로로 인해 목소리가 부드러워졌습니다.',
  'hudChrome.aiSpeech.familySceneApproach':
    '{speakerName} 장소 자체에 반응하여 땅이 무언가를 말하는 것처럼 점점 더 가까이 다가갑니다.',
  'hudChrome.aiSpeech.familySceneAvoid': '{speakerName} 공기를 잘못 읽고 현장에서 물러납니다.',
  'hudChrome.aiSpeech.familySceneInspect':
    '{speakerName} 가만히 서서 당신보다 날씨, 벽, 트랙을 더 많이 관찰합니다.',
  'hudChrome.aiSpeech.familySceneBeastUneasy':
    '{speakerName} 냄새로 장소를 파악하고 배고픔과 주의 사이를 오갑니다.',
  'hudChrome.aiSpeech.familySceneUndeadDrawn':
    '{speakerName} 자신의 이름을 들은 듯 공중에서 죽음을 향해 표류한다.',
  'hudChrome.aiSpeech.familySceneElementalResonance':
    '{speakerName} 낮고 비인간적인 공명으로 그 곳에 답합니다.',
  'hudChrome.aiSpeech.familySceneDemonAmused':
    '{speakerName} 눈에 띄게 기뻐하며 이곳을 둘러싼 공포에 몸을 기댑니다.',
  'hudChrome.aiSpeech.memoryRecognizesPlayer':
    '{speakerName}가 이제 당신을 알아봅니다, {playerName}. 길은 당신의 이름을 담고 시작되었습니다.',
  'hudChrome.aiSpeech.memoryRumorEcho':
    '{speakerName}가 {itemName}를 쳐다봅니다. 당신이 두고 왔다는 소문이 이미 움직이기 시작했어요, {playerName}.',
  'hudChrome.aiSpeech.memorySingularityRumorEcho':
    '{speakerName} 목소리를 낮추고; {playerName}의 {itemName}로 인해 근처에 있는 무언가가 깨어난 것처럼 보였습니다.',
  'hudChrome.aiSpeech.memoryQuestRumorEcho':
    '{speakerName}는 {questName}, {playerName}에 대해 들었습니다. 완성된 작품은 그 자체의 흔적을 남깁니다.',
  'hudChrome.aiSpeech.memoryPriestRecognizesPlayer':
    '{speakerName} 이제 당신의 발걸음을 알고 있습니다, {playerName}. 예배당 길조차 그것을 유지합니다.',
  'hudChrome.aiSpeech.memoryPriestRumorEcho':
    '{speakerName}는 징조인지 고백인지 저울질하듯 {itemName}에서 당신을 바라보고 있습니다.',
  'hudChrome.aiSpeech.memoryPriestQuestRumorEcho':
    '{speakerName}는 한 예배당 길에서 다른 길로 촛불을 옮기는 것과 같은 {questName}을 말합니다.',
  'hudChrome.aiSpeech.memoryCommanderRecognizesPlayer':
    '{speakerName} 신뢰할 만한 증인으로 귀하를 신고하기 시작했습니다, {playerName}.',
  'hudChrome.aiSpeech.memoryCommanderRumorEcho':
    '{speakerName}는 {itemName}를 호기심이 아닌 신고로 ​​표시합니다.',
  'hudChrome.aiSpeech.memoryCommanderQuestRumorEcho':
    '{speakerName}는 {questName}를 확정된 현장 작업으로 간주하고 그 주변으로 사람들을 이동시키기 시작합니다.',
  'hudChrome.aiSpeech.memoryMerchantRecognizesPlayer':
    '{speakerName} 당신을 기억합니다, {playerName}. 흔적이 있는 이름은 동전보다 더 가치가 있습니다.',
  'hudChrome.aiSpeech.memoryMerchantRumorEcho':
    '{speakerName} 연구 {itemName}. 해질 무렵 누군가는 누가 그것을 버렸는지, 그것이 무엇을 의미하는지 물을 것입니다.',
  'hudChrome.aiSpeech.memoryMerchantQuestRumorEcho':
    '{speakerName}는 이미 {questName}가 도로 가격과 불안한 구매자에게 어떤 영향을 미칠지 가늠하고 있습니다.',
  'hudChrome.aiSpeech.memoryHerbalistRecognizesPlayer':
    '{speakerName} 당신에게 계속 필요한 치료법을 기억합니다, {playerName}.',
  'hudChrome.aiSpeech.memoryHerbalistRumorEcho':
    '{speakerName} 공부 {itemName} 먼저 냄새로, 그다음에는 걱정으로.',
  'hudChrome.aiSpeech.memoryHerbalistQuestRumorEcho':
    '{speakerName}는 {questName}이 국소적인 질병을 치료하지는 않더라도 변화시켰다고 말합니다.',
  'hudChrome.aiSpeech.memorySmithRecognizesPlayer':
    '{speakerName}는 대장장이가 칼날의 흠집을 알아보듯이 당신을 향해 고개를 끄덕입니다. {playerName}.',
  'hudChrome.aiSpeech.memorySmithRumorEcho':
    '{speakerName} 눈 {itemName}. 좋은 강철과 이상한 잔재물 모두 모루에서 이야기를 나눕니다.',
  'hudChrome.aiSpeech.memorySmithQuestRumorEcho':
    '{speakerName}는 {questName}이 작업 소리를 한번에 깔끔하게 끝냈다고 말합니다.',
  'hudChrome.aiSpeech.memoryScoutRecognizesPlayer':
    '{speakerName} 이제 측정할 수 있습니다. {playerName}: 트랙, 타이밍 등 모든 것.',
  'hudChrome.aiSpeech.memoryScoutRumorEcho':
    '{speakerName}는 {itemName}을 힐끗 보고 이미 도로 지도에 표시해 두었습니다.',
  'hudChrome.aiSpeech.memoryScoutQuestRumorEcho':
    '{speakerName} 표시 {questName}는 캠프파이어 소음이 아닌 확인된 것으로 표시됩니다.',
  'hudChrome.aiSpeech.memoryLoremasterRecognizesPlayer':
    '{speakerName}는 귀하의 이름 {playerName}을 기억하고 답변하지 않은 질문 옆에 보관합니다.',
  'hudChrome.aiSpeech.memoryLoremasterRumorEcho':
    '{speakerName} 연구 {itemName}는 가십이 아닌 증거로 사용됩니다. 하지만 가십이 먼저 이를 전달합니다.',
  'hudChrome.aiSpeech.memoryLoremasterQuestRumorEcho':
    '{speakerName}는 {questName}를 본문에 들어간 각주로 취급합니다.',
  'hudChrome.aiSpeech.memoryTidewatcherRecognizesPlayer':
    '{speakerName} 이제 당신을 알아요, {playerName}. 당신의 이름은 두 번 이상 물을 건넜습니다.',
  'hudChrome.aiSpeech.memoryTidewatcherRumorEcho':
    '{speakerName} 시계 {itemName} 아직 퍼지지 않은 잔물결처럼.',
  'hudChrome.aiSpeech.memoryTidewatcherQuestRumorEcho':
    '{speakerName}는 {questName}이 흘수선에 도달했으며 흘수선이 모든 것을 반복한다고 말합니다.',
  'hudChrome.aiSpeech.topicRecentFirstMeet':
    '{speakerName} 답변은 신중하게 유지하세요. {playerName}. 당신은 서로 처음이지만 그 장소에는 이미 눈에 띄는 작은 표지판이 있습니다.',
  'hudChrome.aiSpeech.topicRecentKnown':
    '{speakerName} 당신을 추적하기 시작한 사람의 어조로 대답합니다, {playerName}.',
  'hudChrome.aiSpeech.topicRumorQuiet':
    '{speakerName} 잡담을 듣긴 하지만 아직 이쯤까지 확실한 건 아무것도 없습니다.',
  'hudChrome.aiSpeech.topicPlace': '{speakerName} 응답하기 전에 근처 도로, 날씨, 벽을 살펴보세요.',
  'hudChrome.aiSpeech.topicQuestHint':
    '{speakerName} 저널이 이미 알고 있는 내용과 관련된 조언을 유지합니다.',
  'hudChrome.aiSpeech.topicQuestNoHint':
    '{speakerName} 현재 작업에 대한 정직한 단서가 아직 없습니다.',
  'hudChrome.aiSpeech.objectInspectForge':
    '{itemName} 대장간 빛을 포착합니다. 금속, 땀, 도로 먼지가 작은 이야기를 전합니다.',
  'hudChrome.aiSpeech.objectInspectGrave':
    '{itemName} 땅에 묻힌 곳의 추위를 짊어지고, 그 주위의 공기가 귀를 기울이는 것 같습니다.',
  'hudChrome.aiSpeech.objectInspectLake':
    '{itemName} 주변에 습한 공기가 모이는 듯, 근처의 물에도 의견이 있는 듯하다.',
  'hudChrome.aiSpeech.objectInspectDoor':
    '문지방은 감시받는 느낌을 줍니다. 그 이상을 기다리는 것은 무엇이든 여전히 오래된 규칙을 따릅니다.',
  'hudChrome.aiSpeech.objectInspectSingularity':
    '{itemName} 평범함을 거부합니다. 장면은 숨을 쉬기 위해 주위를 구부립니다.',
  'hudChrome.aiSpeech.objectInspectGeneric':
    '공부해요 {itemName}. 근처의 장면은 작은 세부사항으로 답합니다.',
  'hudChrome.aiSpeech.sceneTraceSingularity':
    '{itemName}가 모두의 관심을 끌었던 곳을 발견했습니다. 공기는 아직 새롭게 깨어난 듯한 느낌이다.',
  'hudChrome.aiSpeech.sceneTraceCursed':
    '땅에는 여전히 {itemName} 표시가 있는 것 같습니다. 평범한 세부 사항조차도 거리를 유지합니다.',
  'hudChrome.aiSpeech.sceneTraceFood':
    '{itemName}의 희미해지는 냄새는 작은 흔적을 그려내고 근처의 어둠 속에서 더욱 날카로운 소리를 들려줍니다.',
  'hudChrome.aiSpeech.sceneTraceValuable':
    '{itemName} 주변에 작은 흠집이 남아 있는 것을 발견했습니다. 누군가 또는 무언가가 여기에서 그 가치를 평가했습니다.',
  'hudChrome.aiSpeech.sceneTraceGeneric':
    '그 장소는 여전히 {itemName}를 작은 혼란스러운 세부 사항으로 기억합니다.',
  'hudChrome.aiSpeech.worldTraceNpcSingularity':
    '{speakerName} {itemName}이 남긴 표시를 관찰한 후 방이 덜 비어 있는 것처럼 말합니다.',
  'hudChrome.aiSpeech.worldTraceNpcCursed':
    '{speakerName}는 {itemName}가 표시된 장면과 거리를 유지합니다.',
  'hudChrome.aiSpeech.worldTraceNpcFood':
    '{speakerName}는 {itemName}의 희미한 표시를 발견합니다. 배고픔조차 목격자를 남긴다.',
  'hudChrome.aiSpeech.worldTraceNpcValuable':
    '{speakerName} 주변의 흠집을 살펴보세요 {itemName}. 가치는 항상 땅에 새로운 패턴을 가르쳐줍니다.',
  'hudChrome.aiSpeech.worldTraceNpcGeneric':
    '{speakerName}는 {itemName} 주변의 불안한 내용을 읽고 대답합니다.',
  'hudChrome.aiSpeech.worldDirectorUncanny':
    '{itemName}쯤에는 지역 전체가 새롭게 깨어나는 느낌을 받습니다.',
  'hudChrome.aiSpeech.worldDirectorSceneUncanny':
    '이곳의 무언가가 당신을 인식하기 시작한 것처럼 그 장소는 새롭게 깨어나는 느낌을 줍니다.',
  'hudChrome.aiSpeech.worldDirectorHaunted': '{itemName} 부근은 추운 날씨를 유지하고 있습니다.',
  'hudChrome.aiSpeech.worldDirectorHungry':
    '{itemName} 주변에 작은 흔적과 냄새가 배고픈 패턴으로 모여듭니다.',
  'hudChrome.aiSpeech.worldDirectorCovetous':
    '{itemName} 주변에 생긴 흠집이 이곳을 조심스럽고 계산적인 느낌으로 만듭니다.',
  'hudChrome.aiSpeech.worldDirectorStirred':
    '{itemName}가 방해한 이후로 장소는 안정되지 않았습니다.',
  'hudChrome.aiSpeech.worldDirectorQuestComplete':
    '{questName} 이후에는 해당 부위가 더 가벼워집니다. 안전하지는 않지만 정확하게는 덜 외롭습니다.',
  'hudChrome.aiSpeech.bossMemoryDefeated':
    '공기는 {bossName}가 떨어진 곳을 여전히 알고 있습니다. 방이 당신을 다르게 보는 것 같습니다.',
  'hudChrome.aiSpeech.bossMemoryWipe':
    '{bossName}의 승리가 아직도 이곳을 압박하고 있습니다. 당신의 그림자조차도 떨어지는 것을 기억하는 것 같습니다.',
  'hudChrome.aiSpeech.worldDirectorBossDefeated':
    '해당 지역은 {bossName} 무너지는 충격을 받았습니다.',
  'hudChrome.aiSpeech.worldDirectorBossWipe':
    '{bossName}의 마지막 승리를 둘러싸고 지역은 긴장감을 느낍니다.',
  'hudChrome.aiSpeech.bossPhaseBloodied':
    '{bossName} 리듬이 바뀌고, 모든 움직임을 지켜볼 만큼 상처를 입었습니다.',
  'hudChrome.aiSpeech.bossPhaseDesperate':
    '{bossName}가 무너지기 직전이고, 갑자기 싸움이 날카로워지는 느낌입니다.',
  'hudChrome.aiSpeech.sceneInspectForge':
    '뜨거운 철, 작업 소음, 집처럼 따뜻한 마을 가장자리 등 대장간을 경험하게 됩니다.',
  'hudChrome.aiSpeech.sceneInspectChapel':
    '당신은 폐허가 된 예배당을 방문합니다. 오래된 돌, 무덤, 그리고 기억에 남는 종소리입니다.',
  'hudChrome.aiSpeech.sceneInspectLake':
    '호수 선창을 감상하세요. 물고기 냄새, 탁 트인 물, 하늘 아래 잔잔한 잔물결이 느껴집니다.',
  'hudChrome.aiSpeech.sceneInspectWatchpost':
    '당신은 감시초소를 살펴봅니다: 질서정연한 벽, 시야선, 고지대 위로 움직이는 날씨.',
  'hudChrome.aiSpeech.sceneInspectCrypt':
    '봉인된 공기, 오래된 피, 소리를 삼키는 듯한 길 등 지하실 입구로 들어갑니다.',
  'hudChrome.aiSpeech.sceneInspectGeneric':
    '당신은 그 장소에 적응합니다. 날씨, 트랙, 작은 세부사항이 저절로 정리되기 시작합니다.',
  'hudChrome.aiSpeech.unknownItem': '뭔가 남겨진 것',
  'hudChrome.aiSpeech.unknownObject': '당신 앞에 있는 것',
  'hudChrome.aiSpeech.unknownCompanion': '당신의 동반자',
  'hudChrome.aiSpeech.unknownBoss': '만남',
  'hudChrome.aiSpeech.unknownQuest': '그 일',
};

const forkHostedKoKR: LocaleSupplement = {
  'hudChrome.hostedPlay.menuButton': '호스팅 플레이',
  'hudChrome.hostedPlay.title': '호스팅 플레이',
  'hudChrome.hostedPlay.statusLabel': '상태',
  'hudChrome.hostedPlay.objectiveLabel': '목적',
  'hudChrome.hostedPlay.resumeOnLogin': '로그인 시 재개',
  'hudChrome.hostedPlay.autoInviteNearbyLabel': '주변 플레이어 자동 초대',
  'hudChrome.hostedPlay.autoInviteTargetPartySizeLabel': '자동 초대 대상 파티 규모',
  'hudChrome.hostedPlay.autoInviteTargetPartySizeAria':
    '파티가 {count} 인원이 될 때까지 초대하세요',
  'hudChrome.hostedPlay.partyModeLabel': '파티 모드',
  'hudChrome.hostedPlay.partyModeStatusLabel': '파티 행동',
  'hudChrome.hostedPlay.groupModeLabel': '현재 그룹 상태',
  'hudChrome.hostedPlay.groupLeaderLabel': '그룹리더',
  'hudChrome.hostedPlay.groupLeaderDistanceLabel': '리더 거리',
  'hudChrome.hostedPlay.socialPendingRepliesLabel': '응답 대기 중',
  'hudChrome.hostedPlay.socialFriendsLabel': '친구',
  'hudChrome.hostedPlay.socialBlocksLabel': '차단된 플레이어',
  'hudChrome.hostedPlay.lastWhisperFromLabel': '마지막 속삭임',
  'hudChrome.hostedPlay.lastSocialActionLabel': '마지막 소셜 액션',
  'hudChrome.hostedPlay.llmEnabledLabel': 'LLM 오버레이',
  'hudChrome.hostedPlay.llmPlanModeLabel': 'LLM 소셜 모드',
  'hudChrome.hostedPlay.llmPlanFocusLabel': 'LLM 포커스',
  'hudChrome.hostedPlay.llmReplyLabel': '법학대학원 답변',
  'hudChrome.hostedPlay.llmReplyTargetLabel': 'LLM 응답 대상',
  'hudChrome.hostedPlay.pauseLabel': '일시중지 이유',
  'hudChrome.hostedPlay.errorLabel': '실행 시간',
  'hudChrome.hostedPlay.loadingStatus': '호스팅 플레이 상태 로드 중...',
  'hudChrome.hostedPlay.statusLoadFailed': '지금은 호스팅 플레이 상태를 로드할 수 없습니다.',
  'hudChrome.hostedPlay.updateFailed': '지금은 호스팅된 플레이를 업데이트할 수 없습니다.',
  'hudChrome.hostedPlay.settingsSaveFailed': '지금은 호스팅 플레이 설정을 저장할 수 없습니다.',
  'hudChrome.hostedPlay.serverRestartRequired':
    '이 토글이 작동하려면 호스팅 플레이를 위해서는 로컬 서버를 다시 시작해야 합니다.',
  'hudChrome.hostedPlay.objectiveNone': '활성 목표 없음',
  'hudChrome.hostedPlay.enable': '호스팅 플레이 활성화',
  'hudChrome.hostedPlay.disable': '호스팅된 플레이 비활성화',
  'hudChrome.hostedPlay.refresh': '새로 고치다',
  'hudChrome.hostedPlay.runtimeIssue': '자동화에 런타임 문제가 발생했습니다.',
  'hudChrome.hostedPlay.details.show': '세부정보 보기',
  'hudChrome.hostedPlay.details.hide': '세부정보 숨기기',
  'hudChrome.hostedPlay.details.title': '호스팅 플레이 세부정보',
  'hudChrome.hostedPlay.details.empty': '아직 호스팅 플레이 진단을 사용할 수 없습니다.',
  'hudChrome.hostedPlay.details.unavailable': '없는',
  'hudChrome.hostedPlay.details.sectionBrain': '뇌',
  'hudChrome.hostedPlay.details.sectionMovement': '움직임',
  'hudChrome.hostedPlay.details.sectionParty': '파티',
  'hudChrome.hostedPlay.details.sectionSocial': '사회의',
  'hudChrome.hostedPlay.details.sectionLlmSocial': 'LLM 소셜',
  'hudChrome.hostedPlay.details.lastBrain': '마지막 브레인 틱',
  'hudChrome.hostedPlay.details.lastAutomation': '마지막 자동화 틱',
  'hudChrome.hostedPlay.details.objectiveId': '목표 ID',
  'hudChrome.hostedPlay.details.objectiveLabel': '객관적인 라벨',
  'hudChrome.hostedPlay.details.objectiveQuest': '퀘스트 ID',
  'hudChrome.hostedPlay.details.objectiveDungeon': '던전아이디',
  'hudChrome.hostedPlay.details.partySize': '권장 인원수',
  'hudChrome.hostedPlay.details.objectiveSince': '목표 이후',
  'hudChrome.hostedPlay.details.lastProgress': '마지막 진행',
  'hudChrome.hostedPlay.details.lastError': '마지막 오류',
  'hudChrome.hostedPlay.details.brainDrivePaused': '브레인 드라이브가 일시 중지되었습니다.',
  'hudChrome.hostedPlay.details.facing': '깃 달기',
  'hudChrome.hostedPlay.details.pathLength': '경로 길이',
  'hudChrome.hostedPlay.details.nextPathPoint': '다음 경로 점',
  'hudChrome.hostedPlay.details.campIndex': '캠프 색인',
  'hudChrome.hostedPlay.details.noTargetSince': '이후 대상 없음',
  'hudChrome.hostedPlay.details.stuckResets': '고정된 재설정',
  'hudChrome.hostedPlay.details.travelGoal': '여행 목표',
  'hudChrome.hostedPlay.details.moveInput': '입력 이동',
  'hudChrome.hostedPlay.details.commands': '명령',
  'hudChrome.hostedPlay.details.lastCommandAges': '최근 명령 기간',
  'hudChrome.hostedPlay.details.groupMode': '그룹 모드',
  'hudChrome.hostedPlay.details.groupLeader': '그룹리더',
  'hudChrome.hostedPlay.details.groupDistance': '그룹 거리',
  'hudChrome.hostedPlay.details.partyPaused': '파티가 정지된 두뇌',
  'hudChrome.hostedPlay.details.partyRole': '파티 역할',
  'hudChrome.hostedPlay.details.partyIntent': '파티 의도',
  'hudChrome.hostedPlay.details.partyIntentTarget': '의도 대상',
  'hudChrome.hostedPlay.details.lastPartyChat': '마지막 파티 채팅',
  'hudChrome.hostedPlay.details.llmEnabled': 'LLM 활성화됨',
  'hudChrome.hostedPlay.details.llmPending': '보류 중',
  'hudChrome.hostedPlay.details.llmStatus': '상태',
  'hudChrome.hostedPlay.details.llmProvider': '공급자',
  'hudChrome.hostedPlay.details.llmLatency': '숨어 있음',
  'hudChrome.hostedPlay.details.llmCacheHit': '캐시 적중',
  'hudChrome.hostedPlay.details.llmReason': '이유',
  'hudChrome.hostedPlay.details.llmFocus': '집중하다',
  'hudChrome.hostedPlay.details.llmTarget': '목표',
  'hudChrome.hostedPlay.details.promptChars': '프롬프트 문자',
  'hudChrome.hostedPlay.details.rawOutputChars': '원시 출력 문자',
  'hudChrome.hostedPlay.details.planPrompt': '계획 프롬프트',
  'hudChrome.hostedPlay.details.planRawOutput': '원시 출력 계획',
  'hudChrome.hostedPlay.details.socialPrompt': '사회적 프롬프트',
  'hudChrome.hostedPlay.details.socialRawOutput': '소셜 원시 출력',
  'hudChrome.hostedPlay.details.travelGoalValue': '{target}, 범위 {range}, 키 {key}',
  'hudChrome.hostedPlay.details.pendingReplyHeader': '{name}, 수정본 {revision}에 답글 달기',
  'hudChrome.hostedPlay.details.pendingReplyIncoming': '들어오는',
  'hudChrome.hostedPlay.details.pendingReplyFallback': '대체 응답',
  'hudChrome.hostedPlay.details.pendingReplyAskedFriend': '친구를 구함',
  'hudChrome.hostedPlay.details.pendingReplyLlmStatus': 'LLM 상태',
  'hudChrome.hostedPlay.details.pendingReplyLlmReply': '법학대학원 답변',
  'hudChrome.hostedPlay.details.pendingReplyLlmFriend': 'LLM 친구 액션',
  'hudChrome.hostedPlay.details.pendingReplyPresence': '존재감 감정 표현',
  'hudChrome.hostedPlay.details.pendingReplyRequested': 'LLM 요청',
  'hudChrome.hostedPlay.partyMode.solo': '솔로 진행',
  'hudChrome.hostedPlay.partyMode.followLeader': '파티장을 따르세요',
  'hudChrome.hostedPlay.partyMode.preferGroup': '정당 우선순위',
  'hudChrome.hostedPlay.groupMode.none': '활성 그룹 조정 없음',
  'hudChrome.hostedPlay.groupMode.acceptInvite': '파티 초대 수락',
  'hudChrome.hostedPlay.groupMode.assistParty': '전투에서 파티 지원',
  'hudChrome.hostedPlay.groupMode.brain': '정상적인 진행 두뇌를 실행',
  'hudChrome.hostedPlay.groupMode.followLeader': '당대표를 따라',
  'hudChrome.hostedPlay.groupMode.holdRegroup': '정당 재편성 위해 개최',
  'hudChrome.hostedPlay.groupMode.inviteNearby': '주변 플레이어 초대',
  'hudChrome.hostedPlay.groupMode.prepareParty': '전투 준비를 위해 개최',
  'hudChrome.hostedPlay.groupMode.recoverParty': '파티 회복을 위해 보류',
  'hudChrome.hostedPlay.partyRole.healer': '치료자',
  'hudChrome.hostedPlay.partyRole.dps': '손상',
  'hudChrome.hostedPlay.partyIntent.routePlan': '경로 계획',
  'hudChrome.hostedPlay.partyIntent.buffs': '버프 및 준비',
  'hudChrome.hostedPlay.partyIntent.focus': '집중 사격',
  'hudChrome.hostedPlay.partyIntent.praise': '칭찬',
  'hudChrome.hostedPlay.partyIntent.correction': '보정',
  'hudChrome.hostedPlay.partyIntent.recovery': '회복',
  'hudChrome.hostedPlay.partyBehavior.advance': '전진',
  'hudChrome.hostedPlay.partyBehavior.prepare': '준비하다',
  'hudChrome.hostedPlay.partyBehavior.assist': '돕다',
  'hudChrome.hostedPlay.partyBehavior.celebrate': '축하하다',
  'hudChrome.hostedPlay.partyBehavior.regroup': '재편성하다',
  'hudChrome.hostedPlay.partyBehavior.recover': '다시 덮다',
  'hudChrome.hostedPlay.llmStatus.pending': '보류 중',
  'hudChrome.hostedPlay.llmStatus.accepted': '수락됨',
  'hudChrome.hostedPlay.llmStatus.cacheHit': '캐시 적중',
  'hudChrome.hostedPlay.llmStatus.rejected': '거부됨',
  'hudChrome.hostedPlay.llmStatus.error': '오류',
  'hudChrome.hostedPlay.llmStatus.budgetDenied': '예산 제한',
  'hudChrome.hostedPlay.llmStatus.disabled': '장애가 있는',
  'hudChrome.hostedPlay.llmMode.quiet': '조용한',
  'hudChrome.hostedPlay.llmMode.brief': '짧은',
  'hudChrome.hostedPlay.llmMode.friendly': '친숙한',
  'hudChrome.hostedPlay.llmMode.helpful': '도움이 되는',
  'hudChrome.hostedPlay.socialAction.friendAdd': '친구에게 {name}을 추가했습니다.',
  'hudChrome.hostedPlay.socialAction.reply': '{name}에 답글을 달았습니다.',
  'hudChrome.hostedPlay.socialAction.wave': '{name}에 손을 흔들었습니다',
  'hudChrome.hostedPlay.socialAction.cheer': '{name}를 응원했습니다',
  'hudChrome.hostedPlay.socialAction.sentChat': '소셜 채팅 명령을 보냈습니다',
  'hudChrome.hostedPlay.state.offline': '오프라인',
  'hudChrome.hostedPlay.state.active': '달리기',
  'hudChrome.hostedPlay.state.paused': '일시중지됨',
  'hudChrome.hostedPlay.pause.runtimeError': '자동화 오류로 인해 일시중지되었습니다.',
};

const forkAiRuRU: LocaleSupplement = {
  'hudChrome.keybinds.inspect': 'Осмотреть поблизости',
  'hudChrome.aiQuestion.recent': 'Что вы слышали в последнее время?',
  'hudChrome.aiQuestion.rumor': 'Есть какие-нибудь слухи об этом месте?',
  'hudChrome.aiQuestion.place': 'Что вы здесь заметили?',
  'hudChrome.aiQuestion.questHint': 'Какой-нибудь совет по поводу моей нынешней работы?',
  'hudChrome.aiReaction.approach': 'заинтересованный',
  'hudChrome.aiReaction.avoid': 'непростой',
  'hudChrome.aiReaction.inspect': 'наблюдаю',
  'hudChrome.aiReaction.thinking': 'мышление',
  'hudChrome.aiError.responseFailed': 'Ответ ИИ не удался: {reason}',
  'hudChrome.aiError.responseRejected': 'Ответ ИИ отклонен: {reason}',
  'hudChrome.aiSpeech.brotherAldricAwake':
    'Мертвецы сегодня беспокойны. Держите свой дневник под рукой, {playerName}.',
  'hudChrome.aiSpeech.merchantMarketPulse':
    'Монета движется быстрее, чем слухи, {playerName}, но слухи оставляют лучшие следы.',
  'hudChrome.aiSpeech.genericNpcAwake':
    '{speakerName} изучает дорогу, а затем снова поворачивается к вам с новым вниманием.',
  'hudChrome.aiSpeech.marshalRedbrookAwake':
    '{speakerName} сканирует квадрат, как карту того, что может пойти не так, а затем фиксирует ваш взгляд, {playerName}.',
  'hudChrome.aiSpeech.traderWilkesAwake':
    '{speakerName} замечает перед вашим лицом вашу пачку, а затем улыбается, как будто оба , бухгалтерская книга.',
  'hudChrome.aiSpeech.apothecaryLinAwake':
    '{speakerName} сортирует листья по запаху и опасности, когда ваша тень пересекает стол.',
  'hudChrome.aiSpeech.fishermanBrandtAwake':
    '{speakerName} слушает мимо вас в сторону воды, как будто озеро сначала прервалось.',
  'hudChrome.aiSpeech.foremanOdellAwake':
    '{speakerName} сплевывает пыль от своих слов и смотрит на дорогу к шахте.',
  'hudChrome.aiSpeech.rangerElwynAwake':
    '{speakerName} поднимает два пальца, требуя тишины, отслеживая что-то за линией леса.',
  'hudChrome.aiSpeech.wardenFenwickAwake':
    '{speakerName} проверяет мост, камыши, затем вас, именно в таком порядке.',
  'hudChrome.aiSpeech.provisionerHaleAwake':
    '{speakerName} взвешивает ваши ботинки, рюкзак и погоду, прежде чем решить, что вам нужно.',
  'hudChrome.aiSpeech.herbalistYaraAwake':
    '{speakerName} держит одну руку возле завернутой припарки, а один глаз смотрит на заросли.',
  'hudChrome.aiSpeech.captainThessalyAwake':
    '{speakerName} смотрит вниз со стены, словно измеряя, сколько еще она сможет продержаться.',
  'hudChrome.aiSpeech.quartermasterBreeAwake':
    '{speakerName} про себя подсчитывает недостачу, а затем включает вас в арифметику.',
  'hudChrome.aiSpeech.armorerHodeAwake':
    '{speakerName} проверяет край большим пальцем и смотрит на вас почти так же.',
  'hudChrome.aiSpeech.itemInterestApproach': '{speakerName} замечает {itemName} и приближается.',
  'hudChrome.aiSpeech.itemInterestAvoid': '{speakerName} отступает от {itemName}.',
  'hudChrome.aiSpeech.itemInterestInspect':
    '{speakerName} изучает {itemName} с настороженным интересом.',
  'hudChrome.aiSpeech.singularityApproach':
    '{speakerName} реагирует не так, как остальные, охраняя {itemName} со странным фокусом.',
  'hudChrome.aiSpeech.singularityAvoid':
    '{speakerName} замирает, а затем пятится от {itemName} с почти личным страхом.',
  'hudChrome.aiSpeech.singularityInspect':
    '{speakerName} смотрит на {itemName} слишком внимательно, словно формируя воспоминания.',
  'hudChrome.aiSpeech.singularityFoodFixated':
    '{speakerName} приближается к {itemName}, как будто голод узнал имя.',
  'hudChrome.aiSpeech.singularityCollector':
    '{speakerName} наблюдает за {itemName} с личным, собственническим спокойствием.',
  'hudChrome.aiSpeech.singularityOmenSensitive':
    '{speakerName} колеблется на {itemName}, как будто слышит предзнаменование, которого никто больше не слышит.',
  'hudChrome.aiSpeech.singularityCowardly':
    '{speakerName} отшатывается от {itemName} с почти личным страхом.',
  'hudChrome.aiSpeech.singularityTerritorial':
    '{speakerName} оказывается между землей и {itemName}, фиксируя момент.',
  'hudChrome.aiSpeech.singularityVengeful':
    '{speakerName} фиксируется на {itemName}, как будто обнаружил старое оскорбление.',
  'hudChrome.aiSpeech.singularityStargazer':
    '{speakerName} смотрит с {itemName} на небо, отвлекаясь на что-то огромное.',
  'hudChrome.aiSpeech.singularityRemembersPlayer':
    '{speakerName} реагирует на {itemName} так, как будто теперь распознает ваш шаблон, {playerName}.',
  'hudChrome.aiSpeech.singularityRemembersScene':
    '{speakerName} снова замечает вас в этом месте, {playerName}, и смотрит так, будто сама сцена оставила след.',
  'hudChrome.aiSpeech.singularityAliasFoodFixated': 'Названный Голодом {baseName}',
  'hudChrome.aiSpeech.singularityAliasCollector': 'Глазастый {baseName}',
  'hudChrome.aiSpeech.singularityAliasOmenSensitive': 'Тронутый знамением {baseName}',
  'hudChrome.aiSpeech.singularityAliasCowardly': 'Испуганный {baseName}',
  'hudChrome.aiSpeech.singularityAliasTerritorial': 'Захват гнезда {baseName}',
  'hudChrome.aiSpeech.singularityAliasVengeful': 'Обида {baseName}',
  'hudChrome.aiSpeech.singularityAliasStargazer': 'Наблюдение за звездами {baseName}',
  'hudChrome.aiSpeech.singularityAliasDefault': 'Пробуждение {baseName}',
  'hudChrome.aiSpeech.companionUndeadFear':
    '{companionName} остается близко; даже {speakerName} замечает страх в этом месте.',
  'hudChrome.aiSpeech.companionSelfUndeadFear':
    '{companionName} прижимается ближе, чувствуя себя неловко от мертвецов в воздухе.',
  'hudChrome.aiSpeech.companionSelfRainTired':
    '{companionName} стряхивает дождь и выглядит готовым укрыться.',
  'hudChrome.aiSpeech.companionSelfStarrySky': '{companionName} смотрит вверх, ловя звезды.',
  'hudChrome.aiSpeech.companionSelfNightNervous': '{companionName} продолжает смотреть в темноту.',
  'hudChrome.aiSpeech.companionSelfDemonDefiance':
    '{companionName} тревожно наклоняется, почти довольный упорядоченным воздухом.',
  'hudChrome.aiSpeech.companionSelfUndeadDayHollow':
    '{companionName} кажется тоньше при живом свете.',
  'hudChrome.aiSpeech.companionSelfBeastScentUneasy':
    '{companionName} опускается близко к земле, встревоженный огнем, кровью или старыми мертвецами в воздухе.',
  'hudChrome.aiSpeech.companionSelfMurlocWaterCall':
    '{companionName} оживляется в сторону влажного воздуха, слыша воду там, где другие слышат только погоду.',
  'hudChrome.aiSpeech.companionSelfSpiderStillness':
    '{companionName} замирает, читая туман по крошечным движениям.',
  'hudChrome.aiSpeech.companionSelfElementalResonance':
    'Воздух вокруг {companionName} реагирует на погоду низким странным резонансом.',
  'hudChrome.aiSpeech.companionSelfDragonkinWatch':
    '{companionName} изучает высоту и старый камень с терпением, которое кажется унаследованным.',
  'hudChrome.aiSpeech.companionSelfMortalSafeHaven':
    '{companionName} успокаивается при дневном свете этого безопасного места, но продолжает наблюдать за выходами.',
  'hudChrome.aiSpeech.sceneDemonCompanionUnease':
    '{speakerName} следит одним глазом за {companionName}; такая тень меняет комнату.',
  'hudChrome.aiSpeech.sceneUndeadCompanionUnease':
    '{speakerName} замирает на {companionName}, читая тишину вокруг него.',
  'hudChrome.aiSpeech.sceneUndeadPressure':
    '{speakerName} понижает голос, беспокоясь о том, что мертвецы так близко.',
  'hudChrome.aiSpeech.sceneRainWeariness':
    'Капли дождя на плечах {speakerName}; ответ приходит короче, чем обычно.',
  'hudChrome.aiSpeech.sceneFogUnease':
    '{speakerName} продолжает наблюдать за туманом между словами.',
  'hudChrome.aiSpeech.sceneClearNightAwe':
    '{speakerName} прежде чем заговорить, украдкой смотрит на звезды.',
  'hudChrome.aiSpeech.sceneDayEnergy': '{speakerName} при дневном свете выглядит резче.',
  'hudChrome.aiSpeech.sceneNightFatigue': 'Голос {speakerName} смягчается ночной усталостью.',
  'hudChrome.aiSpeech.familySceneApproach':
    '{speakerName} реагирует на само место, приближаясь ближе, как будто земля что-то сказала.',
  'hudChrome.aiSpeech.familySceneAvoid': '{speakerName} неправильно читает воздух и пятится назад.',
  'hudChrome.aiSpeech.familySceneInspect':
    '{speakerName} стоит неподвижно, наблюдая за погодой, стенами и дорожками больше, чем вы.',
  'hudChrome.aiSpeech.familySceneBeastUneasy':
    '{speakerName} улавливает это место по запаху и переключается между голодом и осторожностью.',
  'hudChrome.aiSpeech.familySceneUndeadDrawn':
    '{speakerName} плывет к смерти в воздухе, как будто услышав собственное имя.',
  'hudChrome.aiSpeech.familySceneElementalResonance':
    '{speakerName} отвечает на это место низким, нечеловеческим резонансом.',
  'hudChrome.aiSpeech.familySceneDemonAmused':
    '{speakerName} наклоняется к страху вокруг этого места, явно довольный.',
  'hudChrome.aiSpeech.memoryRecognizesPlayer':
    '{speakerName} теперь узнает тебя, {playerName}. Дорога стала носить твоё имя.',
  'hudChrome.aiSpeech.memoryRumorEcho':
    '{speakerName} смотрит на {itemName}. Слухи о том, что ты оставил после себя, уже начали распространяться, {playerName}.',
  'hudChrome.aiSpeech.memorySingularityRumorEcho':
    '{speakerName} понижает голос; {playerName} {itemName} заставило что-то поблизости очнуться.',
  'hudChrome.aiSpeech.memoryQuestRumorEcho':
    '{speakerName} слышал о {questName}, {playerName}. Завершенная работа оставляет свои следы.',
  'hudChrome.aiSpeech.memoryPriestRecognizesPlayer':
    '{speakerName} теперь знает ваш шаг, {playerName}. Даже дорога к часовне сохраняет его.',
  'hudChrome.aiSpeech.memoryPriestRumorEcho':
    '{speakerName} смотрит с {itemName} на вас, словно взвешивая, предзнаменование это или признание.',
  'hudChrome.aiSpeech.memoryPriestQuestRumorEcho':
    '{speakerName} говорит о {questName}, как о свече, которую переносят от одной дороги к часовне к другой.',
  'hudChrome.aiSpeech.memoryCommanderRecognizesPlayer':
    '{speakerName} начал предъявлять вам обвинения под надежным свидетелем, {playerName}.',
  'hudChrome.aiSpeech.memoryCommanderRumorEcho':
    '{speakerName} отмечает {itemName} как отчет, а не как любопытство.',
  'hudChrome.aiSpeech.memoryCommanderQuestRumorEcho':
    '{speakerName} считает {questName} подтвержденной полевой работой и начинает перемещать людей вокруг нее.',
  'hudChrome.aiSpeech.memoryMerchantRecognizesPlayer':
    '{speakerName} помнит тебя, {playerName}. Имена со следом стоят больше, чем монета.',
  'hudChrome.aiSpeech.memoryMerchantRumorEcho':
    '{speakerName} исследования {itemName}. К сумеркам кто-то спросит, кто это оставил и что это значит.',
  'hudChrome.aiSpeech.memoryMerchantQuestRumorEcho':
    '{speakerName} уже оценивает, как {questName} повлияет на цены на дороги и на нервных покупателей.',
  'hudChrome.aiSpeech.memoryHerbalistRecognizesPlayer':
    '{speakerName} запоминает лекарства, которые вам нужны, {playerName}.',
  'hudChrome.aiSpeech.memoryHerbalistRumorEcho':
    '{speakerName} изучает {itemName} сначала по запаху, затем по беспокойству.',
  'hudChrome.aiSpeech.memoryHerbalistQuestRumorEcho':
    '{speakerName} говорит, что {questName} изменил местную болезнь вещей, если не вылечил ее.',
  'hudChrome.aiSpeech.memorySmithRecognizesPlayer':
    '{speakerName} кивает тебе, {playerName}, как кузнец, узнавающий клинок по зазубринам.',
  'hudChrome.aiSpeech.memorySmithRumorEcho':
    '{speakerName} глаза {itemName}. На наковальне обсуждают и хорошую сталь, и странные остатки.',
  'hudChrome.aiSpeech.memorySmithQuestRumorEcho':
    '{speakerName} говорит, что у {questName} на этот раз работа закончена чисто.',
  'hudChrome.aiSpeech.memoryScoutRecognizesPlayer':
    'Теперь у {speakerName} есть ваша мера, у {playerName}: треки, тайминг и все такое.',
  'hudChrome.aiSpeech.memoryScoutRumorEcho':
    '{speakerName} смотрит на {itemName}, уже помещая его на мысленную карту дороги.',
  'hudChrome.aiSpeech.memoryScoutQuestRumorEcho':
    '{speakerName} обозначает {questName} как подтверждение, а не шум костра.',
  'hudChrome.aiSpeech.memoryLoremasterRecognizesPlayer':
    '{speakerName} запоминает ваше имя, {playerName}, и помещает его рядом с вопросами, на которые нет ответа.',
  'hudChrome.aiSpeech.memoryLoremasterRumorEcho':
    '{speakerName} изучает {itemName} в качестве доказательства, а не сплетен, хотя сплетни будут распространять его в первую очередь.',
  'hudChrome.aiSpeech.memoryLoremasterQuestRumorEcho':
    '{speakerName} рассматривает {questName} как сноску, вставшую в основной текст.',
  'hudChrome.aiSpeech.memoryTidewatcherRecognizesPlayer':
    '{speakerName} теперь знает тебя, {playerName}. Ваше имя не раз переплывало воду.',
  'hudChrome.aiSpeech.memoryTidewatcherRumorEcho':
    '{speakerName} наблюдает за {itemName}, как рябь, которая еще не закончила расширяться.',
  'hudChrome.aiSpeech.memoryTidewatcherQuestRumorEcho':
    '{speakerName} говорит, что {questName} достиг ватерлинии, а ватерлиния повторяет все.',
  'hudChrome.aiSpeech.topicRecentFirstMeet':
    '{speakerName} делает ответ осторожным, {playerName}. Вы впервые знакомы друг с другом, но в этом месте уже есть небольшие знаки, на которые стоит обратить внимание.',
  'hudChrome.aiSpeech.topicRecentKnown':
    '{speakerName} отвечает тоном человека, который начал за вами следить, {playerName}.',
  'hudChrome.aiSpeech.topicRumorQuiet':
    '{speakerName} прислушивается к сплетням, но до этого угла пока ничего определенного не дошло.',
  'hudChrome.aiSpeech.topicPlace':
    '{speakerName} смотрит на близлежащую дорогу, погоду и стены, прежде чем ответить.',
  'hudChrome.aiSpeech.topicQuestHint':
    '{speakerName} связывает советы с тем, что уже известно вашему журналу.',
  'hudChrome.aiSpeech.topicQuestNoHint':
    'У {speakerName} пока нет честного руководства для вашей текущей работы.',
  'hudChrome.aiSpeech.objectInspectForge':
    '{itemName} ловит свет горна; металл, пот и дорожная пыль рассказывают небольшую историю.',
  'hudChrome.aiSpeech.objectInspectGrave':
    '{itemName} несет в себе холод погребенных мест, и воздух вокруг словно прислушивается.',
  'hudChrome.aiSpeech.objectInspectLake':
    'Влажный воздух собирается около {itemName}, как будто вода поблизости имеет свое мнение.',
  'hudChrome.aiSpeech.objectInspectDoor':
    'Кажется, что за порогом наблюдают; все, что ждет дальше, все еще следует старым правилам.',
  'hudChrome.aiSpeech.objectInspectSingularity':
    '{itemName} отказывается чувствовать себя обычным; сцена огибает его, чтобы перевести дух.',
  'hudChrome.aiSpeech.objectInspectGeneric':
    'Вы изучаете {itemName}. Соседняя сцена отвечает в мелких деталях.',
  'hudChrome.aiSpeech.sceneTraceSingularity':
    'Вы замечаете место, куда {itemName} привлек всеобщее внимание; воздух все еще кажется пробужденным.',
  'hudChrome.aiSpeech.sceneTraceCursed':
    'Кажется, что земля все еще отмечена {itemName}; даже обычные детали сохраняют дистанцию.',
  'hudChrome.aiSpeech.sceneTraceFood':
    'Угасающий запах {itemName} привлекает мелкие треки и более острое слушание из ближайшей темноты.',
  'hudChrome.aiSpeech.sceneTraceValuable':
    'Вы замечаете небольшие потертости, оставшиеся около {itemName}; кто-то или что-то взвешивало здесь свою ценность.',
  'hudChrome.aiSpeech.sceneTraceGeneric':
    'Это место до сих пор помнит {itemName} в мелких тревожных деталях.',
  'hudChrome.aiSpeech.worldTraceNpcSingularity':
    '{speakerName} изучает отметку, оставленную {itemName}, затем говорит так, как будто комната стала менее пустой.',
  'hudChrome.aiSpeech.worldTraceNpcCursed':
    '{speakerName} сохраняет расстояние от того места, где {itemName} отметило сцену.',
  'hudChrome.aiSpeech.worldTraceNpcFood':
    '{speakerName} замечает исчезающий знак {itemName}; даже голод оставляет свидетелей.',
  'hudChrome.aiSpeech.worldTraceNpcValuable':
    '{speakerName} смотрит на потертости вокруг {itemName}. Ценность всегда учит землю новому образцу.',
  'hudChrome.aiSpeech.worldTraceNpcGeneric':
    '{speakerName} читает тревожные детали вокруг {itemName}, прежде чем ответить.',
  'hudChrome.aiSpeech.worldDirectorUncanny':
    'Около {itemName} вся местность кажется вновь проснувшейся.',
  'hudChrome.aiSpeech.worldDirectorSceneUncanny':
    'Это место кажется вновь проснувшимся, как будто что-то здесь начало узнавать вас.',
  'hudChrome.aiSpeech.worldDirectorHaunted':
    'В этой области сохраняется более холодное настроение около {itemName}.',
  'hudChrome.aiSpeech.worldDirectorHungry':
    'Небольшие следы и запахи собираются в голодный узор около {itemName}.',
  'hudChrome.aiSpeech.worldDirectorCovetous':
    'Свежие потертости вокруг {itemName} заставляют это место чувствовать себя настороженным и расчетливым.',
  'hudChrome.aiSpeech.worldDirectorStirred':
    'Это место не заселено с тех пор, как {itemName} потревожило его.',
  'hudChrome.aiSpeech.worldDirectorQuestComplete':
    'Эта область становится светлее после {questName}; не совсем безопасно, но и менее одиноко.',
  'hudChrome.aiSpeech.bossMemoryDefeated':
    'Воздух все еще знает, куда упал {bossName}; Кажется, что комната смотрит на тебя по-другому.',
  'hudChrome.aiSpeech.bossMemoryWipe':
    'Победа {bossName} все еще давит на это место; даже твоя тень, кажется, помнит падение.',
  'hudChrome.aiSpeech.worldDirectorBossDefeated':
    'Эта область несет в себе шок от падения {bossName}.',
  'hudChrome.aiSpeech.worldDirectorBossWipe':
    'Кажется, что эта местность сосредоточена вокруг последней победы {bossName}.',
  'hudChrome.aiSpeech.bossPhaseBloodied':
    '{bossName} меняет свой ритм, настолько раненый, что начинает следить за каждым движением.',
  'hudChrome.aiSpeech.bossPhaseDesperate':
    '{bossName} близок к разрушению, и борьба внезапно становится острее.',
  'hudChrome.aiSpeech.sceneInspectForge':
    'Вы попадаете в кузницу: раскалённое железо, шум работы и тёплый пригород города.',
  'hudChrome.aiSpeech.sceneInspectChapel':
    'Вы видите разрушенную часовню: старый камень, могильную землю и колокол, который словно помнит.',
  'hudChrome.aiSpeech.sceneInspectLake':
    'Смотришь на причал озера: запах рыбы, открытая вода и тихая рябь под небом.',
  'hudChrome.aiSpeech.sceneInspectWatchpost':
    'Вы видите сторожевой пост: упорядоченные стены, линии обзора и погоду, движущуюся над возвышенностью.',
  'hudChrome.aiSpeech.sceneInspectCrypt':
    'Вы видите вход в склеп: запечатанный воздух, старая кровь и тропа, которая, кажется, поглощает звук.',
  'hudChrome.aiSpeech.sceneInspectGeneric':
    'Осматриваешься на месте: погода, трассы и мелкие детали начинают устраиваться сами собой.',
  'hudChrome.aiSpeech.unknownItem': 'что-то осталось позади',
  'hudChrome.aiSpeech.unknownObject': 'вещь перед тобой',
  'hudChrome.aiSpeech.unknownCompanion': 'твой компаньон',
  'hudChrome.aiSpeech.unknownBoss': 'встреча',
  'hudChrome.aiSpeech.unknownQuest': 'это работает',
};

const forkHostedRuRU: LocaleSupplement = {
  'hudChrome.hostedPlay.menuButton': 'Хостинговая игра',
  'hudChrome.hostedPlay.title': 'Хостинговая игра',
  'hudChrome.hostedPlay.statusLabel': 'Статус',
  'hudChrome.hostedPlay.objectiveLabel': 'Цель',
  'hudChrome.hostedPlay.resumeOnLogin': 'Возобновить при входе в систему',
  'hudChrome.hostedPlay.autoInviteNearbyLabel': 'Автоматическое приглашение ближайших игроков',
  'hudChrome.hostedPlay.autoInviteTargetPartySizeLabel':
    'Целевой размер группы автоматического приглашения',
  'hudChrome.hostedPlay.autoInviteTargetPartySizeAria':
    'Приглашайте, пока в группе не наберется {count} игроков.',
  'hudChrome.hostedPlay.partyModeLabel': 'Режим вечеринки',
  'hudChrome.hostedPlay.partyModeStatusLabel': 'Партийное поведение',
  'hudChrome.hostedPlay.groupModeLabel': 'Текущее состояние группы',
  'hudChrome.hostedPlay.groupLeaderLabel': 'Руководитель группы',
  'hudChrome.hostedPlay.groupLeaderDistanceLabel': 'Расстояние лидера',
  'hudChrome.hostedPlay.socialPendingRepliesLabel': 'Ожидающие ответы',
  'hudChrome.hostedPlay.socialFriendsLabel': 'Друзья',
  'hudChrome.hostedPlay.socialBlocksLabel': 'Заблокированные игроки',
  'hudChrome.hostedPlay.lastWhisperFromLabel': 'Последний шепот от',
  'hudChrome.hostedPlay.lastSocialActionLabel': 'Последнее социальное действие',
  'hudChrome.hostedPlay.llmEnabledLabel': 'LLM наложение',
  'hudChrome.hostedPlay.llmPlanModeLabel': 'LLM Социальный режим',
  'hudChrome.hostedPlay.llmPlanFocusLabel': 'LLM Фокус',
  'hudChrome.hostedPlay.llmReplyLabel': 'LLM Ответить',
  'hudChrome.hostedPlay.llmReplyTargetLabel': 'Цель ответа LLM',
  'hudChrome.hostedPlay.pauseLabel': 'Причина паузы',
  'hudChrome.hostedPlay.errorLabel': 'Время выполнения',
  'hudChrome.hostedPlay.loadingStatus': 'Загрузка статуса организованной игры...',
  'hudChrome.hostedPlay.statusLoadFailed': 'Не удалось загрузить статус организованной игры.',
  'hudChrome.hostedPlay.updateFailed': 'Не удалось обновить размещенную игру прямо сейчас.',
  'hudChrome.hostedPlay.settingsSaveFailed': 'Не удалось сохранить настройки хост-игры.',
  'hudChrome.hostedPlay.serverRestartRequired':
    'Для хостовой игры требуется перезагрузка локального сервера, прежде чем этот переключатель сможет работать.',
  'hudChrome.hostedPlay.objectiveNone': 'Нет активной цели',
  'hudChrome.hostedPlay.enable': 'Включить хостинговую игру',
  'hudChrome.hostedPlay.disable': 'Отключить хостинговую игру',
  'hudChrome.hostedPlay.refresh': 'Обновить',
  'hudChrome.hostedPlay.runtimeIssue': 'Автоматизация столкнулась с проблемой во время выполнения.',
  'hudChrome.hostedPlay.details.show': 'Посмотреть детали',
  'hudChrome.hostedPlay.details.hide': 'Скрыть детали',
  'hudChrome.hostedPlay.details.title': 'Подробности размещенной игры',
  'hudChrome.hostedPlay.details.empty': 'Диагностика хостинг-игр пока недоступна.',
  'hudChrome.hostedPlay.details.unavailable': 'Недоступно',
  'hudChrome.hostedPlay.details.sectionBrain': 'Мозг',
  'hudChrome.hostedPlay.details.sectionMovement': 'Движение',
  'hudChrome.hostedPlay.details.sectionParty': 'Вечеринка',
  'hudChrome.hostedPlay.details.sectionSocial': 'Социальные',
  'hudChrome.hostedPlay.details.sectionLlmSocial': 'LLM Социальные сети',
  'hudChrome.hostedPlay.details.lastBrain': 'Последний мозговой тик',
  'hudChrome.hostedPlay.details.lastAutomation': 'Последний тик автоматизации',
  'hudChrome.hostedPlay.details.objectiveId': 'Идентификатор цели',
  'hudChrome.hostedPlay.details.objectiveLabel': 'Метка цели',
  'hudChrome.hostedPlay.details.objectiveQuest': 'Идентификатор квеста',
  'hudChrome.hostedPlay.details.objectiveDungeon': 'Идентификатор подземелья',
  'hudChrome.hostedPlay.details.partySize': 'Рекомендуемый размер вечеринки',
  'hudChrome.hostedPlay.details.objectiveSince': 'Цель с момента',
  'hudChrome.hostedPlay.details.lastProgress': 'Последний прогресс',
  'hudChrome.hostedPlay.details.lastError': 'Последняя ошибка',
  'hudChrome.hostedPlay.details.brainDrivePaused': 'Мозговой привод приостановлен',
  'hudChrome.hostedPlay.details.facing': 'Облицовка',
  'hudChrome.hostedPlay.details.pathLength': 'Длина пути',
  'hudChrome.hostedPlay.details.nextPathPoint': 'Следующая точка пути',
  'hudChrome.hostedPlay.details.campIndex': 'Индекс лагеря',
  'hudChrome.hostedPlay.details.noTargetSince': 'Нет цели с тех пор',
  'hudChrome.hostedPlay.details.stuckResets': 'Зависший сброс',
  'hudChrome.hostedPlay.details.travelGoal': 'Цель путешествия',
  'hudChrome.hostedPlay.details.moveInput': 'Переместить ввод',
  'hudChrome.hostedPlay.details.commands': 'Команды',
  'hudChrome.hostedPlay.details.lastCommandAges': 'Недавние эпохи командования',
  'hudChrome.hostedPlay.details.groupMode': 'Групповой режим',
  'hudChrome.hostedPlay.details.groupLeader': 'Руководитель группы',
  'hudChrome.hostedPlay.details.groupDistance': 'Групповое расстояние',
  'hudChrome.hostedPlay.details.partyPaused': 'Мозг на паузе на вечеринке',
  'hudChrome.hostedPlay.details.partyRole': 'Партийная роль',
  'hudChrome.hostedPlay.details.partyIntent': 'Намерение партии',
  'hudChrome.hostedPlay.details.partyIntentTarget': 'Цель намерения',
  'hudChrome.hostedPlay.details.lastPartyChat': 'Последний чат вечеринки',
  'hudChrome.hostedPlay.details.llmEnabled': 'LLM включен',
  'hudChrome.hostedPlay.details.llmPending': 'В ожидании',
  'hudChrome.hostedPlay.details.llmStatus': 'Статус',
  'hudChrome.hostedPlay.details.llmProvider': 'Поставщик',
  'hudChrome.hostedPlay.details.llmLatency': 'Задержка',
  'hudChrome.hostedPlay.details.llmCacheHit': 'Попадание в кэш',
  'hudChrome.hostedPlay.details.llmReason': 'Причина',
  'hudChrome.hostedPlay.details.llmFocus': 'Фокус',
  'hudChrome.hostedPlay.details.llmTarget': 'Цель',
  'hudChrome.hostedPlay.details.promptChars': 'Подсказки Персонажи',
  'hudChrome.hostedPlay.details.rawOutputChars': 'Необработанные выходные символы',
  'hudChrome.hostedPlay.details.planPrompt': 'План подсказки',
  'hudChrome.hostedPlay.details.planRawOutput': 'Планирование исходного вывода',
  'hudChrome.hostedPlay.details.socialPrompt': 'Социальная подсказка',
  'hudChrome.hostedPlay.details.socialRawOutput': 'Социальная сырьевая продукция',
  'hudChrome.hostedPlay.details.travelGoalValue': '{target}, диапазон {range}, клавиша {key}',
  'hudChrome.hostedPlay.details.pendingReplyHeader': 'Ответ на {name}, редакция {revision}',
  'hudChrome.hostedPlay.details.pendingReplyIncoming': 'Входящий',
  'hudChrome.hostedPlay.details.pendingReplyFallback': 'Резервный ответ',
  'hudChrome.hostedPlay.details.pendingReplyAskedFriend': 'спросил друга',
  'hudChrome.hostedPlay.details.pendingReplyLlmStatus': 'Статус магистра права',
  'hudChrome.hostedPlay.details.pendingReplyLlmReply': 'LLM Ответить',
  'hudChrome.hostedPlay.details.pendingReplyLlmFriend': 'LLM Дружеское действие',
  'hudChrome.hostedPlay.details.pendingReplyPresence': 'Эмоция присутствия',
  'hudChrome.hostedPlay.details.pendingReplyRequested': 'Требуется LLM',
  'hudChrome.hostedPlay.partyMode.solo': 'Соло-прогресс',
  'hudChrome.hostedPlay.partyMode.followLeader': 'Следуйте за лидером партии',
  'hudChrome.hostedPlay.partyMode.preferGroup': 'Приоритизация вечеринки',
  'hudChrome.hostedPlay.groupMode.none': 'Нет активной групповой координации.',
  'hudChrome.hostedPlay.groupMode.acceptInvite': 'Принятие приглашения на вечеринку',
  'hudChrome.hostedPlay.groupMode.assistParty': 'Помощь отряду в бою',
  'hudChrome.hostedPlay.groupMode.brain': 'Запуск нормального прогрессирующего мозга',
  'hudChrome.hostedPlay.groupMode.followLeader': 'Вслед за лидером партии',
  'hudChrome.hostedPlay.groupMode.holdRegroup': 'Ожидание перегруппировки партии',
  'hudChrome.hostedPlay.groupMode.inviteNearby': 'Приглашение ближайших игроков',
  'hudChrome.hostedPlay.groupMode.prepareParty': 'Удержание для подготовки к бою',
  'hudChrome.hostedPlay.groupMode.recoverParty': 'Холдинг для восстановления партии',
  'hudChrome.hostedPlay.partyRole.healer': 'Целитель',
  'hudChrome.hostedPlay.partyRole.dps': 'Повреждать',
  'hudChrome.hostedPlay.partyIntent.routePlan': 'План маршрута',
  'hudChrome.hostedPlay.partyIntent.buffs': 'Баффы и подготовка',
  'hudChrome.hostedPlay.partyIntent.focus': 'Фокус огня',
  'hudChrome.hostedPlay.partyIntent.praise': 'Хвалить',
  'hudChrome.hostedPlay.partyIntent.correction': 'Коррекция',
  'hudChrome.hostedPlay.partyIntent.recovery': 'Восстановление',
  'hudChrome.hostedPlay.partyBehavior.advance': 'продвигать',
  'hudChrome.hostedPlay.partyBehavior.prepare': 'подготовить',
  'hudChrome.hostedPlay.partyBehavior.assist': 'помогать',
  'hudChrome.hostedPlay.partyBehavior.celebrate': 'праздновать',
  'hudChrome.hostedPlay.partyBehavior.regroup': 'перегруппироваться',
  'hudChrome.hostedPlay.partyBehavior.recover': 'восстанавливаться',
  'hudChrome.hostedPlay.llmStatus.pending': 'В ожидании',
  'hudChrome.hostedPlay.llmStatus.accepted': 'Принял',
  'hudChrome.hostedPlay.llmStatus.cacheHit': 'Попадание в кэш',
  'hudChrome.hostedPlay.llmStatus.rejected': 'Отклоненный',
  'hudChrome.hostedPlay.llmStatus.error': 'Ошибка',
  'hudChrome.hostedPlay.llmStatus.budgetDenied': 'Бюджет ограничен',
  'hudChrome.hostedPlay.llmStatus.disabled': 'Неполноценный',
  'hudChrome.hostedPlay.llmMode.quiet': 'Тихий',
  'hudChrome.hostedPlay.llmMode.brief': 'Краткий',
  'hudChrome.hostedPlay.llmMode.friendly': 'Дружелюбно',
  'hudChrome.hostedPlay.llmMode.helpful': 'Полезный',
  'hudChrome.hostedPlay.socialAction.friendAdd': 'Добавил {name} в друзья',
  'hudChrome.hostedPlay.socialAction.reply': 'Ответил на {name}',
  'hudChrome.hostedPlay.socialAction.wave': 'Помахал в {name}',
  'hudChrome.hostedPlay.socialAction.cheer': 'Поздравил с {name}',
  'hudChrome.hostedPlay.socialAction.sentChat': 'Отправил команду в социальный чат',
  'hudChrome.hostedPlay.state.offline': 'Оффлайн',
  'hudChrome.hostedPlay.state.active': 'Бег',
  'hudChrome.hostedPlay.state.paused': 'Приостановлено',
  'hudChrome.hostedPlay.pause.runtimeError': 'Приостановлено из-за ошибки автоматизации.',
};

const hostedPlayCsCZ: LocaleSupplement = {
  'hudChrome.hostedPlay.actionLogLabel': 'Protokol akcí',
  'hudChrome.hostedPlay.log.accept': 'Automatická hra: vyráží přijmout úkol {quest}.',
  'hudChrome.hostedPlay.log.questWork': 'Automatická hra: pokračuje v úkolu {quest}.',
  'hudChrome.hostedPlay.log.turnIn': 'Automatická hra: vyráží odevzdat úkol {quest}.',
  'hudChrome.hostedPlay.log.resupply': 'Automatická hra: míří k obchodníkovi doplnit zásoby.',
  'hudChrome.hostedPlay.log.upgrade': 'Automatická hra: míří k obchodníkovi koupit vylepšení.',
  'hudChrome.hostedPlay.log.grind': 'Automatická hra: získává zkušenosti.',
  'hudChrome.hostedPlay.log.recover': 'Automatická hra: zotavuje se mezi boji.',
  'hudChrome.hostedPlay.log.retreat': 'Automatická hra: ustupuje do bezpečí.',
  'hudChrome.hostedPlay.log.release': 'Automatická hra: uvolňuje ducha.',
  'hudChrome.hostedPlay.log.gatherParty': 'Automatická hra: shromažďuje družinu pro úkol {quest}.',
  'hudChrome.hostedPlay.log.leaveDungeon': 'Automatická hra: opouští {dungeon}.',
  'hudChrome.hostedPlay.log.leaveDungeonForQuest':
    'Automatická hra: opouští dungeon a míří odevzdat úkol {quest}.',
};

const hostedPlayNlNL: LocaleSupplement = {
  'hudChrome.hostedPlay.actionLogLabel': 'Logboek met chatacties',
  'hudChrome.hostedPlay.log.accept': 'Automatisch spel: onderweg om {quest} te accepteren.',
  'hudChrome.hostedPlay.log.questWork': 'Automatisch spel: bezig met {quest}.',
  'hudChrome.hostedPlay.log.turnIn': 'Automatisch spel: onderweg om {quest} in te leveren.',
  'hudChrome.hostedPlay.log.resupply':
    'Automatisch spel: onderweg naar een handelaar om voorraden aan te vullen.',
  'hudChrome.hostedPlay.log.upgrade':
    'Automatisch spel: onderweg naar een handelaar om een verbetering te kopen.',
  'hudChrome.hostedPlay.log.grind': 'Automatisch spel: ervaring aan het verzamelen.',
  'hudChrome.hostedPlay.log.recover': 'Automatisch spel: aan het herstellen tussen gevechten.',
  'hudChrome.hostedPlay.log.retreat': 'Automatisch spel: trekt zich terug naar een veilige plek.',
  'hudChrome.hostedPlay.log.release': 'Automatisch spel: laat de geest vrij.',
  'hudChrome.hostedPlay.log.gatherParty': 'Automatisch spel: stelt een groep samen voor {quest}.',
  'hudChrome.hostedPlay.log.leaveDungeon': 'Automatisch spel: verlaat {dungeon}.',
  'hudChrome.hostedPlay.log.leaveDungeonForQuest':
    'Automatisch spel: verlaat de kerker om {quest} in te leveren.',
};

const hostedPlayPlPL: LocaleSupplement = {
  'hudChrome.hostedPlay.actionLogLabel': 'Dziennik działań na czacie',
  'hudChrome.hostedPlay.log.accept': 'Automatyczna gra: zmierza przyjąć zadanie {quest}.',
  'hudChrome.hostedPlay.log.questWork': 'Automatyczna gra: realizuje zadanie {quest}.',
  'hudChrome.hostedPlay.log.turnIn': 'Automatyczna gra: zmierza oddać zadanie {quest}.',
  'hudChrome.hostedPlay.log.resupply': 'Automatyczna gra: zmierza do kupca uzupełnić zapasy.',
  'hudChrome.hostedPlay.log.upgrade': 'Automatyczna gra: zmierza do kupca po ulepszenie.',
  'hudChrome.hostedPlay.log.grind': 'Automatyczna gra: zdobywa doświadczenie.',
  'hudChrome.hostedPlay.log.recover': 'Automatyczna gra: odpoczywa między walkami.',
  'hudChrome.hostedPlay.log.retreat': 'Automatyczna gra: wycofuje się w bezpieczne miejsce.',
  'hudChrome.hostedPlay.log.release': 'Automatyczna gra: uwalnia ducha.',
  'hudChrome.hostedPlay.log.gatherParty': 'Automatyczna gra: zbiera drużynę do zadania {quest}.',
  'hudChrome.hostedPlay.log.leaveDungeon': 'Automatyczna gra: opuszcza {dungeon}.',
  'hudChrome.hostedPlay.log.leaveDungeonForQuest':
    'Automatyczna gra: opuszcza loch, aby oddać zadanie {quest}.',
};

const hostedPlayIdID: LocaleSupplement = {
  'hudChrome.hostedPlay.actionLogLabel': 'Log Tindakan Obrolan',
  'hudChrome.hostedPlay.log.accept': 'Permainan otomatis: menuju untuk menerima {quest}.',
  'hudChrome.hostedPlay.log.questWork': 'Permainan otomatis: sedang mengerjakan {quest}.',
  'hudChrome.hostedPlay.log.turnIn': 'Permainan otomatis: menuju untuk menyerahkan {quest}.',
  'hudChrome.hostedPlay.log.resupply':
    'Permainan otomatis: menuju pedagang untuk mengisi perbekalan.',
  'hudChrome.hostedPlay.log.upgrade':
    'Permainan otomatis: menuju pedagang untuk membeli peningkatan.',
  'hudChrome.hostedPlay.log.grind': 'Permainan otomatis: sedang mengumpulkan pengalaman.',
  'hudChrome.hostedPlay.log.recover':
    'Permainan otomatis: sedang memulihkan diri di antara pertempuran.',
  'hudChrome.hostedPlay.log.retreat': 'Permainan otomatis: mundur ke tempat aman.',
  'hudChrome.hostedPlay.log.release': 'Permainan otomatis: melepaskan roh.',
  'hudChrome.hostedPlay.log.gatherParty':
    'Permainan otomatis: mengumpulkan kelompok untuk {quest}.',
  'hudChrome.hostedPlay.log.leaveDungeon': 'Permainan otomatis: meninggalkan {dungeon}.',
  'hudChrome.hostedPlay.log.leaveDungeonForQuest':
    'Permainan otomatis: meninggalkan ruang bawah tanah untuk menyerahkan {quest}.',
};

const hostedPlayTrTR: LocaleSupplement = {
  'hudChrome.hostedPlay.actionLogLabel': 'Sohbet Eylem Günlüğü',
  'hudChrome.hostedPlay.log.accept': 'Otomatik oyun: {quest} görevini kabul etmeye gidiyor.',
  'hudChrome.hostedPlay.log.questWork': 'Otomatik oyun: {quest} görevi üzerinde çalışıyor.',
  'hudChrome.hostedPlay.log.turnIn': 'Otomatik oyun: {quest} görevini teslim etmeye gidiyor.',
  'hudChrome.hostedPlay.log.resupply': 'Otomatik oyun: erzak almak için satıcıya gidiyor.',
  'hudChrome.hostedPlay.log.upgrade':
    'Otomatik oyun: geliştirme satın almak için satıcıya gidiyor.',
  'hudChrome.hostedPlay.log.grind': 'Otomatik oyun: deneyim kazanıyor.',
  'hudChrome.hostedPlay.log.recover': 'Otomatik oyun: çatışmalar arasında toparlanıyor.',
  'hudChrome.hostedPlay.log.retreat': 'Otomatik oyun: güvenli bir yere çekiliyor.',
  'hudChrome.hostedPlay.log.release': 'Otomatik oyun: ruhunu serbest bırakıyor.',
  'hudChrome.hostedPlay.log.gatherParty': 'Otomatik oyun: {quest} görevi için grup topluyor.',
  'hudChrome.hostedPlay.log.leaveDungeon': 'Otomatik oyun: {dungeon} bölgesinden ayrılıyor.',
  'hudChrome.hostedPlay.log.leaveDungeonForQuest':
    'Otomatik oyun: {quest} görevini teslim etmek için zindandan ayrılıyor.',
};

const hostedPlaySvSE: LocaleSupplement = {
  'hudChrome.hostedPlay.actionLogLabel': 'Logg över chattåtgärder',
  'hudChrome.hostedPlay.log.accept': 'Automatiskt spel: på väg för att acceptera {quest}.',
  'hudChrome.hostedPlay.log.questWork': 'Automatiskt spel: arbetar med {quest}.',
  'hudChrome.hostedPlay.log.turnIn': 'Automatiskt spel: på väg för att lämna in {quest}.',
  'hudChrome.hostedPlay.log.resupply':
    'Automatiskt spel: på väg till en handlare för att fylla på förråden.',
  'hudChrome.hostedPlay.log.upgrade':
    'Automatiskt spel: på väg till en handlare för att köpa en uppgradering.',
  'hudChrome.hostedPlay.log.grind': 'Automatiskt spel: samlar erfarenhet.',
  'hudChrome.hostedPlay.log.recover': 'Automatiskt spel: återhämtar sig mellan strider.',
  'hudChrome.hostedPlay.log.retreat': 'Automatiskt spel: drar sig tillbaka till säkerhet.',
  'hudChrome.hostedPlay.log.release': 'Automatiskt spel: frigör anden.',
  'hudChrome.hostedPlay.log.gatherParty': 'Automatiskt spel: samlar en grupp för {quest}.',
  'hudChrome.hostedPlay.log.leaveDungeon': 'Automatiskt spel: lämnar {dungeon}.',
  'hudChrome.hostedPlay.log.leaveDungeonForQuest':
    'Automatiskt spel: lämnar fängelsehålan för att lämna in {quest}.',
};

const hostedPlayViVN: LocaleSupplement = {
  'hudChrome.hostedPlay.actionLogLabel': 'Nhật ký hành động trò chuyện',
  'hudChrome.hostedPlay.log.accept': 'Chơi tự động: đang đến nhận {quest}.',
  'hudChrome.hostedPlay.log.questWork': 'Chơi tự động: đang thực hiện {quest}.',
  'hudChrome.hostedPlay.log.turnIn': 'Chơi tự động: đang đến trả {quest}.',
  'hudChrome.hostedPlay.log.resupply': 'Chơi tự động: đang đến chỗ thương nhân để bổ sung vật tư.',
  'hudChrome.hostedPlay.log.upgrade': 'Chơi tự động: đang đến chỗ thương nhân để mua nâng cấp.',
  'hudChrome.hostedPlay.log.grind': 'Chơi tự động: đang kiếm kinh nghiệm.',
  'hudChrome.hostedPlay.log.recover': 'Chơi tự động: đang hồi phục giữa các trận chiến.',
  'hudChrome.hostedPlay.log.retreat': 'Chơi tự động: đang rút lui về nơi an toàn.',
  'hudChrome.hostedPlay.log.release': 'Chơi tự động: đang giải phóng linh hồn.',
  'hudChrome.hostedPlay.log.gatherParty': 'Chơi tự động: đang tập hợp nhóm cho {quest}.',
  'hudChrome.hostedPlay.log.leaveDungeon': 'Chơi tự động: đang rời khỏi {dungeon}.',
  'hudChrome.hostedPlay.log.leaveDungeonForQuest':
    'Chơi tự động: đang rời khỏi hầm ngục để trả {quest}.',
};

const hostedPlayDaDK: LocaleSupplement = {
  'hudChrome.hostedPlay.actionLogLabel': 'Log over chathandlinger',
  'hudChrome.hostedPlay.log.accept': 'Automatisk spil: på vej for at acceptere {quest}.',
  'hudChrome.hostedPlay.log.questWork': 'Automatisk spil: arbejder på {quest}.',
  'hudChrome.hostedPlay.log.turnIn': 'Automatisk spil: på vej for at aflevere {quest}.',
  'hudChrome.hostedPlay.log.resupply':
    'Automatisk spil: på vej til en handelsmand for at fylde forsyninger op.',
  'hudChrome.hostedPlay.log.upgrade':
    'Automatisk spil: på vej til en handelsmand for at købe en opgradering.',
  'hudChrome.hostedPlay.log.grind': 'Automatisk spil: samler erfaring.',
  'hudChrome.hostedPlay.log.recover': 'Automatisk spil: kommer sig mellem kampe.',
  'hudChrome.hostedPlay.log.retreat': 'Automatisk spil: trækker sig tilbage i sikkerhed.',
  'hudChrome.hostedPlay.log.release': 'Automatisk spil: frigiver ånden.',
  'hudChrome.hostedPlay.log.gatherParty': 'Automatisk spil: samler en gruppe til {quest}.',
  'hudChrome.hostedPlay.log.leaveDungeon': 'Automatisk spil: forlader {dungeon}.',
  'hudChrome.hostedPlay.log.leaveDungeonForQuest':
    'Automatisk spil: forlader fangekælderen for at aflevere {quest}.',
};

export const localeSupplements = {
  es: hostedPlayEs,
  es_ES: hostedPlayEs,
  fr_FR: hostedPlayFrFR,
  fr_CA: hostedPlayFrFR,
  it_IT: hostedPlayItIT,
  de_DE: hostedPlayDeDE,
  zh_CN: hostedPlayZhCN,
  zh_TW: { ...hostedPlayZhTW, ...forkAiZhTW, ...forkHostedZhTW },
  ko_KR: { ...hostedPlayKoKR, ...forkAiKoKR, ...forkHostedKoKR },
  ja_JP: { ...hostedPlayJaJP, ...forkAiJaJP, ...forkHostedJaJP },
  pt_BR: hostedPlayPtBR,
  ru_RU: { ...hostedPlayRuRU, ...forkAiRuRU, ...forkHostedRuRU },
  cs_CZ: hostedPlayCsCZ,
  nl_NL: hostedPlayNlNL,
  pl_PL: hostedPlayPlPL,
  id_ID: hostedPlayIdID,
  tr_TR: hostedPlayTrTR,
  sv_SE: hostedPlaySvSE,
  vi_VN: hostedPlayViVN,
  da_DK: hostedPlayDaDK,
} satisfies Record<string, LocaleSupplement>;

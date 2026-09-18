/**
 * What the bot says it is.
 *
 * Its own module so the composition root can register the bot's identity with
 * Telegram at boot without importing the message handlers — which import the
 * composition root back. A cycle that only works because one side of it is a
 * dynamic import is a cycle waiting to be tripped over.
 *
 * All of it is declarative and idempotent, which is why the server applies it
 * on every start rather than leaving it as a checklist in BotFather that
 * somebody has to remember after a deploy.
 */

export interface BotCommandSpec {
  command: string;
  description: string;
}

export const BOT_COMMANDS: BotCommandSpec[] = [
  { command: 'start', description: 'Open Duel Battle' },
  { command: 'play', description: 'Start a duel' },
  { command: 'profile', description: 'View your profile' },
  { command: 'stats', description: 'Your record in detail' },
  { command: 'leaderboard', description: 'The ladder' },
  { command: 'matches', description: 'Recent matches' },
  { command: 'invite', description: 'Invite a friend' },
  { command: 'achievements', description: 'Awards you have earned' },
  { command: 'challenges', description: "Today's quests" },
  { command: 'premium', description: 'Duel Battle Premium' },
  { command: 'settings', description: 'Notifications and account' },
  { command: 'help', description: 'How the game works' },
  { command: 'support', description: 'Contact support' },
  { command: 'paysupport', description: 'Payment help' },
];

export const BOT_COMMANDS_RU: BotCommandSpec[] = [
  { command: 'start', description: 'Открыть Duel Battle' },
  { command: 'play', description: 'Начать дуэль' },
  { command: 'profile', description: 'Твой профиль' },
  { command: 'stats', description: 'Подробная статистика' },
  { command: 'leaderboard', description: 'Таблица лидеров' },
  { command: 'matches', description: 'Последние матчи' },
  { command: 'invite', description: 'Пригласить друга' },
  { command: 'achievements', description: 'Полученные награды' },
  { command: 'challenges', description: 'Задания дня' },
  { command: 'premium', description: 'Duel Battle Premium' },
  { command: 'settings', description: 'Уведомления и аккаунт' },
  { command: 'help', description: 'Как играть' },
  { command: 'support', description: 'Поддержка' },
  { command: 'paysupport', description: 'Помощь с оплатой' },
];

export const BOT_DESCRIPTION =
  'Duel Battle is a real-time 1v1 game you play with your camera. Two players get the same challenge, ' +
  'find the answer in the room around them, and the better answer takes the round. ' +
  'Climb the ladder, build a streak, and challenge your friends directly from Telegram.';

export const BOT_DESCRIPTION_RU =
  'Duel Battle — дуэли один на один в реальном времени, через камеру. Оба игрока получают одно задание, ' +
  'ищут ответ в комнате вокруг себя, и раунд забирает тот, чей ответ лучше. ' +
  'Поднимайся в таблице, держи серию и вызывай друзей прямо из Telegram.';

export const BOT_SHORT_DESCRIPTION =
  'Real-time 1v1 duels. Same challenge, one camera each, first to find it wins.';

export const BOT_SHORT_DESCRIPTION_RU =
  'Дуэли один на один. Одно задание, две камеры, побеждает тот, кто найдёт первым.';

/** The label on the button beside the chat input. One tap into the game. */
export const BOT_MENU_BUTTON_TEXT = '⚔️ Play';

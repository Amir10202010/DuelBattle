/**
 * The Mini App, in Russian.
 *
 * Same mechanism the rest of the app uses: the English string in the source is
 * the key. Two things are worth knowing about that.
 *
 * An exact key always wins over a pattern, and that matters here — "All
 * matches" would otherwise be swallowed by the existing `{0} matches` template
 * and come out as "Матчей: All". Every Mini App string therefore has an entry,
 * including the ones that look obvious.
 *
 * The register is the game's: second person, informal, short. A phone screen in
 * a chat app has no room for a sentence that could be half the length.
 *
 * Strings the *server* writes and the client renders — quest titles, premium
 * benefits — are translated here too, because they are product copy that
 * happens to arrive over HTTP.
 */
export const telegramRu: Record<string, string> = {
  // -- Shell and navigation -------------------------------------------------
  Sections: 'Разделы',
  'Duel Battle': 'Duel Battle',
  'Opening Duel Battle…': 'Открываем Duel Battle…',
  'This screen is the Telegram version of the game. Open it from the bot and it signs you in automatically.':
    'Это версия игры для Telegram. Открой её из бота — вход будет автоматическим.',
  'Play in the browser instead': 'Открыть в браузере',
  'That did not open': 'Не открылось',
  'We could not open your player.': 'Не удалось открыть твой профиль.',
  'Try again': 'Попробовать снова',
  Close: 'Закрыть',
  'That did not load': 'Не загрузилось',
  'That did not work.': 'Не получилось.',
  'Loading…': 'Загружаем…',
  'One moment.': 'Секунду.',

  // -- Home -----------------------------------------------------------------
  'Ready for a duel?': 'Готов к дуэли?',
  'Keep the run going': 'Не упусти серию',
  'Same challenge, one camera each. First to find it wins.':
    'Одно задание на двоих, у каждого своя камера. Кто найдёт первым — тот и взял раунд.',
  'Find an opponent': 'Найти соперника',
  'Next rung': 'Следующая ступень',
  'rating away': 'рейтинга до неё',
  Placement: 'Отбор',
  Today: 'Сегодня',
  Recent: 'Последние матчи',
  'All matches': 'Все матчи',
  'The ladder': 'Таблица лидеров',
  'Full board': 'Вся таблица',
  'Waiting for you': 'Ждёт тебя',
  'challenged you to a duel': 'вызывает тебя на дуэль',
  'All quests': 'Все задания',
  'No duels yet': 'Дуэлей пока нет',
  'Your first finished match is the one that starts your rating.':
    'Первый сыгранный матч запускает твой рейтинг.',
  'Play now': 'Играть',
  'The board is empty': 'Таблица пуста',
  'Five ranked matches puts you on it, and right now first place is open.':
    'Пять рейтинговых матчей — и ты в таблице. Первое место сейчас свободно.',
  'Play a ranked duel': 'Сыграть рейтинговую дуэль',

  // -- Duel -----------------------------------------------------------------
  'Start a duel': 'Начать дуэль',
  'Both players get the same challenge. Find it in the room around you and show it first.':
    'Оба получают одно задание. Найди нужное в своей комнате и покажи первым.',
  'Ranked. Moves your rating, pays XP and Battle coins.':
    'Рейтинговый матч: меняет рейтинг, даёт опыт и Battle коины.',
  'No connection to the game server.': 'Нет связи с игровым сервером.',
  'Finding your opponent…': 'Ищем соперника…',
  'You are first in line. This takes longer when the lobby is quiet.':
    'Ты первый в очереди. Когда в лобби тихо, ждать дольше.',
  'Nobody nearby yet. The search widens the longer you wait.':
    'Пока никого рядом. Чем дольше ждёшь, тем шире поиск.',
  'Stop searching': 'Остановить поиск',
  'Challenge a friend instead': 'Лучше позвать друга',
  'Play a friend': 'Сыграть с другом',
  'Challenge a friend': 'Позвать друга',
  'Creating…': 'Создаём…',
  'Challenge sent': 'Вызов отправлен',
  'It stays open for a day. They can accept whenever they like.':
    'Вызов держится сутки — друг примет его когда захочет.',
  'Share it again': 'Отправить ещё раз',
  'Could not create that duel.': 'Не удалось создать дуэль.',
  'Friendly duels do not move your rating. Everything else counts.':
    'Дружеские дуэли не меняют рейтинг. Всё остальное засчитывается.',
  'Challenges waiting': 'Вызовы ждут',
  'wants to duel you': 'зовёт тебя на дуэль',
  Open: 'Открыть',
  "Today's quests": 'Задания дня',
  'See all': 'Все',
  'Opponent found': 'Соперник найден',
  'Getting the arena ready. You will need your camera.':
    'Готовим арену. Понадобится камера.',
  'Entering the arena…': 'Входим на арену…',
  Opponent: 'Соперник',
  VS: 'VS',
  ready: 'готов',

  // -- Challenge ------------------------------------------------------------
  'Opening the challenge…': 'Открываем вызов…',
  'Your challenge': 'Твой вызов',
  'That duel is gone.': 'Этой дуэли больше нет.',
  'This challenge is closed. Ask for a new one.': 'Вызов закрыт. Попроси новый.',
  'Enter the duel': 'Войти в дуэль',
  'Accept the duel': 'Принять вызов',
  'Accepting…': 'Принимаем…',
  'Waiting for somebody to accept. Share it again?': 'Ждём, кто примет. Отправить ещё раз?',
  Share: 'Отправить',
  'Not now': 'Не сейчас',
  'Cancel this challenge': 'Отменить вызов',
  'Waiting…': 'Ждём…',
  'open seat': 'место свободно',

  // -- Ladder ---------------------------------------------------------------
  Leaderboard: 'Таблица лидеров',
  'Who to compare with': 'С кем сравнивать',
  Everyone: 'Все',
  'Reading the ladder…': 'Читаем таблицу…',
  'Could not load the board.': 'Не удалось загрузить таблицу.',
  'No friends on the board': 'Друзей в таблице нет',
  'Add somebody after a duel and they show up here.':
    'Добавь кого-нибудь после дуэли — он появится здесь.',
  'Find people': 'Найти людей',
  'Five ranked matches puts a player on the board.':
    'Пять рейтинговых матчей — и игрок в таблице.',
  'Your place': 'Твоё место',
  Back: 'Назад',
  More: 'Ещё',

  // -- Friends --------------------------------------------------------------
  'Bring someone in': 'Позови своих',
  'Challenge your friends to a real-time duel. When they finish their first match you both get Battle coins.':
    'Вызови друзей на дуэль вживую. Когда друг сыграет первый матч, Battle коины получите оба.',
  'Share your invite': 'Отправить приглашение',
  Invited: 'Приглашено',
  of: 'из',
  'have played': 'уже сыграли',
  'Challenges for you': 'Вызовы для тебя',
  'Waiting on an answer': 'Ждём ответа',
  'Open challenge': 'Открытый вызов',
  'accepted — enter the duel': 'принял — заходи в дуэль',
  'nobody has accepted yet': 'пока никто не принял',
  Friends: 'Друзья',
  'No friends yet': 'Друзей пока нет',
  'Add somebody after a duel and their rating shows up on your board.':
    'Добавь кого-нибудь после дуэли — его рейтинг появится в твоей таблице.',
  'Invite a friend': 'Пригласить друга',
  'Recently played': 'Недавние соперники',
  Blocked: 'Заблокированы',
  blocked: 'заблокирован',
  Unblock: 'Разблокировать',
  'Finding your people…': 'Ищем твоих людей…',
  'Could not load your people.': 'Не удалось загрузить список.',

  // -- Another player -------------------------------------------------------
  'No such player.': 'Такого игрока нет.',
  'Add friend': 'Добавить в друзья',
  'Remove friend': 'Убрать из друзей',
  'Block this player': 'Заблокировать игрока',
  'Something wrong?': 'Что-то не так?',
  'Report this player': 'Пожаловаться',
  'What happened?': 'Что случилось?',
  'Optional. A sentence is plenty.': 'Необязательно. Хватит одного предложения.',
  Cheating: 'Нечестная игра',
  Abuse: 'Оскорбления',
  'Inappropriate behaviour': 'Неприемлемое поведение',
  Spam: 'Спам',
  'Something else': 'Другое',
  'Never mind': 'Отмена',
  'Reported. A person reads every one of these; nobody is banned automatically.':
    'Жалоба отправлена. Её прочитает человек — автоматических банов здесь нет.',

  // -- Profile --------------------------------------------------------------
  'Recent form': 'Форма',
  Progress: 'Прогресс',
  'Daily streak': 'Серия дней',
  'Days in a row with a finished duel': 'Дней подряд с сыгранной дуэлью',
  best: 'лучшая',
  'Battle coins': 'Battle коины',
  'Spent in the store, on the web': 'Тратятся в магазине на сайте',
  'Match history': 'История матчей',
  Awards: 'Награды',
  'Nothing yet': 'Пока пусто',
  Premium: 'Premium',
  Active: 'Активен',
  'Badge, deeper stats, cosmetics': 'Значок, подробная статистика, косметика',
  Settings: 'Настройки',
  'Notifications, account, privacy': 'Уведомления, аккаунт, приватность',
  'No matches yet': 'Матчей пока нет',
  'You have not finished a ranked duel. The first one starts your rating.':
    'Ты ещё не доиграл рейтинговую дуэль. Первая запускает рейтинг.',
  'Could not load your matches.': 'Не удалось загрузить матчи.',
  'That match is gone.': 'Этого матча больше нет.',
  'Share this result': 'Поделиться результатом',
  'Could not build that card.': 'Не удалось собрать карточку.',
  'This one ended early, so it paid no XP.': 'Матч закончился раньше времени — опыт не начислен.',
  'Still locked': 'Ещё закрыты',
  'Your first finished duel earns one.': 'Первая сыгранная дуэль откроет первую.',
  'Could not load your awards.': 'Не удалось загрузить награды.',
  Player: 'Игрок',
  vs: 'против',
  rating: 'рейтинг',

  // -- Quests ---------------------------------------------------------------
  Claim: 'Забрать',
  claimed: 'забрано',
  'Quests count every finished duel, friendly ones included.':
    'Задания считают любую сыгранную дуэль, в том числе дружескую.',
  'Could not load your quests.': 'Не удалось загрузить задания.',
  'Could not claim that.': 'Не удалось забрать награду.',
  'Answer the bell': 'Выйти на бой',
  'Finish one duel.': 'Доиграй одну дуэль.',
  'Three rounds of it': 'Три подряд',
  'Finish three duels.': 'Доиграй три дуэли.',
  'Take one': 'Взять одну',
  'Win a duel.': 'Выиграй дуэль.',
  'Twice over': 'Дважды',
  'Win two duels.': 'Выиграй две дуэли.',
  'Five clean finds': 'Пять чистых находок',
  'Win five rounds.': 'Выиграй пять раундов.',
  'Punch upwards': 'Удар выше своего веса',
  'Beat somebody rated above you.': 'Обыграй игрока с рейтингом выше твоего.',
  'Back to back': 'Две подряд',
  'Win two in a row.': 'Выиграй две подряд.',
  'Settle it privately': 'Разобраться лично',
  'Play a duel from a friend challenge.': 'Сыграй дуэль по вызову от друга.',

  // -- Premium --------------------------------------------------------------
  'Duel Battle Premium': 'Duel Battle Premium',
  'It pays for the servers this runs on.': 'Он оплачивает серверы, на которых всё это работает.',
  'What you get': 'Что входит',
  'What it gives you': 'Что он даёт',
  'Premium is active': 'Premium активен',
  'With no end date.': 'Бессрочно.',
  'Get Premium': 'Купить Premium',
  'Telegram Stars': 'Telegram Stars',
  'Opening…': 'Открываем…',
  'Premium is not on sale here': 'Здесь Premium не продаётся',
  'This server has not configured payments. Everything else works exactly the same.':
    'На этом сервере не настроены платежи. Всё остальное работает как обычно.',
  'Payment received. Premium appears as soon as Telegram confirms it.':
    'Платёж получен. Premium появится, как только Telegram его подтвердит.',
  'That payment did not go through.': 'Платёж не прошёл.',
  'Could not open payment.': 'Не удалось открыть оплату.',
  'Could not load Premium.': 'Не удалось загрузить Premium.',
  'Payment trouble? Send /paysupport to the bot.': 'Проблема с оплатой? Напиши боту /paysupport.',
  'A premium badge on your card and on the ladder': 'Значок Premium в профиле и в таблице лидеров',
  'Advanced stats: form, opponents and round breakdowns':
    'Расширенная статистика: форма, соперники, разбор раундов',
  'Premium cosmetics in the store': 'Premium-косметика в магазине',
  'Priority in the matchmaking queue': 'Приоритет в очереди подбора',

  // -- Settings -------------------------------------------------------------
  Notifications: 'Уведомления',
  'Match results': 'Результаты матчей',
  'Only when you have already left the app.': 'Только если ты уже вышел из приложения.',
  Challenges: 'Вызовы',
  'Somebody challenged you, or accepted yours.': 'Тебя вызвали или приняли твой вызов.',
  'Awards and ranks': 'Награды и ранги',
  'Promotions, streaks and achievements.': 'Повышения, серии и достижения.',
  'Friends and invites': 'Друзья и приглашения',
  'When somebody you invited plays their first duel.':
    'Когда приглашённый тобой сыграет первую дуэль.',
  'Weekly recap': 'Итоги недели',
  'One message a week with what you did.': 'Одно сообщение в неделю с твоими результатами.',
  'Quiet hours': 'Тихие часы',
  'Hold messages overnight': 'Не писать ночью',
  'Nothing is delivered between the hours below.': 'В эти часы сообщения не приходят.',
  'Your local time': 'Твоё местное время',
  From: 'С',
  To: 'До',
  Language: 'Язык',
  Automatic: 'Как на устройстве',
  Account: 'Аккаунт',
  Telegram: 'Telegram',
  Connected: 'Подключён',
  '· also signed in on the web': '· есть и вход через сайт',
  'Disconnect Telegram': 'Отключить Telegram',
  'Telegram is the only way into this account. Add an email sign-in on the web first if you want to disconnect it.':
    'Telegram — единственный вход в этот аккаунт. Чтобы отключить его, сначала добавь вход по почте на сайте.',
  'Disconnected. Your player and rating are untouched.':
    'Отключено. Профиль и рейтинг остались на месте.',
  'Could not unlink.': 'Не удалось отключить.',
  'Could not save that.': 'Не удалось сохранить.',
  Privacy: 'Приватность',
  'The game uses your camera during a duel and never your microphone. Photos go to your opponent, and to the photo check when one is configured. We keep your Telegram id, name and photo link so your player has a face; nothing else.':
    'Во время дуэли игра использует камеру и никогда не использует микрофон. Снимки уходят сопернику, а при настроенной проверке — ещё и ей. Из Telegram мы храним только твой ID, имя и ссылку на фото, чтобы у профиля было лицо.',

  // -- Linking, on the web settings page ------------------------------------
  'Play from Telegram with this same player: your rating, coins and awards come with you.':
    'Играй из Telegram тем же профилем: рейтинг, коины и награды переедут с тобой.',
  'Connect Telegram': 'Подключить Telegram',
  'Creating a code…': 'Создаём код…',
  'Get a new code': 'Получить новый код',
  'That code has expired.': 'Код истёк.',
  'Your linking code': 'Твой код для привязки',
  'Send this code to the bot within': 'Отправь код боту в течение',
  '. It works once.': '. Он сработает один раз.',
  'Open the bot': 'Открыть бота',
  'Could not create a code.': 'Не удалось создать код.',
  'The code proves this account, not your phone. It expires in ten minutes and can be used once.':
    'Код подтверждает этот аккаунт, а не телефон. Он живёт десять минут и используется один раз.',

  // -- Stat tiles -----------------------------------------------------------
  Peak: 'Пик',
  Losses: 'Поражения',
  'Best streak': 'Лучшая серия',
  'Win rate': 'Процент побед',
  Battles: 'Матчи',
  Rating: 'Рейтинг',
  Streak: 'Серия',

  // -- Interpolated copy ----------------------------------------------------
  // Matched as patterns, the way the rest of the dictionary does it: the
  // source builds the English sentence, and `{0}` picks the number back out.
  '{0} more ranked matches and your rating counts.':
    'Ещё {0} рейтинговых матчей — и рейтинг начнёт считаться.',
  '{0} players searching · you are #{1}': 'В поиске: {0} · ты #{1}',
  '{0} challenged you': '{0} вызывает тебя',
  '{0} duels today between {1} players.': 'Сегодня дуэлей: {0}, игроков: {1}.',
  'Until {0}.': 'До {0}.',
  '{0} days per purchase. Buying again adds to the end of it.':
    '{0} дней за покупку. Повторная покупка продлевает срок.',
  '{0} ranked matches': 'Рейтинговых матчей: {0}',
  '{0} earned': 'Получено: {0}',
  "Today's quests — new set in {0}h": 'Задания дня — новые через {0} ч',
  'Earned — {0} of {1}': 'Получено: {0} из {1}',
  'Claim {0}': 'Забрать: {0}',

  // -- Small words ----------------------------------------------------------
  'just now': 'только что',
  'm ago': 'мин назад',
  'h ago': 'ч назад',
  'd ago': 'дн назад',
  yesterday: 'вчера',
  // В/П/Н, not П/П/Н: "победа" and "поражение" share a first letter, and a
  // form strip where a win and a loss look identical is worse than no strip.
  W: 'В',
  L: 'П',
  D: 'Н',
  WIN: 'ПОБЕДА',
  LOSS: 'ПОРАЖЕНИЕ',
  DRAW: 'НИЧЬЯ',
  Victory: 'Победа',
  Defeat: 'Поражение',
  Draw: 'Ничья',
  Home: 'Главная',
  Duel: 'Дуэль',
  Rank: 'Ранг',
  You: 'Ты',
  Level: 'Уровень',
};

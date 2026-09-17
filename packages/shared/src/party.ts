import type { Challenge } from './challenges.js';

/*
 * The silly deck.
 *
 * These rounds are not a scavenger hunt and are not meant to be won by having
 * the better stuff in your room — they are the ones that make somebody laugh at
 * their own webcam. Pulling a face, being a cat, waving a sock: nothing here
 * needs a single object, which is the point. A player with an empty desk is on
 * exactly equal footing.
 *
 * Every entry is a visible pose or a prop gag that one still photo can settle.
 * The line this deck does not cross is the body: no prompt asks anyone to
 * undress, to show a private part of themselves, or to be judged on how they
 * look. Silly, cringeworthy and a bit cheeky is the register; "take something
 * off" is not, and a referee that was asked to grade an appearance would be
 * doing something this game has no business doing.
 */
const entries = [
  ['moustache', 'MAKE A FINGER MOUSTACHE', 'УСЫ ИЗ ПАЛЬЦА', 'Hold one finger sideways above your upper lip.', 'Палец над губой — и усы готовы.', 12],
  ['heart', 'MAKE A HEART WITH YOUR HANDS', 'СЕРДЦЕ ИЗ РУК', 'Make a heart shape with both hands.', 'Сложи сердце двумя руками.', 12],
  ['robot', 'FREEZE LIKE A ROBOT', 'РОБОТ НА ПАУЗЕ', 'Bend both arms into right angles and freeze.', 'Согни обе руки под прямым углом и замри.', 14],
  ['antlers', 'GIVE YOURSELF FINGER ANTLERS', 'ОЛЕНЬ НА СВЯЗИ', 'Spread your fingers beside your head like antlers.', 'Растопырь пальцы по бокам головы.', 12],
  ['frame', 'FRAME YOUR FACE WITH YOUR HANDS', 'ТЫ В КАДРЕ', 'Use thumbs and index fingers to make a frame around your face.', 'Сделай рамку вокруг лица пальцами.', 14],
  ['seal', 'INVENT A SECRET HAND SIGN', 'ЗНАК ТАЙНОГО КЛАНА', 'Interlace your fingers; point both index fingers up together.', 'Сцепи пальцы, два указательных оставь вверх.', 15],
  ['box', 'TRAPPED IN AN INVISIBLE BOX', 'НЕВИДИМАЯ КОРОБКА', 'Show both flat palms facing the camera like an invisible wall.', 'Обе ладони в камеру, будто упёрся в стену.', 12],
  ['halo', 'MAKE A HALO ABOVE YOUR HEAD', 'АНГЕЛ НА МИНУТКУ', 'Make a circle with your arms above your head.', 'Сложи руки в круг над головой.', 14],
  ['reporter', 'A SPOON IS YOUR MICROPHONE', 'РЕПОРТАЖ С КУХНИ', 'Hold a spoon like a microphone and face the camera.', 'Ложку как микрофон — ты в эфире.', 20],
  ['phone', 'ANSWER YOUR BANANA PHONE', 'АЛЛО, БАНАН?', 'Hold a banana or any harmless object beside your ear like a phone.', 'Любой безопасный предмет у уха — будто телефон.', 20],
  ['boss', 'THE FINAL BOSS HAS A MUG', 'БОСС С КРУЖКОЙ', 'Hold a mug at chest level and point at the camera with your other hand.', 'Кружка в одной руке, другой укажи в камеру.', 20],
  ['tiny', 'PRESENT A TINY TREASURE', 'МОЯ ПРЕЛЕСТЬ', 'Display one small object on both open palms, held together.', 'Маленький предмет на двух сложенных ладонях.', 20],

  // ---- Faces. No props, no room, no advantage. ----
  ['tongue', 'STICK YOUR TONGUE OUT AS FAR AS IT GOES', 'ПОКАЖИ ЯЗЫК ПО МАКСИМУМУ', 'All the way out, and hold it for the photo.', 'Высунь язык как можно дальше и замри.', 12],
  ['duck', 'GIVE THE CAMERA YOUR WORST DUCK FACE', 'САМЫЕ УЖАСНЫЕ УТИНЫЕ ГУБКИ', 'Lips out, eyebrows up, no shame.', 'Губы уточкой, брови вверх, не стесняйся.', 12],
  ['puppy', 'PUPPY EYES. MAKE IT UNBEARABLE', 'ЩЕНЯЧЬИ ГЛАЗКИ НА МАКСИМУМ', 'Chin down, eyes up, hands under your chin.', 'Подбородок вниз, глаза вверх, ладошки под щёки.', 13],
  ['chin', 'SHOW YOUR BEST DOUBLE CHIN', 'ПОКАЖИ ЛУЧШИЙ ВТОРОЙ ПОДБОРОДОК', 'Chin to chest, and own it.', 'Прижми подбородок к груди и держись.', 12],
  ['piggy', 'PUSH YOUR NOSE UP LIKE A PIG', 'СДЕЛАЙ ИЗ НОСА ПЯТАЧОК', 'One finger under the tip of your nose.', 'Подними кончик носа пальцем.', 12],
  ['villain', 'GIVE YOUR ANGRIEST VILLAIN FACE', 'ЛИЦО ЗЛОДЕЯ НА МАКСИМУМ', 'Eyebrows down, teeth out, terrify the lens.', 'Брови вниз, оскал — напугай камеру.', 12],
  ['soap', 'YOUR SADDEST SOAP-OPERA FACE', 'САМОЕ ГРУСТНОЕ ЛИЦО ИЗ СЕРИАЛА', 'Look just past the camera and suffer beautifully.', 'Смотри мимо камеры и страдай красиво.', 13],
  ['wink', 'WINK AND POINT AT THE CAMERA', 'ПОДМИГНИ И УКАЖИ НА КАМЕРУ', 'One eye shut, one finger out.', 'Один глаз закрыт, палец в камеру.', 12],
  ['kiss', 'BLOW A KISS LIKE YOU MEAN IT', 'ВОЗДУШНЫЙ ПОЦЕЛУЙ В КАМЕРУ', 'Hand to your lips, then out to the lens.', 'Ладонь к губам — и в камеру.', 12],
  ['woke', 'PRETEND YOU JUST WOKE UP', 'ИЗОБРАЗИ, ЧТО ТОЛЬКО ПРОСНУЛСЯ', 'Hair anywhere, eyes half shut, full yawn.', 'Волосы дыбом, глаза щёлочками, зевай.', 13],

  // ---- Creatures and stunts. Cringe on purpose. ----
  ['cat', 'BE A CAT: PAWS UP, BEST MEOW FACE', 'ТЫ КОШКА: ЛАПКИ И МОРДОЧКА', 'Curl both hands into paws beside your face.', 'Согни кисти в лапки у лица.', 14],
  ['bunny', 'BUNNY EARS AND A TWITCHY NOSE', 'УШКИ ЗАЙЧИКА И НОСИК', 'Two fingers up behind your own head.', 'Два пальца вверх за своей головой.', 13],
  ['crab', 'CRAB CLAWS AND A SIDEWAYS SHUFFLE', 'КЛЕШНИ КРАБА И ШАГ ВБОК', 'Both hands pinching, arms out wide.', 'Обе руки — клешни, локти в стороны.', 14],
  ['elbow', 'TRY TO LICK YOUR OWN ELBOW', 'ПОПРОБУЙ ЛИЗНУТЬ СВОЙ ЛОКОТЬ', 'Nobody can. The attempt is the answer.', 'Ни у кого не выходит. Важна попытка.', 15],
  ['nose', 'TOUCH YOUR NOSE WITH YOUR TONGUE', 'ДОСТАНЬ ЯЗЫКОМ ДО НОСА', 'Get as close as you can and hold it.', 'Тянись как можешь и замри.', 14],
  ['foot', 'PUT ONE FOOT IN FRONT OF THE CAMERA', 'ПОКАЖИ КАМЕРЕ СВОЮ НОЖКУ', 'Sock, slipper or bare — just get it in frame.', 'Носок, тапок или босиком — главное в кадр.', 15],
  ['sock', 'PUT A SOCK ON YOUR HAND AND WAVE', 'НАДЕНЬ НОСОК НА РУКУ И ПОМАШИ', 'Any sock. Give it a personality.', 'Любой носок. Придумай ему характер.', 18],
  ['flex', 'FLEX LIKE YOU JUST WON EVERYTHING', 'НАПРЯГИ БИЦЕПС КАК ЧЕМПИОН', 'Both arms up, best triumphant face.', 'Обе руки вверх и победное лицо.', 13],
  ['model', 'POSE LIKE A CATALOGUE MODEL', 'ПОЗИРУЙ КАК МОДЕЛЬ ИЗ КАТАЛОГА', 'Hand on hip, chin up, sell the sofa.', 'Рука на боку, подбородок вверх — продай диван.', 14],
] as const;

export const PARTY_CHALLENGES: readonly Challenge[] = entries.map(([id, prompt, , hint, , seconds]) => ({
  id: `party-${id}`, prompt, hint, durationMs: seconds * 1000,
  category: 'action', difficulty: 1, judging: 'peer', tags: ['visual', 'party', 'pose'],
}));

export const PARTY_RUSSIAN: Readonly<Record<string, string>> = Object.fromEntries(
  entries.flatMap(([, prompt, russian, hint, russianHint]) => [[prompt, russian], [hint, russianHint]]),
);

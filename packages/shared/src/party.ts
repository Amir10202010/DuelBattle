import type { Challenge } from './challenges.js';

// Each challenge is a visible pose or prop gag that a still photo can establish.
// No beauty contests, private-body prompts, ownership claims or timed physical stunts.
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
] as const;

export const PARTY_CHALLENGES: readonly Challenge[] = entries.map(([id, prompt, , hint, , seconds]) => ({
  id: `party-${id}`, prompt, hint, durationMs: seconds * 1000,
  category: 'action', difficulty: 1, judging: 'peer', tags: ['visual', 'party', 'pose'],
}));

export const PARTY_RUSSIAN: Readonly<Record<string, string>> = Object.fromEntries(
  entries.flatMap(([, prompt, russian, hint, russianHint]) => [[prompt, russian], [hint, russianHint]]),
);

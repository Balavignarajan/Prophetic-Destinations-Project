import type { Scene } from '../types';

/**
 * CONFIGURED EDUCATIONAL CONTENT for the Daniel 2 lesson, written for this app and PENDING CONTENT APPROVAL.
 * It is not read from the backend and is not a published course.
 *
 * Editing rules:
 * - Never paste Bible wording here. Give references; `text` stays null until a licensed translation is approved.
 * - Three kinds of statement are kept apart: what the passage says (summaries of Scripture), biblical interpretation, and
 *   historical context. Mark how firmly the passage supports an identification with `identification`.
 * - Dates are approximate and are given only where they are broadly agreed; interpretive readings are never presented as fact.
 */
export const scenes: Scene[] = [
  {
    id: 'intro',
    kind: 'intro',
    eyebrow: 'Prophecy lesson',
    title: 'Daniel 2',
    subtitle: 'The Dream of the Great Image',
    paragraphs: [
      'A king is troubled by a dream no one can explain. Step into ancient Babylon and follow how Scripture and history meet in the story of a great image and the kingdoms it stands for.',
      'This lesson keeps three things apart: what the Bible passage says, how it has been interpreted, and the historical background. Each is labelled.',
    ],
    image: 'babylonHall',
  },
  {
    id: 'dream',
    kind: 'narrative',
    eyebrow: 'Scene 2',
    title: 'Nebuchadnezzar’s Dream',
    paragraphs: [
      'The book of Daniel is set among Judeans taken to Babylon. In Daniel 2, King Nebuchadnezzar has a dream that troubles him and he summons his wise men.',
      'He asks them to tell him both the dream and its meaning. They cannot. Daniel, one of the exiles, asks for time and then tells the king that it is God in heaven who reveals mysteries.',
    ],
    references: [
      { reference: 'Daniel 2:1–3', text: null },
      { reference: 'Daniel 2:27–28', text: null },
    ],
    image: 'dreamChamber',
  },
  {
    id: 'image',
    kind: 'statue',
    eyebrow: 'Scene 3',
    title: 'The Great Image',
    prompt: 'Look closely before you read on. Tap a part of the image to see what it is made of.',
    paragraphs: [
      'Daniel tells the king what he saw: a great image, bright and terrifying, made of different materials from head to feet.',
    ],
    references: [{ reference: 'Daniel 2:31–33', text: null }],
    revealHeading: 'Reveal the interpretation',
    revealNote:
      'In the traditional reading the five parts stand for a sequence of kingdoms: Babylon, then Medo-Persia, Greece, Rome, and finally a divided kingdom. Only the first is named in the passage itself. The next scenes take each part in turn.',
  },
  {
    id: 'head-gold',
    kind: 'kingdom',
    eyebrow: 'Scene 4',
    title: 'Head of Gold',
    sectionId: 'head',
    kingdom: 'Babylon',
    identification: 'stated',
    identificationNote: 'Named in the passage: Daniel tells Nebuchadnezzar that he is the head of gold.',
    period: 'Neo-Babylonian Empire, c. 626–539 BC',
    scriptureSummary:
      'The image’s head is gold. Daniel tells the king that God has given him a kingdom, power and glory, and says that he is the head of gold.',
    references: [
      { reference: 'Daniel 2:32', text: null },
      { reference: 'Daniel 2:37–38', text: null },
    ],
    explanation:
      'Gold is the most precious of the metals, and the head is the top of the image. Here the head represents Nebuchadnezzar and the Babylonian kingdom he ruled.',
    historicalContext:
      'Nebuchadnezzar II reigned over Babylon from about 605 to 562 BC, and Babylon was one of the great cities of the ancient world. The Neo-Babylonian Empire ended in 539 BC when Babylon was taken by the Persian king Cyrus.',
    historicalApplication: null,
  },
  {
    id: 'chest-silver',
    kind: 'kingdom',
    eyebrow: 'Scene 5',
    title: 'Chest and Arms of Silver',
    sectionId: 'chest',
    kingdom: 'Medo-Persia',
    identification: 'traditional',
    identificationNote:
      'Daniel 2 says only that another kingdom, inferior to the first, would follow. Naming it Medo-Persia is the traditional reading, supported by Daniel 8:20.',
    period: 'c. 539–330 BC',
    scriptureSummary:
      'The image’s chest and arms are silver. Daniel says that after Nebuchadnezzar’s kingdom another kingdom would arise, inferior to it.',
    references: [
      { reference: 'Daniel 2:32', text: null },
      { reference: 'Daniel 2:39', text: null },
      { reference: 'Daniel 8:20', text: null },
    ],
    explanation:
      'Silver is valuable but less so than gold. Interpreters read this part as the Medo-Persian Empire, the kingdom that followed Babylon.',
    historicalContext:
      'The Persian king Cyrus took Babylon in 539 BC, and the Achaemenid Persian Empire grew to stretch from Anatolia to the Indus valley. It lasted until Alexander of Macedon defeated the last Persian king, Darius III, around 330 BC.',
    historicalApplication: null,
  },
  {
    id: 'belly-bronze',
    kind: 'kingdom',
    eyebrow: 'Scene 6',
    title: 'Belly and Thighs of Bronze',
    sectionId: 'belly',
    kingdom: 'Greece',
    identification: 'traditional',
    identificationNote:
      'Daniel 2 says a third kingdom of bronze would rule over the earth. Naming it Greece is the traditional reading, supported by Daniel 8:21.',
    period: 'Alexander’s conquests, c. 334–323 BC, and the kingdoms of his successors',
    scriptureSummary:
      'The image’s belly and thighs are bronze. Daniel says a third kingdom, of bronze, would rule over all the earth.',
    references: [
      { reference: 'Daniel 2:32', text: null },
      { reference: 'Daniel 2:39', text: null },
      { reference: 'Daniel 8:21', text: null },
    ],
    explanation:
      'Bronze is a harder metal than silver or gold but lower in value. Interpreters read this part as the Greek, or Macedonian, empire that followed Persia.',
    historicalContext:
      'Alexander the Great crossed into Asia in 334 BC and overthrew the Persian Empire within about a decade. After his death in 323 BC his generals divided his conquests, and Greek language and culture shaped the region for centuries.',
    historicalApplication: null,
  },
  {
    id: 'legs-iron',
    kind: 'kingdom',
    eyebrow: 'Scene 7',
    title: 'Legs of Iron',
    sectionId: 'legs',
    kingdom: 'Rome',
    identification: 'traditional',
    identificationNote:
      'Daniel 2 describes a fourth kingdom, strong as iron, that breaks and crushes. Naming it Rome is the traditional reading; the passage does not name it.',
    period: 'Roman dominance from about the 2nd century BC; the Western Roman Empire ended in AD 476',
    scriptureSummary:
      'The image’s legs are iron. Daniel says a fourth kingdom would be strong as iron, breaking in pieces and crushing everything.',
    references: [
      { reference: 'Daniel 2:33', text: null },
      { reference: 'Daniel 2:40', text: null },
    ],
    explanation:
      'Iron breaks and shatters other metals. Interpreters read the legs as the Roman Empire, which overcame the Greek-ruled kingdoms and gathered the Mediterranean world under one rule.',
    historicalContext:
      'Rome defeated Macedon in the 2nd century BC and absorbed the last Hellenistic kingdom, Egypt, in 30 BC. The Western Roman Empire ended in AD 476; the Eastern, or Byzantine, empire continued until AD 1453.',
    historicalApplication: null,
  },
  {
    id: 'feet-iron-clay',
    kind: 'kingdom',
    eyebrow: 'Scene 8',
    title: 'Feet of Iron Mixed with Clay',
    sectionId: 'feet',
    kingdom: 'Divided kingdoms',
    identification: 'disputed',
    identificationNote:
      'Readers differ on what the feet and toes refer to. The traditional reading takes them as the divided kingdoms that followed Rome.',
    period: 'After the fall of the Western Roman Empire (AD 476), on the traditional reading',
    scriptureSummary:
      'The image’s feet and toes are partly iron and partly clay. Daniel says the kingdom would be divided, partly strong and partly brittle, and that the iron and clay would not hold together.',
    references: [
      { reference: 'Daniel 2:33', text: null },
      { reference: 'Daniel 2:41–43', text: null },
    ],
    explanation:
      'Iron and clay do not bond. The picture is of a divided kingdom whose parts are not united: strong in some ways and fragile in others.',
    historicalContext:
      'After AD 476 the western Roman lands were divided among many kingdoms and, later, states, and no single power has since ruled all of them.',
    historicalApplication:
      'Many interpreters apply this to the long history of separate European states. That is an interpretive application, not an established historical fact, and some readers apply the passage differently.',
  },
  {
    id: 'stone',
    kind: 'stone',
    eyebrow: 'Scene 9',
    title: 'The Stone Cut Without Hands',
    mode: 'impact',
    image: 'mountain',
    scriptureSummary:
      'A stone is cut out, not by human hands. It strikes the image on its feet, and the whole image is broken in pieces and carried away. The stone then becomes a great mountain that fills the earth.',
    references: [{ reference: 'Daniel 2:34–35', text: null }],
    interpretation: [
      'The stone strikes the feet, the last part of the image, and the whole image falls together. The picture is of the end of all the human kingdoms at once.',
      'The stone is “not cut by human hands”: its origin is not human. That is why the passage’s own interpretation ties it to God.',
    ],
    perspectivesNote: null,
  },
  {
    id: 'stone-meaning',
    kind: 'stone',
    eyebrow: 'Scene 10',
    title: 'The Meaning of the Stone',
    mode: 'meaning',
    image: 'mountain',
    scriptureSummary:
      'Daniel says that the God of heaven will set up a kingdom that will never be destroyed and will not be left to another people. It will break in pieces all the other kingdoms and will stand forever.',
    references: [
      { reference: 'Daniel 2:44–45', text: null },
    ],
    interpretation: [
      'The stone and the mountain stand for the kingdom of God: a kingdom that God establishes, not one that is built by human power, and one that does not pass away.',
      'This is the heart of the chapter. The image shows kingdoms that rise and fall; the stone shows a kingdom that remains.',
    ],
    perspectivesNote:
      'Readers differ on when and how this kingdom is established. Many Christians connect it with Christ, some to his first coming and others to his return; Jewish interpreters read the passage differently again. This lesson does not settle that question.',
  },
  {
    id: 'timeline',
    kind: 'timeline',
    eyebrow: 'Scene 11',
    title: 'Prophecy Timeline',
    intro:
      'The sequence at a glance. Dates are approximate. Only the first identification is named in the passage; the rest are traditional or disputed, as labelled.',
  },
  {
    id: 'evidence',
    kind: 'evidence',
    eyebrow: 'Scene 12',
    title: 'Bible and History',
    intro: 'For each kingdom: what the Bible reference says, how the passage is interpreted, and the historical background. Tap a card to open it.',
    items: [
      {
        id: 'babylon',
        title: 'Babylon: head of gold',
        identification: 'stated',
        bible: [
          { reference: 'Daniel 2:37–38', text: null },
        ],
        interpretation: 'Daniel says that Nebuchadnezzar is the head of gold, so the first kingdom is Babylon.',
        historicalContext: 'Babylon was the capital of the Neo-Babylonian Empire under Nebuchadnezzar II (reigned c. 605–562 BC). It fell to Cyrus of Persia in 539 BC.',
        historicalApplication: null,
      },
      {
        id: 'persia',
        title: 'Medo-Persia: chest and arms of silver',
        identification: 'traditional',
        bible: [
          { reference: 'Daniel 2:39', text: null },
          { reference: 'Daniel 8:20', text: null },
        ],
        interpretation: 'The second kingdom is traditionally read as Medo-Persia. Daniel 8:20 names the kings of Media and Persia in a later vision.',
        historicalContext: 'Cyrus took Babylon in 539 BC. The Persian Empire lasted until Alexander’s victory over Darius III, c. 330 BC.',
        historicalApplication: null,
      },
      {
        id: 'greece',
        title: 'Greece: belly and thighs of bronze',
        identification: 'traditional',
        bible: [
          { reference: 'Daniel 2:39', text: null },
          { reference: 'Daniel 8:21', text: null },
        ],
        interpretation: 'The third kingdom is traditionally read as Greece. Daniel 8:21 names the king of Greece in a later vision.',
        historicalContext: 'Alexander the Great began his Asian campaign in 334 BC and died in 323 BC; his successors ruled Hellenistic kingdoms for centuries.',
        historicalApplication: null,
      },
      {
        id: 'rome',
        title: 'Rome: legs of iron',
        identification: 'traditional',
        bible: [
          { reference: 'Daniel 2:40', text: null },
        ],
        interpretation: 'The fourth kingdom, strong as iron, is traditionally read as Rome. The passage does not name it.',
        historicalContext: 'Rome overcame Macedon in the 2nd century BC and annexed Egypt in 30 BC. The Western Empire ended in AD 476.',
        historicalApplication: null,
      },
      {
        id: 'divided',
        title: 'Divided kingdoms: feet of iron and clay',
        identification: 'disputed',
        bible: [
          { reference: 'Daniel 2:41–43', text: null },
        ],
        interpretation: 'The divided kingdom is traditionally read as the states that followed Rome. Readers differ on this.',
        historicalContext: 'After AD 476 the western Roman lands were divided among many kingdoms, and no single power has since ruled all of them.',
        historicalApplication: 'Applying the passage to particular modern states or events is interpretation, not established history.',
      },
      {
        id: 'kingdom',
        title: 'The stone: God’s everlasting kingdom',
        identification: 'stated',
        bible: [
          { reference: 'Daniel 2:34–35', text: null },
          { reference: 'Daniel 2:44–45', text: null },
        ],
        interpretation: 'The passage itself says that the God of heaven will set up a kingdom that will never be destroyed. How and when this is fulfilled is read differently by different traditions.',
        historicalContext: 'This is a theological claim about the future and about God, not a historical event that can be dated.',
        historicalApplication: null,
      },
    ],
  },
  {
    id: 'quiz',
    kind: 'quiz',
    eyebrow: 'Scene 13',
    title: 'Knowledge Quiz',
    intro: 'Four short questions about what you have just read. They are marked on this device only.',
  },
  {
    id: 'summary',
    kind: 'summary',
    eyebrow: 'Scene 14',
    title: 'Summary',
    points: [
      { sceneId: 'dream', heading: 'The dream', text: 'Nebuchadnezzar’s troubling dream is explained by Daniel, who credits God as the one who reveals mysteries.' },
      { sceneId: 'head-gold', heading: 'Gold: Babylon', text: 'Named in the passage as Nebuchadnezzar’s kingdom.' },
      { sceneId: 'chest-silver', heading: 'Silver: Medo-Persia', text: 'The traditional reading of the second kingdom.' },
      { sceneId: 'belly-bronze', heading: 'Bronze: Greece', text: 'The traditional reading of the third kingdom.' },
      { sceneId: 'legs-iron', heading: 'Iron: Rome', text: 'The traditional reading of the fourth kingdom.' },
      { sceneId: 'feet-iron-clay', heading: 'Iron and clay: divided kingdoms', text: 'A divided kingdom, strong and brittle together. Readers differ on its application.' },
      { sceneId: 'stone-meaning', heading: 'The stone: God’s kingdom', text: 'A kingdom that God sets up, and that does not pass away.' },
    ],
    closing:
      'The image shows kingdoms that rise and fall. The stone shows one that remains. Compare this lesson with the passage in your own Bible.',
  },
];

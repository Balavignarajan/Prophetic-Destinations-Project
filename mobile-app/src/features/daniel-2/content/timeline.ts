import type { TimelineEntry } from '../types';

/**
 * CONFIGURED EDUCATIONAL CONTENT (pending content approval). The six phases of the prophecy and nothing more: no events are
 * added beyond what the lesson scenes cover, and dates are approximate.
 */
export const timeline: TimelineEntry[] = [
  {
    id: 'babylon',
    phase: 'Babylon',
    materialKey: 'gold',
    material: 'Gold: the head',
    dateRange: 'c. 626–539 BC',
    identification: 'stated',
    references: [{ reference: 'Daniel 2:37–38', text: null }],
    summary: 'The kingdom of Nebuchadnezzar, named in the passage.',
    sceneId: 'head-gold',
  },
  {
    id: 'medo-persia',
    phase: 'Medo-Persia',
    materialKey: 'silver',
    material: 'Silver: chest and arms',
    dateRange: 'c. 539–330 BC',
    identification: 'traditional',
    references: [{ reference: 'Daniel 2:39', text: null }, { reference: 'Daniel 8:20', text: null }],
    summary: 'Traditionally read as the second kingdom.',
    sceneId: 'chest-silver',
  },
  {
    id: 'greece',
    phase: 'Greece',
    materialKey: 'bronze',
    material: 'Bronze: belly and thighs',
    dateRange: 'c. 334 BC onward (Alexander and his successors)',
    identification: 'traditional',
    references: [{ reference: 'Daniel 2:39', text: null }, { reference: 'Daniel 8:21', text: null }],
    summary: 'Traditionally read as the third kingdom.',
    sceneId: 'belly-bronze',
  },
  {
    id: 'rome',
    phase: 'Rome',
    materialKey: 'iron',
    material: 'Iron: the legs',
    dateRange: 'From about the 2nd century BC to AD 476 in the West',
    identification: 'traditional',
    references: [{ reference: 'Daniel 2:40', text: null }],
    summary: 'Traditionally read as the fourth kingdom.',
    sceneId: 'legs-iron',
  },
  {
    id: 'divided',
    phase: 'Divided kingdoms',
    materialKey: 'ironClay',
    material: 'Iron mixed with clay: feet and toes',
    dateRange: null,
    identification: 'disputed',
    references: [{ reference: 'Daniel 2:41–43', text: null }],
    summary: 'A divided kingdom, partly strong and partly brittle. Readers differ on what it refers to.',
    sceneId: 'feet-iron-clay',
  },
  {
    id: 'everlasting',
    phase: 'God’s everlasting kingdom',
    materialKey: 'stone',
    material: 'The stone cut without hands',
    dateRange: null,
    identification: 'stated',
    references: [{ reference: 'Daniel 2:44–45', text: null }],
    summary: 'A kingdom that God sets up and that does not pass away. How and when it is fulfilled is read differently.',
    sceneId: 'stone-meaning',
  },
];

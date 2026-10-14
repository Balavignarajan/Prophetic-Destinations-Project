import type { StatueSectionInfo } from '../types';

/**
 * CONFIGURED EDUCATIONAL CONTENT (pending content approval). What each part of the image is made of, per Daniel 2:31–33.
 * `text` is null on purpose: no verse wording is bundled until a licensed translation is approved.
 */
export const statueSections: StatueSectionInfo[] = [
  { id: 'head', name: 'Head', material: 'Gold', materialKey: 'gold', reference: { reference: 'Daniel 2:32', text: null } },
  { id: 'chest', name: 'Chest and arms', material: 'Silver', materialKey: 'silver', reference: { reference: 'Daniel 2:32', text: null } },
  { id: 'belly', name: 'Belly and thighs', material: 'Bronze', materialKey: 'bronze', reference: { reference: 'Daniel 2:32', text: null } },
  { id: 'legs', name: 'Legs', material: 'Iron', materialKey: 'iron', reference: { reference: 'Daniel 2:33', text: null } },
  { id: 'feet', name: 'Feet and toes', material: 'Iron mixed with clay', materialKey: 'ironClay', reference: { reference: 'Daniel 2:33', text: null } },
];

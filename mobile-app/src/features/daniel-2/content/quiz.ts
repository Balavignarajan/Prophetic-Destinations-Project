import type { QuizQuestion } from '../types';

/**
 * CONFIGURED EDUCATIONAL CONTENT (pending content approval). Local quiz questions based on the lesson scenes. They are marked
 * on the device and are NOT backend quizzes: they have no server ID and nothing is submitted anywhere.
 */
export const quiz: QuizQuestion[] = [
  {
    id: 'q-head',
    prompt: 'Which kingdom does Daniel 2 itself identify as the head of gold?',
    options: [
      { id: 'a', text: 'Babylon' },
      { id: 'b', text: 'Medo-Persia' },
      { id: 'c', text: 'Greece' },
      { id: 'd', text: 'Rome' },
    ],
    correctOptionId: 'a',
    explanation: 'Daniel tells Nebuchadnezzar that he is the head of gold (Daniel 2:37–38). The later kingdoms are not named in the chapter.',
    reviewSceneId: 'head-gold',
  },
  {
    id: 'q-feet',
    prompt: 'What are the feet and toes of the image made of?',
    options: [
      { id: 'a', text: 'Bronze' },
      { id: 'b', text: 'Iron mixed with clay' },
      { id: 'c', text: 'Silver and gold' },
      { id: 'd', text: 'Stone' },
    ],
    correctOptionId: 'b',
    explanation: 'The feet are partly iron and partly clay, a picture of a kingdom that is strong in part and brittle in part (Daniel 2:33, 41–43).',
    reviewSceneId: 'feet-iron-clay',
  },
  {
    id: 'q-stone',
    prompt: 'What strikes the image, and where?',
    options: [
      { id: 'a', text: 'A wind, on its head' },
      { id: 'b', text: 'A stone cut without hands, on its feet' },
      { id: 'c', text: 'A fire, on its legs' },
      { id: 'd', text: 'A hammer, on its chest' },
    ],
    correctOptionId: 'b',
    explanation: 'A stone cut out without hands strikes the image on its feet, and the whole image is broken (Daniel 2:34–35).',
    reviewSceneId: 'stone',
  },
  {
    id: 'q-theme',
    prompt: 'According to Daniel’s explanation, what does the stone stand for?',
    options: [
      { id: 'a', text: 'A fifth human empire' },
      { id: 'b', text: 'A kingdom that God sets up and that will never be destroyed' },
      { id: 'c', text: 'The wisdom of Babylon’s wise men' },
      { id: 'd', text: 'The wealth of the gold head' },
    ],
    correctOptionId: 'b',
    explanation: 'Daniel says the God of heaven will set up a kingdom that will never be destroyed (Daniel 2:44–45). Readers differ on when and how this is fulfilled.',
    reviewSceneId: 'stone-meaning',
  },
];

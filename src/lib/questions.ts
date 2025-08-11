import { Question } from './gameState';

export const bachelorQuestions: Question[] = [
  {
    id: 'Q1',
    text: "I asked my bachelor friends, what's something they do to impress a girl on a first date?",
    answerCount: 6,
    answers: [
      { id: 'Q1A1', text: 'Dress up nicely', value: 15, revealed: false, attribution: null },
      { id: 'Q1A2', text: 'Pay for everything', value: 12, revealed: false, attribution: null },
      { id: 'Q1A3', text: 'Be a good listener', value: 10, revealed: false, attribution: null },
      { id: 'Q1A4', text: 'Show off their car', value: 8, revealed: false, attribution: null },
      { id: 'Q1A5', text: 'Tell jokes', value: 6, revealed: false, attribution: null },
      { id: 'Q1A6', text: 'Show their cooking skills', value: 4, revealed: false, attribution: null }
    ]
  },
  {
    id: 'Q2',
    text: "I asked my bachelor friends, what's the most embarrassing thing that happened to them on a date?",
    answerCount: 10,
    answers: [
      { id: 'Q2A1', text: 'Spilled food on themselves', value: 18, revealed: false, attribution: null },
      { id: 'Q2A2', text: 'Called her wrong name', value: 15, revealed: false, attribution: null },
      { id: 'Q2A3', text: 'Got food stuck in teeth', value: 12, revealed: false, attribution: null },
      { id: 'Q2A4', text: 'Tripped and fell', value: 10, revealed: false, attribution: null },
      { id: 'Q2A5', text: 'Phone rang during dinner', value: 8, revealed: false, attribution: null },
      { id: 'Q2A6', text: 'Forgot wallet', value: 6, revealed: false, attribution: null },
      { id: 'Q2A7', text: 'Said something stupid', value: 5, revealed: false, attribution: null },
      { id: 'Q2A8', text: 'Got lost driving', value: 4, revealed: false, attribution: null },
      { id: 'Q2A9', text: 'Burped loudly', value: 3, revealed: false, attribution: null },
      { id: 'Q2A10', text: 'Wore mismatched clothes', value: 2, revealed: false, attribution: null }
    ]
  },
  {
    id: 'Q3',
    text: "I asked my bachelor friends, what's something they stole from their friend and never told them about?",
    answerCount: 6,
    answers: [
      { id: 'Q3A1', text: 'Money', value: 20, revealed: false, attribution: null },
      { id: 'Q3A2', text: 'Food from fridge', value: 15, revealed: false, attribution: null },
      { id: 'Q3A3', text: 'Clothes', value: 12, revealed: false, attribution: null },
      { id: 'Q3A4', text: 'Books', value: 8, revealed: false, attribution: null },
      { id: 'Q3A5', text: 'Chargers', value: 6, revealed: false, attribution: null },
      { id: 'Q3A6', text: 'Toiletries', value: 4, revealed: false, attribution: null }
    ]
  },
  {
    id: 'Q4',
    text: "I asked my bachelor friends, what's a fake excuse they might use to get out of a bad date?",
    answerCount: 6,
    answers: [
      { id: 'Q4A1', text: 'Emergency at work', value: 18, revealed: false, attribution: null },
      { id: 'Q4A2', text: 'Family emergency', value: 15, revealed: false, attribution: null },
      { id: 'Q4A3', text: 'Feeling sick', value: 12, revealed: false, attribution: null },
      { id: 'Q4A4', text: 'Forgot important meeting', value: 10, revealed: false, attribution: null },
      { id: 'Q4A5', text: 'Car broke down', value: 8, revealed: false, attribution: null },
      { id: 'Q4A6', text: 'Roommate needs help', value: 6, revealed: false, attribution: null }
    ]
  },
  {
    id: 'Q5',
    text: "I asked my bachelor friends, the last advice they took from ChatGPT?",
    answerCount: 6,
    answers: [
      { id: 'Q5A1', text: 'Cooking recipes', value: 16, revealed: false, attribution: null },
      { id: 'Q5A2', text: 'Workout plans', value: 14, revealed: false, attribution: null },
      { id: 'Q5A3', text: 'Dating advice', value: 12, revealed: false, attribution: null },
      { id: 'Q5A4', text: 'Travel planning', value: 10, revealed: false, attribution: null },
      { id: 'Q5A5', text: 'Study tips', value: 8, revealed: false, attribution: null },
      { id: 'Q5A6', text: 'Career advice', value: 6, revealed: false, attribution: null }
    ]
  },
  {
    id: 'Q6',
    text: "I asked my bachelor friends, If your boss says \"you are fired\", what will you do?",
    answerCount: 13,
    answers: [
      { id: 'Q6A1', text: 'Ask for explanation', value: 25, revealed: false, attribution: null },
      { id: 'Q6A2', text: 'Pack up and leave', value: 20, revealed: false, attribution: null },
      { id: 'Q6A3', text: 'Try to negotiate', value: 18, revealed: false, attribution: null },
      { id: 'Q6A4', text: 'Call HR', value: 15, revealed: false, attribution: null },
      { id: 'Q6A5', text: 'Start job hunting', value: 12, revealed: false, attribution: null },
      { id: 'Q6A6', text: 'Take legal action', value: 10, revealed: false, attribution: null },
      { id: 'Q6A7', text: 'Cry', value: 8, revealed: false, attribution: null },
      { id: 'Q6A8', text: 'Go to pub', value: 6, revealed: false, attribution: null },
      { id: 'Q6A9', text: 'Update LinkedIn', value: 5, revealed: false, attribution: null },
      { id: 'Q6A10', text: 'Call parents', value: 4, revealed: false, attribution: null },
      { id: 'Q6A11', text: 'Take vacation', value: 3, revealed: false, attribution: null },
      { id: 'Q6A12', text: 'Start business', value: 2, revealed: false, attribution: null },
      { id: 'Q6A13', text: 'Move to different city', value: 1, revealed: false, attribution: null }
    ]
  }
];

// Function to load questions into Firebase
export async function loadQuestionsToFirebase() {
  const { doc, setDoc } = await import('firebase/firestore');
  const { db } = await import('./firebase');
  
  for (const question of bachelorQuestions) {
    await setDoc(doc(db, 'questions', question.id), question);
  }
  
  console.log(`Loaded ${bachelorQuestions.length} questions to Firebase`);
}

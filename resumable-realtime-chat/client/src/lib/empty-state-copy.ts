import { useEffect, useState } from 'react';

export interface EmptyStateCopy {
  heading: string;
  placeholder: string;
}

export const EMPTY_STATE_COPY_OPTIONS: EmptyStateCopy[] = [
  {
    heading: 'What’s on the agenda today?',
    placeholder: 'Tell me what we’re working on.',
  },
  {
    heading: 'Where should we begin?',
    placeholder: 'Start with a question, idea, or task.',
  },
  {
    heading: 'Ready when you are.',
    placeholder: 'Type your first thought.',
  },
  {
    heading: 'What’s on your mind today?',
    placeholder: 'Share what’s on your mind.',
  },
  {
    heading: 'Hi there, what’s the move?',
    placeholder: 'What’s the plan?',
  },
  {
    heading: 'What should we focus on?',
    placeholder: 'Name the focus.',
  },
  {
    heading: 'The keyboard is yours, bub',
    placeholder: 'Take it away.',
  },
];

export function getRandomEmptyStateCopy(): EmptyStateCopy {
  const index = Math.floor(Math.random() * EMPTY_STATE_COPY_OPTIONS.length);
  return EMPTY_STATE_COPY_OPTIONS[index];
}

export function getInitialEmptyStateCopy(): EmptyStateCopy {
  return EMPTY_STATE_COPY_OPTIONS[0];
}

export function useEmptyStateCopy(): EmptyStateCopy {
  const [copy, setCopy] = useState<EmptyStateCopy>(getInitialEmptyStateCopy);

  useEffect(() => {
    setCopy(getRandomEmptyStateCopy());
  }, []);

  return copy;
}

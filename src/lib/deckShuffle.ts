export type RandomDeckControlState<T> = {
  deckCount: number;
  randomDecks: T[][];
};

export type RandomDeckStates<T> = {
  iching: RandomDeckControlState<T>;
  tarot: RandomDeckControlState<T>;
};

export const shuffleArray = <T>(items: readonly T[], rng: () => number = Math.random): T[] => {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }

  return shuffled;
};

export const shuffleDeckControlState = <T>(
  state: RandomDeckControlState<T>,
  rng: () => number = Math.random,
): RandomDeckControlState<T> => ({
  deckCount: state.deckCount,
  randomDecks: state.randomDecks.map((deck) => shuffleArray(deck, rng)),
});

export const shuffleAllDeckStates = <T>(
  states: RandomDeckStates<T>,
  rng: () => number = Math.random,
): RandomDeckStates<T> => ({
  iching: shuffleDeckControlState(states.iching, rng),
  tarot: shuffleDeckControlState(states.tarot, rng),
});

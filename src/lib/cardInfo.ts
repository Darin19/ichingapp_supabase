import type { DeckType } from "../types";

interface CardInfoLineInput {
  position: number;
  deckType: DeckType;
  cardNumber?: number;
  vietnameseName?: string;
  englishName?: string;
  labels: Array<string | null | undefined>;
}

export interface CardInfoNameParts {
  primaryName: string;
  secondaryName: string | null;
}

const normalizeName = (name: string): string =>
  name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();

export const getCardInfoNameParts = (
  vietnameseName?: string,
  englishName?: string,
): CardInfoNameParts => {
  const primaryName =
    vietnameseName?.trim() || englishName?.trim() || "Unknown card";
  const english = englishName?.trim();
  const secondaryName =
    english && normalizeName(english) !== normalizeName(primaryName)
      ? english
      : null;

  return { primaryName, secondaryName };
};

export const formatCardInfoLine = ({
  position,
  deckType,
  cardNumber,
  vietnameseName,
  englishName,
  labels,
}: CardInfoLineInput): string => {
  const { primaryName, secondaryName } = getCardInfoNameParts(
    vietnameseName,
    englishName,
  );
  const displayName = secondaryName
    ? `${primaryName} (${secondaryName})`
    : primaryName;
  const energyField = labels.filter(Boolean).join(", ");
  return `${position}. ${deckType === "iching" ? "Hexagram" : "Tarot"} ${cardNumber}: ${displayName}${energyField ? ` - Energy Field: ${energyField}` : ""}`;
};

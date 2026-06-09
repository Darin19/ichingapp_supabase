import { IChingCard, TarotCard } from "./types";
import { ICHING_CONTENT_1 } from "./ichingContent";
import { getIChingKeywords, MASTER_SEAN_CHAN_SLUGS } from "./ichingResources";

export const getHexagramChar = (num: number): string => {
  if (num < 1 || num > 64) return "";
  const kingWenToUnicode: { [key: number]: number } = {
    1: 0x4dc0,
    2: 0x4dc1,
    3: 0x4dc2,
    4: 0x4dc3,
    5: 0x4dc4,
    6: 0x4dc5,
    7: 0x4dc6,
    8: 0x4dc7,
    9: 0x4dc8,
    10: 0x4dc9,
    11: 0x4dca,
    12: 0x4dcb,
    13: 0x4dcc,
    14: 0x4dcd,
    15: 0x4dce,
    16: 0x4dcf,
    17: 0x4dd0,
    18: 0x4dd1,
    19: 0x4dd2,
    20: 0x4dd3,
    21: 0x4dd4,
    22: 0x4dd5,
    23: 0x4dd6,
    24: 0x4dd7,
    25: 0x4dd8,
    26: 0x4dd9,
    27: 0x4dda,
    28: 0x4ddb,
    29: 0x4ddc,
    30: 0x4ddd,
    31: 0x4dde,
    32: 0x4ddf,
    33: 0x4de0,
    34: 0x4de1,
    35: 0x4de2,
    36: 0x4de3,
    37: 0x4de4,
    38: 0x4de5,
    39: 0x4de6,
    40: 0x4de7,
    41: 0x4de8,
    42: 0x4de9,
    43: 0x4dea,
    44: 0x4deb,
    45: 0x4dec,
    46: 0x4ded,
    47: 0x4dee,
    48: 0x4def,
    49: 0x4df0,
    50: 0x4df1,
    51: 0x4df2,
    52: 0x4df3,
    53: 0x4df4,
    54: 0x4df5,
    55: 0x4df6,
    56: 0x4df7,
    57: 0x4df8,
    58: 0x4df9,
    59: 0x4dfa,
    60: 0x4dfb,
    61: 0x4dfc,
    62: 0x4dfd,
    63: 0x4dfe,
    64: 0x4dff,
  };
  return String.fromCharCode(kingWenToUnicode[num]);
};

// 1 = Yang (solid), 0 = Yin (broken)
// Lines are ordered from bottom (index 0) to top (index 5)
export const HEX_LINES: { [key: number]: number[] } = {
  1: [1, 1, 1, 1, 1, 1],
  2: [0, 0, 0, 0, 0, 0],
  3: [1, 0, 0, 0, 1, 0],
  4: [0, 1, 0, 0, 0, 1],
  5: [1, 1, 1, 0, 1, 0],
  6: [0, 1, 0, 1, 1, 1],
  7: [0, 1, 0, 0, 0, 0],
  8: [0, 0, 0, 0, 1, 0],
  9: [1, 1, 1, 0, 1, 1],
  10: [1, 1, 0, 1, 1, 1],
  11: [1, 1, 1, 0, 0, 0],
  12: [0, 0, 0, 1, 1, 1],
  13: [1, 0, 1, 1, 1, 1],
  14: [1, 1, 1, 1, 0, 1],
  15: [0, 0, 1, 0, 0, 0],
  16: [0, 0, 0, 1, 0, 0],
  17: [1, 0, 0, 1, 1, 0],
  18: [0, 1, 1, 0, 0, 1],
  19: [1, 1, 0, 0, 0, 0],
  20: [0, 0, 0, 0, 1, 1],
  21: [1, 0, 0, 1, 0, 1],
  22: [1, 0, 1, 0, 0, 1],
  23: [0, 0, 0, 0, 0, 1],
  24: [1, 0, 0, 0, 0, 0],
  25: [1, 0, 0, 1, 1, 1],
  26: [1, 1, 1, 0, 0, 1],
  27: [1, 0, 0, 0, 0, 1],
  28: [0, 1, 1, 1, 1, 0],
  29: [0, 1, 0, 0, 1, 0],
  30: [1, 0, 1, 1, 0, 1],
  31: [0, 0, 1, 1, 1, 0],
  32: [0, 1, 1, 1, 0, 0],
  33: [0, 0, 1, 1, 1, 1],
  34: [1, 1, 1, 1, 0, 0],
  35: [0, 0, 0, 1, 0, 1],
  36: [1, 0, 1, 0, 0, 0],
  37: [1, 0, 1, 0, 1, 1],
  38: [1, 1, 0, 1, 0, 1],
  39: [0, 0, 1, 0, 1, 0],
  40: [0, 1, 0, 1, 0, 0],
  41: [1, 1, 0, 0, 0, 1],
  42: [1, 0, 0, 0, 1, 1],
  43: [1, 1, 1, 1, 1, 0],
  44: [0, 1, 1, 1, 1, 1],
  45: [0, 0, 0, 1, 1, 0],
  46: [0, 1, 1, 0, 0, 0],
  47: [0, 1, 0, 1, 1, 0],
  48: [0, 1, 1, 0, 1, 0],
  49: [1, 0, 1, 1, 1, 0],
  50: [0, 1, 1, 1, 0, 1],
  51: [1, 0, 0, 1, 0, 0],
  52: [0, 0, 1, 0, 0, 1],
  53: [0, 0, 1, 0, 1, 1],
  54: [1, 1, 0, 1, 0, 0],
  55: [1, 0, 1, 1, 0, 0],
  56: [0, 0, 1, 1, 0, 1],
  57: [0, 1, 1, 0, 1, 1],
  58: [1, 1, 0, 1, 1, 0],
  59: [0, 1, 0, 0, 1, 1],
  60: [1, 1, 0, 0, 1, 0],
  61: [1, 1, 0, 0, 1, 1],
  62: [0, 0, 1, 1, 0, 0],
  63: [1, 0, 1, 0, 1, 0],
  64: [0, 1, 0, 1, 0, 1],
};

const ICHING_METADATA = [
  ["Càn Vi Thiên", "The Creative", "1-creative"],
  ["Khôn Vi Địa", "The Receptive", "2-receptive"],
  [
    "Thủy Lôi Truân",
    "Difficulty at the Beginning",
    "3-difficulty-at-the-beginning",
  ],
  ["Sơn Thủy Mông", "Youthful Folly", "4-youthful-folly"],
  ["Thủy Thiên Nhu", "Waiting (Nourishment)", "5-waiting-nourishment"],
  ["Thiên Thủy Tụng", "Conflict", "6-conflict"],
  ["Địa Thủy Sư", "The Army", "7-army"],
  ["Thủy Địa Tỷ", "Holding Together (Union)", "8-holding-together-union"],
  [
    "Phong Thiên Tiểu Súc",
    "The Taming Power of the Small",
    "9-taming-power-of-the-small",
  ],
  ["Thiên Trạch Lý", "Treading (Conduct)", "10-treading-conduct"],
  ["Địa Thiên Thái", "Peace", "11-peace"],
  ["Thiên Địa Bĩ", "Standstill (Stagnation)", "12-standstill-stagnation"],
  ["Thiên Hỏa Đồng Nhân", "Fellowship with Men", "13-fellowship-with-men"],
  [
    "Hỏa Thiên Đại Hữu",
    "Possession in Great Measure",
    "14-possession-in-great-measure",
  ],
  ["Địa Sơn Khiêm", "Modesty", "15-modesty"],
  ["Lôi Địa Dự", "Enthusiasm", "16-enthusiasm"],
  ["Trạch Lôi Tùy", "Following", "17-following"],
  [
    "Sơn Phong Cổ",
    "Work on What Has Been Spoiled (Decay)",
    "18-work-on-what-has-been-spoiled-decay",
  ],
  ["Địa Trạch Lâm", "Approach", "19-approach"],
  ["Phong Địa Quán", "Contemplation (View)", "20-contemplation-view"],
  ["Hỏa Lôi Phệ Hạp", "Biting Through", "21-biting-through"],
  ["Sơn Hỏa Bí", "Grace", "22-grace"],
  ["Sơn Địa Bác", "Splitting Apart", "23-splitting-apart"],
  ["Địa Lôi Phục", "Return (The Turning Point)", "24-return-the-turning-point"],
  [
    "Thiên Lôi Vô Vọng",
    "Innocence (The Unexpected)",
    "25-innocence-the-unexpected",
  ],
  [
    "Sơn Thiên Đại Súc",
    "The Taming Power of the Great",
    "26-taming-power-of-the-great",
  ],
  [
    "Sơn Lôi Di",
    "The Corners of the Mouth (Providing Nourishment)",
    "27-corners-of-the-mouth-providing-nourishment",
  ],
  [
    "Trạch Phong Đại Quá",
    "Preponderance of the Great",
    "28-preponderance-of-the-great",
  ],
  ["Khảm Vi Thủy", "The Abysmal (Water)", "29-abysmal-water"],
  ["Ly Vi Hỏa", "The Clinging, Fire", "30-clinging-fire"],
  ["Trạch Sơn Hàm", "Influence (Wooing)", "31-influence-wooing"],
  ["Lôi Phong Hằng", "Duration", "32-duration"],
  ["Thiên Sơn Độn", "Retreat", "33-retreat"],
  ["Lôi Thiên Đại Tráng", "The Power of the Great", "34-power-of-the-great"],
  ["Hỏa Địa Tấn", "Progress", "35-progress"],
  ["Địa Hỏa Minh Di", "Darkening of the Light", "36-darkening-of-the-light"],
  ["Phong Hỏa Gia Nhân", "The Family (The Clan)", "37-family-the-clan"],
  ["Hỏa Trạch Khuê", "Opposition", "38-opposition"],
  ["Thủy Sơn Kiển", "Obstruction", "39-obstruction"],
  ["Lôi Thủy Giải", "Deliverance", "40-deliverance"],
  ["Sơn Trạch Tổn", "Decrease", "41-decrease"],
  ["Phong Lôi Ích", "Increase", "42-increase"],
  [
    "Trạch Thiên Quải",
    "Break-through (Resoluteness)",
    "43-break-through-resoluteness",
  ],
  ["Thiên Phong Cấu", "Coming to Meet", "44-coming-to-meet"],
  [
    "Trạch Địa Tụy",
    "Gathering Together (Massing)",
    "45-gathering-together-massing",
  ],
  ["Địa Phong Thăng", "Pushing Upward", "46-pushing-upward"],
  ["Trạch Thủy Khốn", "Oppression (Exhaustion)", "47-oppression-exhaustion"],
  ["Thủy Phong Tỉnh", "The Well", "48-well"],
  ["Trạch Hỏa Cách", "Revolution (Molting)", "49-revolution-molting"],
  ["Hỏa Phong Đỉnh", "The Caldron", "50-caldron"],
  ["Chấn Vi Lôi", "The Arousing (Shock, Thunder)", "51-arousing-shock-thunder"],
  ["Cấn Vi Sơn", "Keeping Still, Mountain", "52-keeping-still-mountain"],
  [
    "Phong Sơn Tiệm",
    "Development (Gradual Progress)",
    "53-development-gradual-progress",
  ],
  ["Lôi Trạch Quy Muội", "The Marrying Maiden", "54-marrying-maiden"],
  ["Lôi Hỏa Phong", "Abundance (Fullness)", "55-abundance-fullness"],
  ["Hỏa Sơn Lữ", "The Wanderer", "56-wanderer"],
  [
    "Tốn Vi Phong",
    "The Gentle (The Penetrating, Wind)",
    "57-gentle-the-penetrating-wind",
  ],
  ["Đoài Vi Trạch", "The Joyous, Lake", "58-joyous-lake"],
  ["Phong Thủy Hoán", "Dispersion (Dissolution)", "59-dispersion-dissolution"],
  ["Thủy Trạch Tiết", "Limitation", "60-limitation"],
  ["Phong Trạch Trung Phu", "Inner Truth", "61-inner-truth"],
  [
    "Lôi Sơn Tiểu Quá",
    "Preponderance of the Small",
    "62-preponderance-of-the-small",
  ],
  ["Thủy Hỏa Ký Tế", "After Completion", "63-after-completion"],
  ["Hỏa Thủy Vị Tế", "Before Completion", "64-before-completion"],
] as const;

export const INITIAL_CARDS: IChingCard[] = Array.from(
  { length: 64 },
  (_, i) => {
    const num = i + 1;
    const [vietnameseName, englishName, castIChingSlug] = ICHING_METADATA[i];
    const masterSeanChanSlug = MASTER_SEAN_CHAN_SLUGS[i];
    return {
      id: `hexagram-${num}`,
      deckType: "iching",
      number: num,
      vietnameseName,
      englishName,
      link1: `https://dich.kabala.vn/que-${num}`,
      link2: `https://castiching.com/hexagrams/${castIChingSlug}`,
      link3: `https://www.masterseanchan.com/${masterSeanChanSlug}/`,
      keywords: getIChingKeywords(i),
      content1: ICHING_CONTENT_1[i],
      content2: "",
      content3: "",
      imgPath: getHexagramChar(num),
    };
  },
);

const tarotImageModules = import.meta.glob(
  "./assets/tarot/*.{jpg,jpeg,png,webp}",
  {
    eager: true,
    query: "?url",
    import: "default",
  },
) as Record<string, string>;

const TAROT_SUIT_ORDER: Record<string, number> = {
  Wands: 0,
  Cups: 1,
  Swords: 2,
  Pents: 3,
};

const TAROT_SUIT_NAMES: Record<string, string> = {
  Wands: "Wands",
  Cups: "Cups",
  Swords: "Swords",
  Pents: "Pentacles",
};

const TAROT_RANK_NAMES: Record<number, string> = {
  1: "Ace",
  2: "Two",
  3: "Three",
  4: "Four",
  5: "Five",
  6: "Six",
  7: "Seven",
  8: "Eight",
  9: "Nine",
  10: "Ten",
  11: "Page",
  12: "Knight",
  13: "Queen",
  14: "King",
};

const toTitleCase = (value: string) =>
  value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const slugify = (value: string) =>
  value
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const getTarotSortKey = (fileName: string) => {
  const major = fileName.match(/^RWS_Tarot_(\d+)_/);
  if (major) return Number(major[1]);

  const minor = fileName.match(/^(Wands|Cups|Swords|Pents)(\d+)\./);
  if (minor) {
    const [, suit, rank] = minor;
    return 100 + (TAROT_SUIT_ORDER[suit] ?? 99) * 14 + Number(rank);
  }

  return 1000;
};

const getTarotName = (fileName: string) => {
  const major = fileName.match(/^RWS_Tarot_\d+_(.+)\.[^.]+$/);
  if (major) return toTitleCase(major[1]);

  const minor = fileName.match(/^(Wands|Cups|Swords|Pents)(\d+)\./);
  if (minor) {
    const [, suit, rankValue] = minor;
    const rank = Number(rankValue);
    return `${TAROT_RANK_NAMES[rank] || rankValue} of ${TAROT_SUIT_NAMES[suit] || suit}`;
  }

  return toTitleCase(fileName.replace(/\.[^.]+$/, ""));
};

export const TAROT_CARDS: TarotCard[] = Object.entries(tarotImageModules)
  .map(([path, imageUrl]) => {
    const fileName = path.split("/").pop() || path;
    return {
      fileName,
      imageUrl,
      sortKey: getTarotSortKey(fileName),
    };
  })
  .sort((a, b) => a.sortKey - b.sortKey || a.fileName.localeCompare(b.fileName))
  .map((entry, index) => {
    const name = getTarotName(entry.fileName);
    return {
      id: `tarot-${slugify(entry.fileName)}`,
      deckType: "tarot",
      number: index,
      sortOrder: entry.sortKey,
      vietnameseName: name,
      englishName: name,
      imgPath: entry.imageUrl,
      imageUrl: entry.imageUrl,
      fileName: entry.fileName,
    };
  });

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { DeckCard, IChingCard, SpreadCard } from "../types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle2, Edit3, ExternalLink } from "lucide-react";
import { HEX_LINES } from "../constants";

interface CardDetailPopupProps {
  spreadCard: SpreadCard;
  card: DeckCard;
  onUpdateCard?: (card: IChingCard) => void;
  onClose: () => void;
}

const SECTION_TITLE_CLASS =
  "text-[0.75rem] font-bold uppercase tracking-[0.05em] text-[#a1a1aa]";

const isBoldToken = (part: string) =>
  (part.startsWith("**") && part.endsWith("**")) ||
  (part.startsWith("__") && part.endsWith("__"));

function renderInlineMarkdown(text: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*|__[^_]+__)/g)
    .filter(Boolean)
    .map((part, index) => {
      if (isBoldToken(part)) {
        const content = part.slice(2, -2);
        return (
          <strong
            key={`bold-${index}`}
            className="font-semibold text-[#ffffff]"
          >
            {content}
          </strong>
        );
      }

      return <Fragment key={`text-${index}`}>{part}</Fragment>;
    });
}

function renderMultilineText(text: string, keyPrefix: string) {
  return text.split("\n").map((line, index, arr) => (
    <Fragment key={`${keyPrefix}-${index}`}>
      {renderInlineMarkdown(line)}
      {index < arr.length - 1 ? <br /> : null}
    </Fragment>
  ));
}

function renderMarkdownBlock(
  markdown: string,
  variant: "default" | "keywords" = "default",
) {
  const elements: ReactNode[] = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const paragraphBuffer: string[] = [];
  const unorderedBuffer: string[] = [];
  const orderedBuffer: string[] = [];
  let elementIndex = 0;

  const flushParagraph = () => {
    if (!paragraphBuffer.length) return;
    const text = paragraphBuffer.join("\n");
    elements.push(
      <p
        key={`paragraph-${elementIndex++}`}
        className={
          variant === "keywords"
            ? "text-[13.5px] leading-relaxed text-[#ffffff]"
            : "leading-relaxed text-[#e4e4e7]"
        }
      >
        {renderMultilineText(text, `paragraph-${elementIndex}`)}
      </p>,
    );
    paragraphBuffer.length = 0;
  };

  const flushUnordered = () => {
    if (!unorderedBuffer.length) return;
    elements.push(
      <ul
        key={`unordered-${elementIndex++}`}
        className={
          variant === "keywords"
            ? "ml-5 list-disc space-y-0 text-[13.5px] text-[#ffffff]"
            : "ml-5 list-disc space-y-1.5"
        }
      >
        {unorderedBuffer.map((item, index) => (
          <li
            key={`unordered-item-${index}`}
            className={
              variant === "keywords"
                ? "leading-relaxed text-[#ffffff]"
                : "leading-relaxed text-[#e4e4e7]"
            }
          >
            {renderInlineMarkdown(item)}
          </li>
        ))}
      </ul>,
    );
    unorderedBuffer.length = 0;
  };

  const flushOrdered = () => {
    if (!orderedBuffer.length) return;
    elements.push(
      <ol
        key={`ordered-${elementIndex++}`}
        className={
          variant === "keywords"
            ? "ml-5 list-decimal space-y-0 text-[13.5px] text-[#ffffff]"
            : "ml-5 list-decimal space-y-1.5"
        }
      >
        {orderedBuffer.map((item, index) => (
          <li
            key={`ordered-item-${index}`}
            className={
              variant === "keywords"
                ? "leading-relaxed text-[#ffffff]"
                : "leading-relaxed text-[#e4e4e7]"
            }
          >
            {renderInlineMarkdown(item)}
          </li>
        ))}
      </ol>,
    );
    orderedBuffer.length = 0;
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      flushUnordered();
      flushOrdered();
      return;
    }

    if (/^[\u2713\u2714⦾➱]\s+/.test(trimmed)) {
      flushParagraph();
      flushUnordered();
      flushOrdered();
      elements.push(
        <div
          key={`special-${elementIndex++}`}
          className={
            variant === "keywords"
              ? "leading-relaxed text-[#ffffff]"
              : "leading-relaxed text-[#e4e4e7]"
          }
        >
          {renderInlineMarkdown(trimmed)}
        </div>,
      );
      return;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      flushParagraph();
      flushOrdered();
      unorderedBuffer.push(trimmed.replace(/^[-*]\s+/, ""));
      return;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      flushParagraph();
      flushUnordered();
      orderedBuffer.push(trimmed.replace(/^\d+\.\s+/, ""));
      return;
    }

    flushUnordered();
    flushOrdered();
    paragraphBuffer.push(line);
  });

  flushParagraph();
  flushUnordered();
  flushOrdered();

  return (
    <div className={variant === "keywords" ? "space-y-0" : "space-y-3"}>
      {elements}
    </div>
  );
}

export default function CardDetailPopup({
  spreadCard: _spreadCard,
  card,
  onUpdateCard,
  onClose,
}: CardDetailPopupProps) {
  const [isEditingKeywords, setIsEditingKeywords] = useState(false);
  const [keywords, setKeywords] = useState(card.keywords || "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isTarot = card.deckType === "tarot" || Boolean(card.imageUrl);

  useEffect(() => {
    setKeywords(card.keywords || "");
  }, [card]);

  useEffect(() => {
    if (isEditingKeywords && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [isEditingKeywords]);

  const handleSaveKeywords = () => {
    setIsEditingKeywords(false);
    if (card.deckType === "iching") {
      onUpdateCard?.({ ...card, keywords } as IChingCard);
    }
  };

  const handleLinkClick = (text: string) => {
    if (!text) return;
    const url = /^https?:\/\//i.test(text) ? text : `https://${text}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  if (isTarot) {
    return (
      <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          showCloseButton={false}
          className="
            !left-1/2 !top-1/2
            !flex !flex-col
            gap-0
            w-[min(92vw,520px)]
            max-w-none
            max-h-[86vh]
            overflow-hidden
            border border-[#2d2d33]
            bg-[#16161a]
            p-0
            shadow-[0_30px_60px_rgba(0,0,0,0.5)]
          "
        >
          <DialogHeader className="shrink-0 border-b border-[#2d2d33] px-6 py-5">
            <div className="flex items-center gap-4 text-left">
              <div className="h-20 w-14 shrink-0 overflow-hidden rounded-lg border border-[#2d2d33] bg-[#111827]">
                <img
                  src={card.imageUrl || card.imgPath}
                  alt={card.englishName}
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              </div>
              <div className="min-w-0 flex-1">
                <DialogTitle className="truncate text-[24px] font-bold leading-tight text-[#ffffff]">
                  {card.vietnameseName}
                </DialogTitle>
                <p className="mt-1 text-[13px] font-bold uppercase tracking-widest text-[#c6c6d0]">
                  Tarot {String(card.number).padStart(2, "0")}
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="min-h-0 overflow-y-auto px-6 py-6">
            <div className="mx-auto flex max-w-[320px] flex-col items-center gap-4">
              <div className="w-full overflow-hidden rounded-2xl border border-[#2d2d33] bg-[#111827] p-3 shadow-[0_20px_40px_rgba(0,0,0,0.35)]">
                <img
                  src={card.imageUrl || card.imgPath}
                  alt={card.englishName}
                  className="h-auto w-full rounded-xl object-contain"
                  draggable={false}
                />
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const hexLines = HEX_LINES[card.number] || [1, 1, 1, 1, 1, 1];
  const links = [card.link1, card.link2, card.link3].filter(
    Boolean,
  ) as string[];
  const contentSections = [1, 2, 3]
    .map((index) => ({
      index,
      content: (card as IChingCard & Record<string, string | undefined>)[
        `content${index}`
      ],
    }))
    .filter((section) => Boolean(section.content));

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="
          !left-1/2 !top-1/2
          !flex !flex-col
          gap-0
          w-[min(92vw,777px)]
          max-w-none
          sm:w-[777px]
          sm:max-w-none
          h-[88vh]
          overflow-hidden
          border border-[#2d2d33]
          bg-[#16161a]
          p-0
          shadow-[0_30px_60px_rgba(0,0,0,0.5)]
        "
      >
        <DialogHeader className="shrink-0 border-b border-[#2d2d33] px-8 pt-4 pb-4">
          <div className="mt-[2px] flex items-start gap-5 text-left">
            <div className="ml-[4px] flex shrink-0 flex-col items-center gap-2.5 rounded-2xl border border-[#2d2d33] bg-[#1b1b20] px-4 py-3.5">
              <div className="flex w-[68px] flex-col-reverse justify-center gap-[6px]">
                {hexLines.map((line, idx) => (
                  <div key={idx} className="flex h-[6px] w-full gap-[6px]">
                    {line === 1 ? (
                      <div className="flex-1 rounded-[2px] bg-[#eab308] shadow-[0_0_5px_rgba(234,179,8,0.4)]" />
                    ) : (
                      <>
                        <div className="flex-1 rounded-[2px] bg-[#eab308] shadow-[0_0_5px_rgba(234,179,8,0.4)]" />
                        <div className="flex-1 rounded-[2px] bg-[#eab308] shadow-[0_0_5px_rgba(234,179,8,0.4)]" />
                      </>
                    )}
                  </div>
                ))}
              </div>

              <div className="text-[17px] font-bold leading-[15px] text-[#eab308] drop-shadow-[0_0_3px_rgba(234,179,8,0.3)]">
                {String(card.number).padStart(2, "0")}
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <DialogTitle className="ml-[2px] p-0 text-[24px] font-bold leading-tight text-[#ffffff]">
                {card.vietnameseName}
              </DialogTitle>

              <p className="mt-[2px] ml-[2px] text-[16px] font-bold uppercase leading-tight text-[#c6c6d0]">
                {card.englishName}
              </p>

              <div className="group relative mt-[12px] ml-[2px] w-full pb-[12px]">
                {isEditingKeywords ? (
                  <>
                    <textarea
                      ref={textareaRef}
                      className="h-[107px] w-full resize-none bg-transparent pr-[6px] text-[13.5px] leading-relaxed text-[#ffffff] outline-none placeholder:text-[#666874] [scrollbar-width:thin] [scrollbar-color:#1f232b_transparent] [&::-webkit-scrollbar]:w-[4px] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#1f232b] [&::-webkit-scrollbar-track]:bg-transparent"
                      value={keywords}
                      onChange={(e) => setKeywords(e.target.value)}
                      placeholder="Add keywords for this hexagram..."
                    />
                    <button
                      onClick={handleSaveKeywords}
                      className="absolute bottom-[-10px] right-[-10px] z-10 rounded-full bg-[#16161a] p-1 text-[#22c55e] transition-all hover:scale-110 hover:text-[#16a34a]"
                      title="Save keywords"
                    >
                      <CheckCircle2 className="h-5 w-5" />
                    </button>
                  </>
                ) : (
                  <>
                    <div className="h-[107px] overflow-y-auto overflow-x-hidden bg-transparent pr-[6px] text-[13.5px] text-[#ffffff] [scrollbar-width:thin] [scrollbar-color:#1f232b_transparent] [&::-webkit-scrollbar]:w-[4px] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#1f232b] [&::-webkit-scrollbar-track]:bg-transparent">
                      {keywords?.trim() ? (
                        renderMarkdownBlock(keywords, "keywords")
                      ) : (
                        <div className="text-[13.5px] leading-relaxed text-[#ffffff]">
                          No keywords yet.
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => setIsEditingKeywords(true)}
                      className="absolute bottom-[-10px] right-[-10px] z-10 rounded-full bg-[#16161a] p-1 text-[#8c8c98] opacity-0 transition-all hover:scale-110 hover:text-[#1f87d7] group-hover:opacity-100"
                      title="Edit keywords"
                    >
                      <Edit3 className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="detail-scrollbar flex-1 min-h-0 overflow-y-scroll overflow-x-hidden pr-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#3f3f46] hover:[&::-webkit-scrollbar-thumb]:bg-[#52525b]">
          <div className="space-y-6 px-8 pt-5 pb-7">
            {links.length > 0 && (
              <section className="space-y-4">
                <h3 className={SECTION_TITLE_CLASS}>Resources &amp; Links</h3>
                <div className="space-y-3">
                  {links.map((link, index) => (
                    <button
                      key={`${link}-${index}`}
                      onClick={() => handleLinkClick(link)}
                      className="group flex w-full items-center justify-between rounded-xl border border-[#2d2d33] bg-[#1c1c1f] px-4 py-3 text-left transition-all hover:border-[#1f87d7]/50 hover:bg-[#1c1f26]"
                    >
                      <span className="truncate pr-3 text-sm font-medium text-[#1f87d7]">
                        {link}
                      </span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[#a1a1aa] group-hover:text-[#1f87d7]" />
                    </button>
                  ))}
                </div>
              </section>
            )}

            {contentSections.map(({ index, content }) => (
              <section key={index} className="space-y-4">
                <h3 className={SECTION_TITLE_CLASS}>
                  Interpretation Part {index}
                </h3>
                <div className="rounded-xl border border-[#2d2d33] bg-[#1c1c1f] px-5 py-[20px] text-[0.95rem] leading-relaxed text-[#e4e4e7] shadow-inner">
                  {renderMarkdownBlock(content || "")}
                </div>
              </section>
            ))}

            {contentSections.length === 0 && (
              <div className="rounded-xl border border-dashed border-[#2d2d33] bg-[#1b1b20] px-6 py-20 text-center text-sm italic text-[#a1a1aa]">
                No detailed interpretation available for this hexagram yet.
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import {
  SpreadCard,
  DeckCard,
  Label,
  LabelGroup,
  IChingPolarity,
} from "../types";
import CanvasCard from "./CanvasCard";

type CanvasOffset = {
  x: number;
  y: number;
};

interface SpreadCanvasProps {
  spreadCards: SpreadCard[];
  cards: DeckCard[];
  labels: Label[];
  labelGroups: LabelGroup[];
  onUpdatePosition: (id: string, x: number, y: number) => void;
  onSelectCard: (id: string) => void;
  onUpdateLabels: (id: string, labelIds: string[]) => void;
  onUpdateCardState: (
    id: string,
    updates: { isReversed?: boolean; polarity?: IChingPolarity },
  ) => void;
  onRemoveCard: (id: string) => void;
  selectedCardIds?: string[];
  onToggleCardSelection?: (id: string) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  offset: CanvasOffset;
  onOffsetChange: (offset: CanvasOffset) => void;
}

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 3;

const clampZoom = (value: number) =>
  Math.min(Math.max(value, MIN_ZOOM), MAX_ZOOM);

function SpreadCanvas({
  spreadCards,
  cards,
  labels,
  labelGroups,
  onUpdatePosition,
  onSelectCard,
  onUpdateLabels,
  onUpdateCardState,
  onRemoveCard,
  selectedCardIds = [],
  onToggleCardSelection,
  zoom,
  onZoomChange,
  offset,
  onOffsetChange,
}: SpreadCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasContentRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const startPanPos = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 2) {
      setIsPanning(true);
      startPanPos.current = {
        x: e.clientX - offset.x,
        y: e.clientY - offset.y,
      };
      e.preventDefault();
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      onOffsetChange({
        x: e.clientX - startPanPos.current.x,
        y: e.clientY - startPanPos.current.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const center = {
        x: rect.width / 2,
        y: rect.height / 2,
      };
      const canvasPointAtCenter = {
        x: (center.x - offset.x) / zoom,
        y: (center.y - offset.y) / zoom,
      };
      const zoomFactor = Math.exp(-e.deltaY * 0.001);
      const newZoom = clampZoom(zoom * zoomFactor);

      onZoomChange(newZoom);
      onOffsetChange({
        x: center.x - canvasPointAtCenter.x * newZoom,
        y: center.y - canvasPointAtCenter.y * newZoom,
      });
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener("wheel", handleWheel, { passive: false });
    }
    return () => {
      if (container) {
        container.removeEventListener("wheel", handleWheel);
      }
    };
  }, [offset, zoom, onOffsetChange, onZoomChange]);

  useLayoutEffect(() => {
    const canvasContent = canvasContentRef.current;
    if (!canvasContent) return;

    canvasContent.style.transform = `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${zoom})`;
  }, [offset.x, offset.y, zoom]);

  return (
    <div
      ref={containerRef}
      className="spread-canvas-bg flex-1 h-full relative overflow-hidden cursor-crosshair bg-[#15171c]"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onContextMenu={handleContextMenu}
    >
      <div
        ref={canvasContentRef}
        className="absolute left-0 top-0 h-[5000px] w-[5000px] origin-top-left"
      >
        {spreadCards.map((spreadCard) => {
          const cardData = cards.find((c) => c.id === spreadCard.cardId);
          if (!cardData) return null;

          return (
            <CanvasCard
              key={spreadCard.id}
              spreadCard={spreadCard}
              card={cardData}
              labels={labels}
              labelGroups={labelGroups}
              onUpdatePosition={onUpdatePosition}
              onSelect={() => onSelectCard(spreadCard.id)}
              onUpdateLabels={(labelIds) =>
                onUpdateLabels(spreadCard.id, labelIds)
              }
              onUpdateCardState={(updates) =>
                onUpdateCardState(spreadCard.id, updates)
              }
              onRemove={() => onRemoveCard(spreadCard.id)}
              canvasOffset={offset}
              zoom={zoom}
              isBulkSelected={selectedCardIds.includes(spreadCard.id)}
              onToggleBulkSelect={() => onToggleCardSelection?.(spreadCard.id)}
            />
          );
        })}
      </div>
    </div>
  );
}

export default React.memo(SpreadCanvas);

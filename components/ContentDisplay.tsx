import React, { useEffect, useCallback, useRef } from 'react';
import { motion } from 'motion/react';

interface SelectionInfo {
  text: string;
  range: Range;
  position: { top: number; left: number };
}

interface ContentDisplayProps {
  content: string;
  contentType: 'html' | 'url';
  sourceUrl: string;
  zoom: number;
  isHighlightMode: boolean;
  onSelectionChange: (hasSelection: boolean, selectionInfo?: SelectionInfo | null) => void;
  onHighlightText: (customRange?: Range, customText?: string) => void;
  onAddNoteFromSelection: (selectionInfo?: SelectionInfo | null) => void;
  onPlayFromSelection: (targetNode: Node, selectedText?: string) => void;
  contentRef: React.RefObject<HTMLDivElement | null>;
  selectionInfo?: SelectionInfo | null;
}

export const ContentDisplay: React.FC<ContentDisplayProps> = React.memo(({
  content,
  contentType,
  sourceUrl,
  zoom,
  isHighlightMode,
  onSelectionChange,
  onHighlightText,
  onAddNoteFromSelection,
  onPlayFromSelection,
  contentRef,
  selectionInfo,
}) => {
  const selectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const updateSelection = useCallback((isFinished: boolean = false) => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0 || !contentRef.current) {
      if (selectionInfo && !isFinished) {
        onSelectionChange(false, null);
      }
      return;
    }

    const range = selection.getRangeAt(0);
    const container = contentRef.current;
    
    const isInside = container.contains(range.commonAncestorContainer) || 
                     container.contains(selection.anchorNode) || 
                     container.contains(selection.focusNode);

    if (!isInside) {
      if (selectionInfo && !isFinished) {
        onSelectionChange(false, null);
      }
      return;
    }

    const text = selection.toString().trim();
    if (!text) {
      return;
    }

    const rect = range.getBoundingClientRect();
    const top = Math.max(10, rect.top - 12);
    const left = Math.max(100, Math.min(window.innerWidth - 100, rect.left + rect.width / 2));

    const info: SelectionInfo = {
      text,
      range: range.cloneRange(),
      position: { top, left },
    };

    if (isFinished && isHighlightMode) {
      onHighlightText(info.range, info.text);
    } else {
      onSelectionChange(true, info);
    }
  }, [contentRef, isHighlightMode, onSelectionChange, onHighlightText]);

  useEffect(() => {
    return () => {
      if (selectionTimeoutRef.current) {
        clearTimeout(selectionTimeoutRef.current);
      }
    };
  }, []);

  const handleMouseUp = () => {
    requestAnimationFrame(() => updateSelection(true));
  };

  const handleTouchEnd = () => {
    setTimeout(() => updateSelection(true), 100);
  };

  const handleKeyUp = (e: React.KeyboardEvent) => {
    if (e.key.startsWith('Arrow') || e.key === 'Shift') {
      setTimeout(() => updateSelection(true), 100);
    }
  };

  const handleClearSelection = () => {
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
    }
    onSelectionChange(false, null);
  };

  const cursorStyle = isHighlightMode ? { cursor: 'text' } : {};

  return (
    <div 
      className="flex-grow bg-zinc-50 dark:bg-zinc-950 overflow-auto scroll-smooth relative" 
      onMouseUp={handleMouseUp}
      onTouchEnd={handleTouchEnd}
      onKeyUp={handleKeyUp}
      style={cursorStyle}
    >
      <div className="w-full min-h-full py-6 md:py-12 px-4 md:px-12">
        {contentType === 'url' ? (
          <iframe src={sourceUrl} className="w-full h-[80vh] border-0 rounded-2xl shadow-xl bg-white" title="Web Content" />
        ) : (
          <div
            ref={contentRef}
            style={{ fontSize: zoom !== 100 ? `${zoom}%` : undefined }}
            className="prose dark:prose-invert bg-white dark:bg-zinc-900 p-6 md:p-16 rounded-3xl shadow-sm border border-zinc-200 dark:border-zinc-800 select-text transition-all duration-150 touch-manipulation focus:outline-none"
            dangerouslySetInnerHTML={{ __html: content }}
          />
        )}
      </div>
    </div>
  );
});

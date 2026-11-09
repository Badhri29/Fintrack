import React, { useRef, useMemo, useEffect } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface YearWheelPickerProps {
  selectedYear: number;
  onYearChange: (yr: number) => void;
  className?: string;
}

export const YearWheelPicker: React.FC<YearWheelPickerProps> = ({
  selectedYear,
  onYearChange,
  className
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const ITEM_HEIGHT = 24;
  const minYear = 2020;
  const maxYear = 2035;
  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = minYear; y <= maxYear; y++) list.push(y);
    return list;
  }, []);

  const isProgrammatic = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const targetIdx = selectedYear - minYear;
    // Target scroll keeps selectedYear in the middle row (slot 2 of 3)
    const targetScrollTop = targetIdx * ITEM_HEIGHT;
    if (Math.abs(containerRef.current.scrollTop - targetScrollTop) > 2) {
      isProgrammatic.current = true;
      containerRef.current.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: 'smooth'
      });
      const timer = setTimeout(() => {
        isProgrammatic.current = false;
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [selectedYear]);

  const handleArrow = (delta: number) => {
    const nextYear = Math.max(minYear, Math.min(maxYear, selectedYear + delta));
    if (nextYear !== selectedYear) {
      onYearChange(nextYear);
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (isProgrammatic.current) return;
    const scrollTop = e.currentTarget.scrollTop;
    const nearestIdx = Math.round(scrollTop / ITEM_HEIGHT);
    const nearestYear = minYear + nearestIdx;
    if (nearestYear >= minYear && nearestYear <= maxYear && nearestYear !== selectedYear) {
      onYearChange(nearestYear);
    }
  };

  return (
    <div className={`credit-cards-vertical-year-picker ${className || ''}`}>
      <button
        type="button"
        onClick={() => handleArrow(-1)}
        className="picker-arrow-btn"
        title="Previous Year"
        aria-label="Previous Year"
      >
        <ChevronUp size={12} />
      </button>

      <div
        ref={containerRef}
        className="picker-wheel-scroll no-scrollbar"
        onScroll={handleScroll}
        style={{
          height: ITEM_HEIGHT * 3, // 72px for exactly 3 items: Prev, Current, Next
          overflowY: 'scroll',
          scrollSnapType: 'y mandatory',
          scrollBehavior: 'smooth',
          width: '100%',
          position: 'relative'
        }}
      >
        <div style={{ height: ITEM_HEIGHT }} />
        {years.map(yr => {
          const isActive = yr === selectedYear;
          return (
            <div
              key={yr}
              onClick={() => onYearChange(yr)}
              className={`picker-year-item ${isActive ? 'active' : ''}`}
              style={{
                height: ITEM_HEIGHT,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                scrollSnapAlign: 'center',
                cursor: 'pointer',
                userSelect: 'none',
                fontSize: isActive ? 12 : 9.5,
                fontWeight: isActive ? 800 : 500,
                color: isActive ? '#FFFFFF' : 'var(--text-muted)',
                opacity: isActive ? 1 : 0.65,
                background: isActive ? 'var(--accent-indigo)' : 'transparent',
                borderRadius: isActive ? 6 : 0,
                transition: 'all 0.18s ease'
              }}
            >
              {yr}
            </div>
          );
        })}
        <div style={{ height: ITEM_HEIGHT }} />
      </div>

      <button
        type="button"
        onClick={() => handleArrow(1)}
        className="picker-arrow-btn"
        title="Next Year"
        aria-label="Next Year"
      >
        <ChevronDown size={12} />
      </button>
    </div>
  );
};

import React, { useRef, useEffect, useCallback } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface YearWheelPickerProps {
  selectedYear: number;
  onYearChange: (yr: number) => void;
  className?: string;
  minYear?: number;
  maxYear?: number;
}

export const YearWheelPicker: React.FC<YearWheelPickerProps> = ({
  selectedYear,
  onYearChange,
  className,
  minYear = 2020,
  maxYear = 2035
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastWheelTime = useRef<number>(0);
  const touchStartY = useRef<number | null>(null);

  const handleArrow = useCallback(
    (delta: number) => {
      const nextYear = Math.max(minYear, Math.min(maxYear, selectedYear + delta));
      if (nextYear !== selectedYear) {
        onYearChange(nextYear);
      }
    },
    [minYear, maxYear, selectedYear, onYearChange]
  );

  // Non-passive wheel handler so rolling the wheel over the year picker steps the year cleanly
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const now = Date.now();
      if (now - lastWheelTime.current < 160) return; // throttle wheel jumps
      if (e.deltaY < -4) {
        lastWheelTime.current = now;
        handleArrow(-1);
      } else if (e.deltaY > 4) {
        lastWheelTime.current = now;
        handleArrow(1);
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
    };
  }, [handleArrow]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartY.current = e.touches[0].clientY;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const endY = e.changedTouches[0]?.clientY;
    if (endY !== undefined) {
      const diff = touchStartY.current - endY;
      if (diff > 20) {
        // Swiped up -> next year
        handleArrow(1);
      } else if (diff < -20) {
        // Swiped down -> previous year
        handleArrow(-1);
      }
    }
    touchStartY.current = null;
  };

  const prevYear = selectedYear - 1;
  const nextYear = selectedYear + 1;

  return (
    <div
      ref={containerRef}
      className={`credit-cards-vertical-year-picker ${className || ''}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      role="group"
      aria-label="Year picker"
    >
      <button
        type="button"
        onClick={() => handleArrow(-1)}
        disabled={selectedYear <= minYear}
        className="picker-arrow-btn"
        title="Previous Year"
        aria-label="Previous Year"
      >
        <ChevronUp size={12} />
      </button>

      <div className="picker-years-stack">
        {prevYear >= minYear ? (
          <button
            type="button"
            onClick={() => onYearChange(prevYear)}
            className="picker-year-item"
            title={`Select year ${prevYear}`}
            aria-label={`Select year ${prevYear}`}
          >
            {prevYear}
          </button>
        ) : (
          <div className="picker-year-item placeholder" aria-hidden="true">
            &nbsp;
          </div>
        )}

        <div
          className="picker-year-item active"
          aria-current="true"
          title={`Selected year ${selectedYear}`}
        >
          {selectedYear}
        </div>

        {nextYear <= maxYear ? (
          <button
            type="button"
            onClick={() => onYearChange(nextYear)}
            className="picker-year-item"
            title={`Select year ${nextYear}`}
            aria-label={`Select year ${nextYear}`}
          >
            {nextYear}
          </button>
        ) : (
          <div className="picker-year-item placeholder" aria-hidden="true">
            &nbsp;
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => handleArrow(1)}
        disabled={selectedYear >= maxYear}
        className="picker-arrow-btn"
        title="Next Year"
        aria-label="Next Year"
      >
        <ChevronDown size={12} />
      </button>
    </div>
  );
};

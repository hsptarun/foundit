import React, { useState, useRef, useEffect } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';

export type TimeMode = 'exact' | 'approximate' | 'unknown';

export interface DateTimeValue {
  date: string; // e.g. "2026-09-11"
  formattedDate: string; // e.g. "September 11, 2026"
  timeMode: TimeMode;
  exactTime?: {
    hour: string;
    minute: string;
    period: 'AM' | 'PM';
  };
  approximateRange?: {
    startHour: string;
    startMinute: string;
    startPeriod: 'AM' | 'PM';
    endHour: string;
    endMinute: string;
    endPeriod: 'AM' | 'PM';
  };
  displayString: string;
}

interface ReportDateTimePickerProps {
  value: string;
  onChange: (displayString: string, details?: DateTimeValue) => void;
  categorySelect?: React.ReactNode;
  dateLabel?: string;
  timeLabel?: string;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DAYS_OF_WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const HOURS_PADDED = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
const MINUTES_EXPANDED = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

// Generate 30-minute interval slots from 12:00 AM to 11:30 PM
const TIME_SLOTS: string[] = [];
const PERIODS: ('AM' | 'PM')[] = ['AM', 'PM'];
for (const period of PERIODS) {
  TIME_SLOTS.push(`12:00 ${period}`);
  TIME_SLOTS.push(`12:30 ${period}`);
  for (let h = 1; h <= 11; h++) {
    const hourPadded = h < 10 ? `0${h}` : `${h}`;
    TIME_SLOTS.push(`${hourPadded}:00 ${period}`);
    TIME_SLOTS.push(`${hourPadded}:30 ${period}`);
  }
}

function parseTimeString(timeStr: string) {
  const parts = timeStr.trim().split(' ');
  const period = (parts[1] === 'AM' ? 'AM' : 'PM') as 'AM' | 'PM';
  const [h, m] = (parts[0] || '12:00').split(':');
  return {
    hour: parseInt(h, 10).toString(),
    minute: m || '00',
    period,
  };
}

export const ReportDateTimePicker: React.FC<ReportDateTimePickerProps> = ({
  value,
  onChange,
  categorySelect,
  dateLabel = 'Date',
  timeLabel = 'Time',
}) => {
  // Calendar state
  const today = new Date();
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [calendarViewDate, setCalendarViewDate] = useState<Date>(today);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  // Time state
  const [timeMode, setTimeMode] = useState<TimeMode>('exact');

  // Exact time components: default to 03:30 PM
  const [exactHour, setExactHour] = useState('03');
  const [exactMinute, setExactMinute] = useState('30');
  const [exactPeriod, setExactPeriod] = useState<'AM' | 'PM'>('PM');

  // Approximate range components: default to 03:00 PM - 04:00 PM
  const [approxStartTime, setApproxStartTime] = useState('03:00 PM');
  const [approxEndTime, setApproxEndTime] = useState('04:00 PM');

  const calendarContainerRef = useRef<HTMLDivElement>(null);

  // Close calendar popup on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (calendarContainerRef.current && !calendarContainerRef.current.contains(e.target as Node)) {
        setIsCalendarOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Compute and emit formatted string whenever components change
  useEffect(() => {
    const formattedDate = `${MONTH_NAMES[selectedDate.getMonth()]} ${selectedDate.getDate()}, ${selectedDate.getFullYear()}`;
    const isoDate = selectedDate.toISOString().split('T')[0];

    let timeText = '';
    if (timeMode === 'exact') {
      timeText = `${exactHour}:${exactMinute} ${exactPeriod}`;
    } else if (timeMode === 'approximate') {
      timeText = `Approx. ${approxStartTime} – ${approxEndTime}`;
    } else {
      timeText = 'Time unknown';
    }

    const fullString = `${formattedDate} (${timeText})`;

    const startParsed = parseTimeString(approxStartTime);
    const endParsed = parseTimeString(approxEndTime);

    const details: DateTimeValue = {
      date: isoDate,
      formattedDate,
      timeMode,
      exactTime:
        timeMode === 'exact'
          ? { hour: exactHour, minute: exactMinute, period: exactPeriod }
          : undefined,
      approximateRange:
        timeMode === 'approximate'
          ? {
              startHour: startParsed.hour,
              startMinute: startParsed.minute,
              startPeriod: startParsed.period,
              endHour: endParsed.hour,
              endMinute: endParsed.minute,
              endPeriod: endParsed.period,
            }
          : undefined,
      displayString: fullString,
    };

    onChange(fullString, details);
  }, [
    selectedDate,
    timeMode,
    exactHour,
    exactMinute,
    exactPeriod,
    approxStartTime,
    approxEndTime,
  ]);

  // Calendar calculations
  const viewYear = calendarViewDate.getFullYear();
  const viewMonth = calendarViewDate.getMonth();

  const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const handlePrevMonth = () => {
    setCalendarViewDate(new Date(viewYear, viewMonth - 1, 1));
  };

  const handleNextMonth = () => {
    setCalendarViewDate(new Date(viewYear, viewMonth + 1, 1));
  };

  const isSelectedDay = (day: number) => {
    return (
      selectedDate.getDate() === day &&
      selectedDate.getMonth() === viewMonth &&
      selectedDate.getFullYear() === viewYear
    );
  };

  const isToday = (day: number) => {
    const now = new Date();
    return (
      now.getDate() === day &&
      now.getMonth() === viewMonth &&
      now.getFullYear() === viewYear
    );
  };

  const handleSelectDay = (day: number) => {
    const newDate = new Date(viewYear, viewMonth, day);
    setSelectedDate(newDate);
    setIsCalendarOpen(false);
  };

  const handleQuickDate = (type: 'today' | 'yesterday') => {
    const d = new Date();
    if (type === 'yesterday') {
      d.setDate(d.getDate() - 1);
    }
    setSelectedDate(d);
    setCalendarViewDate(d);
    setIsCalendarOpen(false);
  };

  const formattedSelectedDate = `${MONTH_NAMES[selectedDate.getMonth()]} ${selectedDate.getDate()}, ${selectedDate.getFullYear()}`;

  return (
    <div className="space-y-4 w-full text-xs box-border">
      {/* ROW 1: Category & Date */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 w-full">
        {/* Column 1: Category (1fr) */}
        <div className="min-w-0 w-full">
          {categorySelect}
        </div>

        {/* Column 2: Date (1fr) */}
        <div className="min-w-0 w-full">
          <label className="block text-xs font-medium text-[#1B1812] mb-1">
            {dateLabel}
          </label>
          <div ref={calendarContainerRef} className="relative w-full">
            <button
              type="button"
              id="report-date-picker-btn"
              onClick={() => setIsCalendarOpen(!isCalendarOpen)}
              className="w-full px-3 py-2 border border-[#1B1812]/20 rounded bg-transparent text-[#1B1812] text-xs focus:border-[#1B1812] focus:outline-hidden flex items-center justify-between cursor-pointer hover:border-[#1B1812]/40 transition-colors text-left"
            >
              <span className="flex items-center gap-2 truncate text-[#1B1812]">
                <CalendarIcon className="w-3.5 h-3.5 text-[#E8A33D] shrink-0" />
                <span className="font-normal">{formattedSelectedDate}</span>
              </span>
              <span className="text-[10px] text-[#1B1812]/40 shrink-0 ml-1">Change</span>
            </button>

            {/* Calendar Popup (Anchored rightward to avoid edge overflow) */}
            {isCalendarOpen && (
              <div className="absolute z-50 right-0 left-0 sm:left-auto mt-1 w-64 max-w-[calc(100vw-2rem)] bg-[#F6F3EC] border border-[#1B1812]/20 rounded-xl shadow-xl p-3 space-y-2.5 box-border">
                {/* Month Navigation */}
                <div className="flex items-center justify-between pb-1 border-b border-[#1B1812]/10">
                  <button
                    type="button"
                    onClick={handlePrevMonth}
                    className="p-1 rounded text-[#1B1812]/60 hover:text-[#1B1812] hover:bg-[#1B1812]/5 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="font-fraunces font-medium text-xs text-[#1B1812]">
                    {MONTH_NAMES[viewMonth]} {viewYear}
                  </span>
                  <button
                    type="button"
                    onClick={handleNextMonth}
                    className="p-1 rounded text-[#1B1812]/60 hover:text-[#1B1812] hover:bg-[#1B1812]/5 cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Days of week header */}
                <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-[#1B1812]/50">
                  {DAYS_OF_WEEK.map((d) => (
                    <div key={d} className="py-0.5">
                      {d}
                    </div>
                  ))}
                </div>

                {/* Day numbers grid */}
                <div className="grid grid-cols-7 gap-1 text-center text-xs">
                  {Array.from({ length: firstDayOfMonth }).map((_, i) => (
                    <div key={`blank-${i}`} />
                  ))}

                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const selected = isSelectedDay(day);
                    const todayMatch = isToday(day);

                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => handleSelectDay(day)}
                        className={`h-7 w-7 mx-auto rounded-full flex items-center justify-center text-xs transition-colors cursor-pointer ${
                          selected
                            ? 'bg-[#1B1812] text-[#F6F3EC] font-semibold'
                            : todayMatch
                            ? 'border border-[#E8A33D] text-[#1B1812] font-semibold hover:bg-[#E8A33D]/10'
                            : 'text-[#1B1812] hover:bg-[#1B1812]/10'
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>

                {/* Quick Preset Buttons */}
                <div className="pt-2 border-t border-[#1B1812]/10 flex items-center justify-between text-[11px]">
                  <button
                    type="button"
                    onClick={() => handleQuickDate('today')}
                    className="text-[#1B1812]/70 hover:text-[#1B1812] font-medium underline cursor-pointer"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickDate('yesterday')}
                    className="text-[#1B1812]/70 hover:text-[#1B1812] font-medium underline cursor-pointer"
                  >
                    Yesterday
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCalendarOpen(false)}
                    className="text-[10px] text-[#1B1812]/50 hover:text-[#1B1812]"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ROW 2: Time Precision (Full Width) */}
      <div className="w-full">
        <label className="block text-xs font-medium text-[#1B1812] mb-1.5">
          Time Precision
        </label>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-[#1B1812]">
          <label className="inline-flex items-center gap-2 cursor-pointer select-none whitespace-nowrap">
            <input
              type="radio"
              name="timePrecisionMode"
              value="exact"
              checked={timeMode === 'exact'}
              onChange={() => setTimeMode('exact')}
              className="w-4 h-4 accent-[#1B1812] cursor-pointer shrink-0"
            />
            <span>Exact time</span>
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer select-none whitespace-nowrap">
            <input
              type="radio"
              name="timePrecisionMode"
              value="approximate"
              checked={timeMode === 'approximate'}
              onChange={() => setTimeMode('approximate')}
              className="w-4 h-4 accent-[#1B1812] cursor-pointer shrink-0"
            />
            <span>Approximate time</span>
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer select-none whitespace-nowrap">
            <input
              type="radio"
              name="timePrecisionMode"
              value="unknown"
              checked={timeMode === 'unknown'}
              onChange={() => setTimeMode('unknown')}
              className="w-4 h-4 accent-[#1B1812] cursor-pointer shrink-0"
            />
            <span>I don&rsquo;t remember</span>
          </label>
        </div>
      </div>

      {/* ROW 3: Time Controls */}
      {timeMode === 'exact' && (
        <div className="space-y-1 w-full">
          <label className="block text-xs font-medium text-[#1B1812]">
            {timeLabel}
          </label>
          <div className="flex items-center gap-2 sm:gap-3 max-w-xs sm:max-w-sm w-full">
            {/* Hour Select [ 03 ▼ ] */}
            <div className="relative min-w-[68px] sm:min-w-[80px] flex-1">
              <select
                id="exact-time-hour"
                value={exactHour}
                onChange={(e) => setExactHour(e.target.value)}
                className="w-full appearance-none px-3 py-2 pr-7 border border-[#1B1812]/20 rounded bg-transparent text-xs text-[#1B1812] focus:border-[#1B1812] focus:outline-hidden cursor-pointer font-medium"
              >
                {HOURS_PADDED.map((h) => (
                  <option key={h} value={h} className="bg-[#F6F3EC] text-[#1B1812]">
                    {h}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-[#1B1812]/50 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Minute Select [ 30 ▼ ] */}
            <div className="relative min-w-[68px] sm:min-w-[80px] flex-1">
              <select
                id="exact-time-minute"
                value={exactMinute}
                onChange={(e) => setExactMinute(e.target.value)}
                className="w-full appearance-none px-3 py-2 pr-7 border border-[#1B1812]/20 rounded bg-transparent text-xs text-[#1B1812] focus:border-[#1B1812] focus:outline-hidden cursor-pointer font-medium"
              >
                {MINUTES_EXPANDED.map((m) => (
                  <option key={m} value={m} className="bg-[#F6F3EC] text-[#1B1812]">
                    {m}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-[#1B1812]/50 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* AM / PM Select [ PM ▼ ] */}
            <div className="relative min-w-[68px] sm:min-w-[80px] flex-1">
              <select
                id="exact-time-period"
                value={exactPeriod}
                onChange={(e) => setExactPeriod(e.target.value as 'AM' | 'PM')}
                className="w-full appearance-none px-3 py-2 pr-7 border border-[#1B1812]/20 rounded bg-transparent text-xs text-[#1B1812] focus:border-[#1B1812] focus:outline-hidden cursor-pointer font-medium"
              >
                <option value="AM" className="bg-[#F6F3EC] text-[#1B1812]">AM</option>
                <option value="PM" className="bg-[#F6F3EC] text-[#1B1812]">PM</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-[#1B1812]/50 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </div>
      )}

      {timeMode === 'approximate' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 w-full">
          {/* Start time [ 03:00 PM ▼ ] */}
          <div className="min-w-0 w-full">
            <label className="block text-xs font-medium text-[#1B1812] mb-1">
              Start time
            </label>
            <div className="relative w-full">
              <select
                id="approx-start-time"
                value={approxStartTime}
                onChange={(e) => setApproxStartTime(e.target.value)}
                className="w-full appearance-none px-3 py-2 pr-7 border border-[#1B1812]/20 rounded bg-transparent text-xs text-[#1B1812] focus:border-[#1B1812] focus:outline-hidden cursor-pointer font-medium"
              >
                {TIME_SLOTS.map((t) => (
                  <option key={`start-${t}`} value={t} className="bg-[#F6F3EC] text-[#1B1812]">
                    {t}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-[#1B1812]/50 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* End time [ 04:00 PM ▼ ] */}
          <div className="min-w-0 w-full">
            <label className="block text-xs font-medium text-[#1B1812] mb-1">
              End time
            </label>
            <div className="relative w-full">
              <select
                id="approx-end-time"
                value={approxEndTime}
                onChange={(e) => setApproxEndTime(e.target.value)}
                className="w-full appearance-none px-3 py-2 pr-7 border border-[#1B1812]/20 rounded bg-transparent text-xs text-[#1B1812] focus:border-[#1B1812] focus:outline-hidden cursor-pointer font-medium"
              >
                {TIME_SLOTS.map((t) => (
                  <option key={`end-${t}`} value={t} className="bg-[#F6F3EC] text-[#1B1812]">
                    {t}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-[#1B1812]/50 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </div>
      )}

      {timeMode === 'unknown' && (
        <div className="p-3 rounded-lg border border-[#1B1812]/15 bg-[#1B1812]/[0.02] text-xs text-[#1B1812]/70 leading-relaxed w-full box-border">
          That&rsquo;s okay &mdash; location and other details can still help find a match.
        </div>
      )}
    </div>
  );
};

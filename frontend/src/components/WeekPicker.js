/**
 * WeekPicker.js
 *
 * A reusable calendar widget that lets the user pick any week (Mon–Sun).
 * Clicking a date highlights the entire week it belongs to.
 * Includes ← → arrows to jump prev/next week, and a "Today" button
 * to jump back to the current week.
 *
 * Props:
 *   selectedMonday  : string  'YYYY-MM-DD'  — currently selected Monday
 *   onChange        : (mondayStr: string) => void  — called when week changes
 *   accentColor     : string  — optional, defaults to '#00d4ff' (admin) or '#7b2fff' (user)
 */

import React, { useState } from 'react';

const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];
const DAY_LABELS  = ['Mo','Tu','We','Th','Fr','Sa','Su'];

/** Get YYYY-MM-DD string from a Date object */
function toISO(date) {
  // Local calendar date — toISOString() would shift dates back a day east of UTC (e.g. India)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Get the Monday of the week containing a given date */
function getMondayOf(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d;
}

/** Add N days to a Date (returns new Date) */
function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/** Get all days in the calendar grid for a given month view */
function buildCalendarGrid(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);

  // Start from Monday of the week containing the 1st
  const startDay = getMondayOf(firstDay);

  // End at Sunday of the week containing the last day
  const endRaw = new Date(lastDay);
  const endDow = endRaw.getDay();
  const daysToAdd = endDow === 0 ? 0 : 7 - endDow;
  const endDay = addDays(endRaw, daysToAdd);

  const days = [];
  let cur = new Date(startDay);
  while (cur <= endDay) {
    days.push(new Date(cur));
    cur = addDays(cur, 1);
  }
  return days;
}

export default function WeekPicker({ selectedMonday, onChange, accentColor = '#00d4ff' }) {
  // The calendar view month (independent of selected week — lets user browse freely)
  const initDate = selectedMonday ? new Date(selectedMonday + 'T00:00:00') : new Date();
  const [viewYear,  setViewYear]  = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initDate.getMonth());
  const [open, setOpen]           = useState(false);

  const todayISO   = toISO(new Date());
  const todayMonday = toISO(getMondayOf(new Date()));

  // The Sunday of the selected week
  const selectedSunday = selectedMonday
    ? toISO(addDays(new Date(selectedMonday + 'T00:00:00'), 6))
    : null;

  const days = buildCalendarGrid(viewYear, viewMonth);

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }

  function selectDay(date) {
    const monday = getMondayOf(date);
    onChange(toISO(monday));
    setOpen(false);
  }

  function prevWeek() {
    const cur = selectedMonday ? new Date(selectedMonday + 'T00:00:00') : getMondayOf(new Date());
    const prev = addDays(cur, -7);
    onChange(toISO(prev));
    setViewYear(prev.getFullYear());
    setViewMonth(prev.getMonth());
  }

  function nextWeek() {
    const cur = selectedMonday ? new Date(selectedMonday + 'T00:00:00') : getMondayOf(new Date());
    const next = addDays(cur, 7);
    onChange(toISO(next));
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  }

  function goToday() {
    onChange(todayMonday);
    const now = new Date();
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
    setOpen(false);
  }

  const isInSelectedWeek = (date) => {
    if (!selectedMonday || !selectedSunday) return false;
    const iso = toISO(date);
    return iso >= selectedMonday && iso <= selectedSunday;
  };

  const isMonday = (date) => date.getDay() === 1;
  const isSunday = (date) => date.getDay() === 0;

  const isToday = (date) => toISO(date) === todayISO;
  const isOtherMonth = (date) => date.getMonth() !== viewMonth;

  // Format the selected week for the trigger button label
  const triggerLabel = (() => {
    if (!selectedMonday) return 'Select Week';
    const mon = new Date(selectedMonday + 'T00:00:00');
    const sun = addDays(mon, 6);
    const fmt = d => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    return `${fmt(mon)} – ${fmt(sun)} ${sun.getFullYear()}`;
  })();

  const ac = accentColor;
  const acFaint = ac === '#00d4ff' ? 'rgba(0,212,255,' : 'rgba(123,47,255,';

  return (
    <div style={{ position: 'relative', userSelect: 'none' }}>

      {/* ── Controls Row: prev | trigger | next | today ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button onClick={prevWeek} style={arrowBtn(ac)} title="Previous week">‹</button>

        <button
          onClick={() => setOpen(o => !o)}
          style={{
            background: open ? `${acFaint}0.12)` : `${acFaint}0.06)`,
            border: `1px solid ${acFaint}0.3)`,
            color: ac, borderRadius: 5, padding: '6px 14px',
            cursor: 'pointer', fontSize: 12, fontFamily: "'Exo 2', sans-serif",
            fontWeight: 600, letterSpacing: 0.5, whiteSpace: 'nowrap',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <span>📅</span> {triggerLabel} <span style={{ fontSize: 9, opacity: 0.7 }}>{open ? '▲' : '▼'}</span>
        </button>

        <button onClick={nextWeek} style={arrowBtn(ac)} title="Next week">›</button>

        {selectedMonday !== todayMonday && (
          <button onClick={goToday} style={{
            background: 'none', border: `1px solid ${acFaint}0.2)`,
            color: `${acFaint}0.7)`, borderRadius: 4, padding: '5px 10px',
            cursor: 'pointer', fontSize: 10, fontFamily: "'Exo 2', sans-serif",
          }}>Today</button>
        )}
      </div>

      {/* ── Calendar Dropdown ── */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 999,
          background: '#0a1220', border: `1px solid ${acFaint}0.25)`,
          borderRadius: 8, padding: 16, minWidth: 280,
          boxShadow: `0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px ${acFaint}0.1)`,
        }}>

          {/* Month navigation */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
            <button onClick={prevMonth} style={arrowBtn(ac, 10)}>‹</button>
            <span style={{ color: '#e0f4ff', fontSize: 13, fontWeight: 600, fontFamily: "'Exo 2', sans-serif" }}>
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <button onClick={nextMonth} style={arrowBtn(ac, 10)}>›</button>
          </div>

          {/* Day-of-week headers */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2, marginBottom:4 }}>
            {DAY_LABELS.map(d => (
              <div key={d} style={{ textAlign:'center', fontSize:9, color:`${acFaint}0.5)`, fontWeight:600, letterSpacing:1, padding:'2px 0' }}>{d}</div>
            ))}
          </div>

          {/* Calendar days */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2 }}>
            {days.map((date, idx) => {
              const inWeek   = isInSelectedWeek(date);
              const isFirst  = inWeek && isMonday(date);
              const isLast   = inWeek && isSunday(date);
              const todayDay = isToday(date);
              const otherMo  = isOtherMonth(date);

              return (
                <button
                  key={idx}
                  onClick={() => selectDay(date)}
                  style={{
                    padding: '6px 2px',
                    border: 'none',
                    borderRadius: isFirst ? '4px 0 0 4px' : isLast ? '0 4px 4px 0' : inWeek ? 0 : 4,
                    background: inWeek
                      ? (isFirst || isLast ? ac : `${acFaint}0.15)`)
                      : 'transparent',
                    color: inWeek
                      ? (isFirst || isLast ? '#fff' : ac)
                      : otherMo ? `${acFaint}0.2)` : todayDay ? ac : '#a0c8d8',
                    fontSize: 11,
                    fontWeight: todayDay || inWeek ? 700 : 400,
                    cursor: 'pointer',
                    textAlign: 'center',
                    fontFamily: "'Exo 2', sans-serif",
                    outline: todayDay && !inWeek ? `1px solid ${acFaint}0.4)` : 'none',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => {
                    if (!inWeek) e.currentTarget.style.background = `${acFaint}0.08)`;
                  }}
                  onMouseLeave={e => {
                    if (!inWeek) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>

          {/* Quick-jump to current week */}
          <div style={{ marginTop: 12, borderTop: `1px solid ${acFaint}0.1)`, paddingTop: 10, display:'flex', justifyContent:'flex-end' }}>
            <button onClick={goToday} style={{
              background: `${acFaint}0.08)`, border: `1px solid ${acFaint}0.2)`,
              color: ac, borderRadius: 4, padding: '4px 12px',
              cursor: 'pointer', fontSize: 10, fontFamily: "'Exo 2', sans-serif",
            }}>
              Jump to Current Week
            </button>
          </div>
        </div>
      )}

      {/* Backdrop to close on outside click */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position:'fixed', inset:0, zIndex:998 }}
        />
      )}
    </div>
  );
}

function arrowBtn(ac, size = 13) {
  return {
    background: 'none',
    border: `1px solid ${ac === '#00d4ff' ? 'rgba(0,212,255,0.2)' : 'rgba(123,47,255,0.2)'}`,
    color: ac, borderRadius: 4, width: 28, height: 28,
    cursor: 'pointer', fontSize: size, display:'flex', alignItems:'center', justifyContent:'center',
    flexShrink: 0,
  };
}

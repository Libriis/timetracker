import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { BarChart3, CalendarDays, ListChecks, Monitor, Moon, PanelLeftClose, PanelLeftOpen, Pause, Play, Settings2, Sun, Timer, TrendingUp } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { timerElapsed } from '../../lib/billing.js';
import { formatClock } from '../../lib/format.js';
import { useNow } from '../../lib/useNow.js';
import { useMediaQuery, readUiPref, writeUiPref } from '../../lib/useMediaQuery.js';
import { ClientDot } from '../ui/Badge.jsx';
import { Tooltip } from '../ui/Tooltip.jsx';
import { SegmentedControl } from '../ui/SegmentedControl.jsx';
import { BrandMark } from './BrandMark.jsx';

// Navigation model. `id` is the ?view= name. Groups follow the pro-tracker convention TRACK / ANALYZE / MANAGE.
export const NAV = [
  { group: 'Track', items: [
    { id: 'track', label: 'Timer', icon: Timer },
    { id: 'calendar', label: 'Calendar', icon: CalendarDays },
    { id: 'log', label: 'Log', icon: ListChecks },
  ] },
  { group: 'Analyze', items: [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'insights', label: 'Insights', icon: TrendingUp },
  ] },
  { group: 'Manage', items: [
    { id: 'settings', label: 'Settings', icon: Settings2 },
  ] },
];

const COLLAPSE_KEY = 'tracker:ui:sidebarCollapsed';

export function Sidebar({ view, onNavigate, activeTimers, onPause, onResume, workspace, themePref, onThemeChange }) {
  const narrow = useMediaQuery('(max-width: 959px)');
  const [userCollapsed, setUserCollapsed] = useState(() => readUiPref(COLLAPSE_KEY, false) === true);
  const collapsed = narrow || userCollapsed;
  const reduce = useReducedMotion();
  const anyRunning = activeTimers.some(t => t.runningSince);
  const now = useNow(anyRunning);
  const running = activeTimers.find(t => t.runningSince);
  const runningCount = activeTimers.filter(t => t.runningSince).length;
  const toggle = () => { const next = !userCollapsed; setUserCollapsed(next); writeUiPref(COLLAPSE_KEY, next); };

  return (
    <nav aria-label="Main navigation"
      className={cn('relative z-20 flex h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-fg transition-[width] duration-slow ease-out', collapsed ? 'w-[64px]' : 'w-[232px]')}>
      {/* Brand */}
      <div className={cn('flex h-[60px] shrink-0 items-center gap-2.5', collapsed ? 'justify-center px-0' : 'px-4')}>
        <BrandMark />
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[14px] font-semibold tracking-[-0.01em] text-sidebar-fg">Time Tracker</div>
            <div className="truncate text-2xs text-sidebar-muted">{workspace || 'Studio workspace'}</div>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2.5 pb-3 pt-1">
        {NAV.map(section => (
          <div key={section.group} className="mt-3 first:mt-1">
            {collapsed
              ? <div className="mx-auto mb-1.5 mt-1 h-px w-6 bg-sidebar-border first:hidden" />
              : <div className="mb-1 px-2.5 text-2xs font-semibold uppercase tracking-[0.1em] text-sidebar-muted">{section.group}</div>}
            <ul className="flex flex-col gap-px">
              {section.items.map(item => {
                const active = view === item.id;
                const Icon = item.icon;
                const live = item.id === 'track' && running;
                const btn = (
                  <button type="button" data-nav={item.id} onClick={() => onNavigate(item.id)} aria-current={active ? 'page' : undefined}
                    className={cn(
                      'group relative flex h-9 w-full items-center gap-2.5 rounded-lg text-[13.5px] font-medium outline-none transition-colors duration-fast ease-out',
                      'focus-visible:ring-2 focus-visible:ring-ring/50',
                      collapsed ? 'justify-center px-0' : 'px-2.5',
                      active ? 'text-sidebar-fg' : 'text-sidebar-muted hover:bg-sidebar-hover/[0.05] hover:text-sidebar-fg',
                    )}>
                    {active && (
                      <motion.span layoutId="nav-active" aria-hidden
                        transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 42 }}
                        className="absolute inset-0 rounded-lg border border-line bg-surface shadow-sm dark:border-white/[0.06] dark:bg-white/[0.06] dark:shadow-none" />
                    )}
                    <span className="relative flex">
                      <Icon className="size-[18px]" strokeWidth={active ? 2.1 : 1.9} />
                      {live && collapsed && <span className="absolute -right-1 -top-1 size-2 rounded-full bg-brand ring-2 ring-sidebar animate-pulse-dot" />}
                    </span>
                    {!collapsed && <span className="relative min-w-0 flex-1 truncate text-left">{item.label}</span>}
                    {/* A live marker only: the clocks themselves live on the timer cards and in RUNNING below. */}
                    {!collapsed && live && (
                      <span className="relative flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.06em] text-brand-text">
                        <span aria-hidden className="size-1.5 rounded-full bg-brand animate-pulse-dot" />
                        Live<span className="sr-only">: {runningCount} running</span>
                      </span>
                    )}
                  </button>
                );
                return <li key={item.id}>{collapsed ? <Tooltip content={item.label} side="right">{btn}</Tooltip> : btn}</li>;
              })}
            </ul>
          </div>
        ))}

        {/* The Timer page shows the same timers as cards, so the list only appears on other pages. */}
        {!collapsed && activeTimers.length > 0 && view !== 'track' && (
          <div className="mt-5">
            <div className="mb-1 flex items-center justify-between px-2.5">
              <span className="text-2xs font-semibold uppercase tracking-[0.1em] text-sidebar-muted">Running</span>
              <span className="text-2xs font-medium text-sidebar-muted tnum">{activeTimers.length}</span>
            </div>
            <ul className="flex flex-col gap-px">
              {activeTimers.map(t => {
                const isRunning = !!t.runningSince;
                return (
                  <li key={t.id} className="group flex h-9 items-center gap-1 rounded-lg pr-1 hover:bg-sidebar-hover/[0.05]">
                    <button type="button" onClick={() => onNavigate('track')} title={`${t.client} · ${t.task}`}
                      aria-label={`${t.client}, ${isRunning ? 'running' : 'paused'}, ${formatClock(timerElapsed(t, now))}. Open the timer page.`}
                      className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-lg pl-2.5 pr-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60">
                      <ClientDot client={t.client} size={7} className={cn(!isRunning && 'opacity-50')} />
                      <span className={cn('min-w-0 flex-1 truncate text-[13px]', isRunning ? 'text-sidebar-fg' : 'text-sidebar-muted')}>{t.client}</span>
                      <span aria-hidden className={cn('text-xs tnum', isRunning ? 'font-semibold text-sidebar-fg' : 'text-sidebar-muted')}>{formatClock(timerElapsed(t, now))}</span>
                    </button>
                    <Tooltip content={isRunning ? 'Pause' : 'Resume'} side="right">
                      <button type="button" aria-label={isRunning ? 'Pause timer' : 'Resume timer'} onClick={() => (isRunning ? onPause(t.id) : onResume(t.id))}
                        className={cn('grid size-7 shrink-0 place-items-center rounded-md outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50',
                          isRunning ? 'text-sidebar-muted hover:bg-sidebar-hover/[0.08] hover:text-sidebar-fg' : 'text-brand-text hover:bg-brand/10')}>
                        {isRunning ? <Pause className="size-3.5" fill="currentColor" strokeWidth={0} /> : <Play className="size-3.5" fill="currentColor" strokeWidth={0} />}
                      </button>
                    </Tooltip>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* Footer: theme + collapse */}
      <div className={cn('flex shrink-0 items-center gap-2 border-t border-sidebar-border py-3', collapsed ? 'flex-col px-0' : 'px-3')}>
        {collapsed ? (
          <Tooltip content={`Theme: ${themePref}`} side="right">
            <button type="button" aria-label="Switch theme"
              onClick={() => onThemeChange(themePref === 'system' ? 'light' : themePref === 'light' ? 'dark' : 'system')}
              className="grid size-8 place-items-center rounded-lg text-sidebar-muted hover:bg-sidebar-hover/[0.06] hover:text-sidebar-fg">
              {themePref === 'dark' ? <Moon className="size-4" /> : themePref === 'light' ? <Sun className="size-4" /> : <Monitor className="size-4" />}
            </button>
          </Tooltip>
        ) : (
          <SegmentedControl size="sm" label="Theme" value={themePref} onChange={onThemeChange} className="flex-1" fullWidth
            options={[
              { value: 'system', icon: <Monitor />, ariaLabel: 'Use system theme' },
              { value: 'light', icon: <Sun />, ariaLabel: 'Light theme' },
              { value: 'dark', icon: <Moon />, ariaLabel: 'Dark theme' },
            ]} />
        )}
        {!narrow && (
          <Tooltip content={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} side="right">
            <button type="button" onClick={toggle} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="grid size-8 shrink-0 place-items-center rounded-lg text-sidebar-muted outline-none transition-colors hover:bg-sidebar-hover/[0.06] hover:text-sidebar-fg focus-visible:ring-2 focus-visible:ring-ring/50">
              {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            </button>
          </Tooltip>
        )}
      </div>
    </nav>
  );
}

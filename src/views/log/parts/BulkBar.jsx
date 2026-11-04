import { Check, ChevronDown, CheckCheck, Sparkles, Tag, Trash2, Undo2, UserRound, X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { AI_FACTOR } from '../../../lib/billing.js';
import { formatClock, formatEUR } from '../../../lib/format.js';
import { AI_FACTOR_PRESETS } from '../../../components/ui/AiFactorPicker.jsx';
import { ClientDot } from '../../../components/ui/Badge.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '../../../components/ui/DropdownMenu.jsx';
import { Kbd } from '../../../components/ui/Kbd.jsx';
import { Tooltip } from '../../../components/ui/Tooltip.jsx';

const Divider = () => <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-line" />;

// Floating bar for the selected entries: bill them, move them, or delete them.
// AI factor (shown when the selection holds AI entries): set the factor of those AI entries only.
// aiCurrent: their shared own factor (null = all on Default), undefined when they differ.
export function BulkBar({ count, ms, net, anyInvoiced, anyUnbilled, clients, activities, onInvoiced, onSetClient, onSetActivity, onDelete, onClear, aiCount = 0, aiCurrent, onSetAiFactor }) {
  const reduce = useReducedMotion();
  return (
    <motion.div role="toolbar" aria-label={`${count} selected entries`}
      initial={reduce ? false : { opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reduce ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 520, damping: 40, mass: 0.7 }}
      className="pointer-events-auto flex max-w-full flex-wrap items-center gap-1 rounded-2xl border border-line-strong/70 bg-surface-raised p-1.5 pl-2.5 shadow-xl">
      <div className="flex items-center gap-2 pr-1 text-sm">
        <span className="grid h-6 min-w-6 place-items-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-fg tnum">{count}</span>
        <span className="font-medium text-fg">selected</span>
        <span className="hidden whitespace-nowrap text-fg-subtle tnum sm:inline">{formatClock(ms)} · {formatEUR(net)}</span>
      </div>
      <Divider />
      {/* A double click counts once (the second click would land on the button that takes its place). */}
      {anyUnbilled && <Button variant="ghost" size="sm" onClick={(ev) => { if (ev.detail <= 1) onInvoiced(true); }}><CheckCheck />Mark invoiced</Button>}
      {anyInvoiced && <Button variant="ghost" size="sm" onClick={(ev) => { if (ev.detail <= 1) onInvoiced(false); }}><Undo2 />Mark unbilled</Button>}
      {onSetClient && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm"><UserRound />Client<ChevronDown className="!size-3.5 opacity-60" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" side="top" className="max-h-72 overflow-y-auto">
            <DropdownMenuLabel>Move to client</DropdownMenuLabel>
            {clients.map(c => (
              <DropdownMenuItem key={c} onSelect={() => onSetClient(c)}><ClientDot client={c} />{c}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {onSetActivity && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm"><Tag />Activity<ChevronDown className="!size-3.5 opacity-60" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" side="top" className="max-h-72 overflow-y-auto">
            <DropdownMenuLabel>Change activity to</DropdownMenuLabel>
            {activities.map(t => (
              <DropdownMenuItem key={t} onSelect={() => onSetActivity(t)}>{t}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {onSetAiFactor && aiCount > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm"><Sparkles />AI factor<ChevronDown className="!size-3.5 opacity-60" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" side="top">
            <DropdownMenuLabel>{aiCount === 1 ? 'The selected AI entry' : `The ${aiCount} selected AI entries`}</DropdownMenuLabel>
            {[null, ...AI_FACTOR_PRESETS].map(f => (
              <DropdownMenuItem key={f ?? 'default'} onSelect={() => onSetAiFactor(f)} className="tnum">
                {f == null ? <>Default <span className="text-fg-subtle">(×{AI_FACTOR})</span></> : `×${f}`}
                {aiCurrent === f && <Check className="ml-auto !text-fg" aria-label="Current" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {onDelete && <Button variant="danger-ghost" size="sm" onClick={onDelete}><Trash2 />Delete</Button>}
      <Divider />
      <Tooltip content={<span className="flex items-center gap-1.5">Clear selection <Kbd className="h-4 border-canvas/30 bg-transparent text-canvas/70">Esc</Kbd></span>}>
        <Button variant="ghost" size="icon-sm" aria-label="Clear selection" onClick={onClear}><X /></Button>
      </Tooltip>
    </motion.div>
  );
}

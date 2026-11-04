import { useMemo, useState } from 'react';
import { AI_FACTOR } from '../../../lib/billing.js';
import { flexRender, getCoreRowModel, getExpandedRowModel, getSortedRowModel, useReactTable } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronRight, Gift, Sparkles } from 'lucide-react';
import { cn } from '../../../lib/cn.js';
import { formatEUR, formatHM } from '../../../lib/format.js';
import { Badge } from '../../../components/ui/Badge.jsx';
import { Tooltip } from '../../../components/ui/Tooltip.jsx';
import { useWidth } from './useWidth.js';

// Expandable, sortable breakdown (ported from the 21st.dev "Expanding Sub-Rows Table",
// TanStack Table): group → sub-group → note, with time, money and effective rate per row.
// rows: tree nodes from buildTree(). total: { ms, billableMs, net, gross }.
// The layout follows the card's own width: a wide card gets one column per figure; a narrow
// card (the app's 720–1180 px windows) stacks billable under tracked and gross under net, so
// every figure stays visible and the name column keeps the free width.

const num = 'text-right tnum whitespace-nowrap';
const KIND_NAME = { client: 'client', project: 'project', task: 'activity', note: 'note' };
const COMPACT_BELOW = 880;

function SortHead({ column, children, className }) {
  const s = column.getIsSorted();
  return (
    <button type="button" onClick={column.getToggleSortingHandler()}
      className={cn('group inline-flex items-center gap-1 rounded uppercase tracking-[0.08em] outline-none transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-ring/60', s && 'text-fg', className)}>
      {children}
      <span aria-hidden className={cn('flex w-3 [&_svg]:size-3', !s && 'opacity-0 group-hover:opacity-50')}>
        {s === 'asc' ? <ArrowUp /> : <ArrowDown />}
      </span>
    </button>
  );
}

const vatHint = (r) => (r.vatPct != null
  ? `Net ${formatEUR(r.net)} + ${r.vatPct}% VAT ${formatEUR(r.vat)} = ${formatEUR(r.gross)}`
  : `Net ${formatEUR(r.net)} + VAT ${formatEUR(r.vat)} = ${formatEUR(r.gross)} (clients with different VAT rates)`);

export function BreakdownTable({ rows, total, groupBy, roundingOf, vatBadgeOf, initiallyOpen = true }) {
  const [wrapRef, width] = useWidth();
  const compact = width > 0 && width < COMPACT_BELOW;
  const [sorting, setSorting] = useState([{ id: 'net', desc: true }]);
  const [expanded, setExpanded] = useState(() => (initiallyOpen ? Object.fromEntries(rows.map(r => [r.id, true])) : {}));
  const shareBase = total.net > 0 ? total.net : 0;
  const shareOf = (r) => (shareBase > 0 ? r.net / shareBase : total.ms > 0 ? r.ms / total.ms : 0);

  const columns = useMemo(() => {
    const name = {
      id: 'name', accessorFn: r => r.label, sortingFn: 'alphanumeric',
      header: ({ column }) => <SortHead column={column}>{{ client: 'Client', project: 'Project', activity: 'Activity' }[groupBy]}</SortHead>,
      cell: ({ row }) => {
        const r = row.original;
        const canExpand = row.getCanExpand();
        const open = row.getIsExpanded();
        const depth = row.depth;
        const vatBadge = depth === 0 && groupBy === 'client' ? vatBadgeOf?.(r.client) : null;
        const rounding = depth === 0 && groupBy === 'client' ? roundingOf?.(r.client) : 0;
        const label = (
          <span title={r.label} className={cn('min-w-0 truncate', depth === 0 ? 'font-semibold text-fg' : depth === 1 ? 'font-medium text-fg' : 'text-fg-muted',
            r.kind === 'project' && !r.project && 'font-medium italic text-fg-muted')}>{r.label}</span>
        );
        const clientSub = depth === 0 && groupBy === 'project'
          ? <span title={r.client} className="min-w-0 max-w-full shrink-0 truncate text-xs text-fg-subtle">{r.client}</span> : null;
        const badges = [
          rounding > 0 && <Badge key="r" variant="outline">{rounding}-min rounding</Badge>,
          // 0 % is a real rate (reverse charge): test for a value, not for truthiness.
          vatBadge != null && (
            <Tooltip key="v" content={`${r.client} is billed at ${vatBadge}% VAT`}>
              <span className="inline-flex shrink-0"><Badge variant="outline">VAT {vatBadge}%</Badge></span>
            </Tooltip>
          ),
          r.freeCount > 0 && depth < 2 && (
            <Tooltip key="f" content={`${r.freeCount} complimentary ${r.freeCount === 1 ? 'session' : 'sessions'}, ${formatEUR(r.freeValue)} standard value`}>
              <span className="inline-flex shrink-0"><Badge variant="free"><Gift />{r.freeCount} free</Badge></span>
            </Tooltip>
          ),
          r.aiCount > 0 && depth === 0 && (
            <Tooltip key="a" content={`${r.aiCount} AI-assisted ${r.aiCount === 1 ? 'session' : 'sessions'}, billed at ×${AI_FACTOR}`}>
              <span className="inline-flex shrink-0" aria-label={`${r.aiCount} AI-assisted`}><Badge variant="ai"><Sparkles />{r.aiCount}{compact ? '' : ' AI'}</Badge></span>
            </Tooltip>
          ),
        ].filter(Boolean);
        const dot = depth < 2 ? depth ? 6 : 8 : 0;
        // The name gets the whole first line; client and badges sit on a line below it, so badges
        // never cut a name short.
        return (
          <div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: depth * 22 }} data-depth={depth}>
            {canExpand ? (
              <button type="button" onClick={row.getToggleExpandedHandler()} aria-expanded={open}
                aria-label={`${open ? 'Collapse' : 'Expand'} ${r.label}`}
                className="-ml-1 grid size-6 shrink-0 place-items-center rounded-md text-fg-subtle outline-none transition-colors hover:bg-fg/[0.06] hover:text-fg focus-visible:ring-2 focus-visible:ring-ring/60">
                <ChevronRight className={cn('size-4 transition-transform duration-base ease-out', open && 'rotate-90')} />
              </button>
            ) : <span className="-ml-1 size-6 shrink-0" />}
            <div className="min-w-0 flex-1 leading-tight">
              <div className="flex min-w-0 items-center gap-2">
                {dot > 0 && (
                  <span aria-hidden className="shrink-0 rounded-full"
                    style={{ width: dot, height: dot, background: depth === 0 ? r.color : r.kind === 'client' ? r.color : 'rgb(var(--fg-subtle))' }} />
                )}
                {label}
              </div>
              {(clientSub || badges.length > 0) && (
                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5" style={{ paddingLeft: dot ? dot + 8 : 0 }}>{clientSub}{badges}</div>
              )}
            </div>
          </div>
        );
      },
    };
    const netCls = (row, v) => cn(row.depth === 0 ? 'font-semibold text-fg' : 'font-medium text-fg', v === 0 && 'font-normal text-fg-subtle');
    const rate = {
      id: 'rate', accessorFn: r => r.rate, sortDescFirst: true,
      header: ({ column }) => <SortHead column={column} className="normal-case tracking-normal">€/h</SortHead>,
      cell: ({ getValue }) => <span className="text-fg-muted">{getValue() > 0 ? formatEUR(getValue()) : '–'}</span>,
    };
    const share = {
      id: 'share', accessorFn: r => shareOf(r), sortDescFirst: true,
      header: ({ column }) => (compact
        ? <SortHead column={column}><span aria-hidden>%</span><span className="sr-only">Share</span></SortHead>
        : <SortHead column={column}>Share</SortHead>),
      cell: ({ getValue, row }) => {
        const p = getValue() * 100;
        return (
          <div className="flex items-center justify-end gap-2.5">
            {row.depth === 0 && !compact && (
              <span aria-hidden className="block h-1.5 w-16 overflow-hidden rounded-full bg-fg/[0.07]">
                <span className="block h-full rounded-full" style={{ width: `${Math.min(100, p)}%`, background: row.original.color }} />
              </span>
            )}
            <span className="w-9 text-right text-fg-subtle">{p > 0 && p < 1 ? '<1' : Math.round(p)}%</span>
          </div>
        );
      },
    };
    if (compact) {
      return [
        name,
        {
          id: 'ms', accessorFn: r => r.ms, sortDescFirst: true,
          header: ({ column }) => <SortHead column={column}>Tracked</SortHead>,
          cell: ({ getValue, row }) => (
            <div className="leading-tight">
              <div className="text-fg">{formatHM(getValue())}</div>
              <div className="mt-0.5 text-2xs text-fg-subtle">{formatHM(row.original.billableMs)} billable</div>
            </div>
          ),
        },
        {
          id: 'net', accessorFn: r => r.net, sortDescFirst: true,
          header: ({ column }) => <SortHead column={column}>Net</SortHead>,
          cell: ({ getValue, row }) => (
            <Tooltip content={vatHint(row.original)} side="left">
              <div className="leading-tight">
                <div className={netCls(row, getValue())}>{formatEUR(getValue())}</div>
                <div className="mt-0.5 text-2xs font-normal text-fg-subtle">{formatEUR(row.original.gross)} incl. VAT</div>
              </div>
            </Tooltip>
          ),
        },
        rate,
        share,
      ];
    }
    return [
      name,
      {
        id: 'ms', accessorFn: r => r.ms, sortDescFirst: true,
        header: ({ column }) => <SortHead column={column}>Tracked</SortHead>,
        cell: ({ getValue }) => formatHM(getValue()),
      },
      {
        id: 'billableMs', accessorFn: r => r.billableMs, sortDescFirst: true,
        header: ({ column }) => <SortHead column={column}>Billable</SortHead>,
        cell: ({ getValue }) => <span className={cn(getValue() === 0 && 'text-fg-subtle')}>{formatHM(getValue())}</span>,
      },
      {
        id: 'net', accessorFn: r => r.net, sortDescFirst: true,
        header: ({ column }) => <SortHead column={column}>Net</SortHead>,
        cell: ({ getValue, row }) => <span className={netCls(row, getValue())}>{formatEUR(getValue())}</span>,
      },
      {
        id: 'gross', accessorFn: r => r.gross, sortDescFirst: true,
        header: ({ column }) => <SortHead column={column}>Incl. VAT</SortHead>,
        cell: ({ getValue, row }) => (
          <Tooltip content={vatHint(row.original)} side="left">
            <span className="text-fg-muted">{formatEUR(getValue())}</span>
          </Tooltip>
        ),
      },
      rate,
      share,
    ];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupBy, shareBase, total.ms, roundingOf, vatBadgeOf, compact]);

  const table = useReactTable({
    data: rows, columns,
    state: { sorting, expanded },
    onSortingChange: setSorting,
    onExpandedChange: setExpanded,
    getRowId: (r) => r.id,
    getSubRows: (r) => r.subRows,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  });

  const visible = table.getRowModel().rows;
  const totalRate = total.ms > 0 && total.net > 0 ? formatEUR(total.net / (total.ms / 3600000)) : '–';
  const pad = compact ? 'px-2' : 'px-3';
  return (
    <div ref={wrapRef} className="overflow-x-auto">
      <table className="w-full min-w-[520px] table-fixed border-collapse text-sm">
        <colgroup>
          <col />
          {compact ? (
            <><col className="w-[100px]" /><col className="w-[130px]" /><col className="w-[70px]" /><col className="w-[60px]" /></>
          ) : (
            <><col className="w-[92px]" /><col className="w-[92px]" /><col className="w-[116px]" /><col className="w-[116px]" /><col className="w-[84px]" /><col className="w-[144px]" /></>
          )}
        </colgroup>
        <thead>
          {table.getHeaderGroups().map(hg => (
            <tr key={hg.id} className="border-y border-line bg-surface-2/60">
              {hg.headers.map((h, i) => (
                <th key={h.id} scope="col" aria-sort={h.column.getIsSorted() ? (h.column.getIsSorted() === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={cn('h-9 text-2xs font-semibold uppercase tracking-[0.08em] text-fg-subtle first:pl-5 last:pr-5', i === 0 ? 'pr-3' : pad,
                    i === 0 ? 'text-left' : 'text-right [&>button]:flex-row-reverse')}>
                  {flexRender(h.column.columnDef.header, h.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {visible.map(row => (
            <tr key={row.id}
              onClick={(ev) => { if (row.getCanExpand() && !ev.target.closest('button')) row.toggleExpanded(); }}
              className={cn('border-b border-line transition-colors duration-fast hover:bg-fg/[0.025]',
                row.getCanExpand() && 'cursor-pointer',
                row.depth === 0 ? 'h-14' : row.depth === 1 ? (compact ? 'h-12 bg-surface-2/40' : 'h-11 bg-surface-2/40') : (compact ? 'h-11 bg-surface-2/40 text-xs' : 'h-9 bg-surface-2/40 text-xs'))}>
              {row.getVisibleCells().map(c => (
                <td key={c.id} className={cn('first:pl-5 last:pr-5', c.column.id === 'name' ? 'overflow-hidden pr-3' : cn(num, pad))}>
                  {flexRender(c.column.columnDef.cell, c.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          {compact ? (
            <tr className="h-14 font-semibold text-fg">
              <td className="pl-5 pr-3"><span className="pl-[30px]">Total</span></td>
              <td className={cn('px-2 leading-tight', num)}>
                <div>{formatHM(total.ms)}</div>
                <div className="mt-0.5 text-2xs font-normal text-fg-subtle">{formatHM(total.billableMs)} billable</div>
              </td>
              <td className={cn('px-2 leading-tight', num)}>
                <div>{formatEUR(total.net)}</div>
                <div className="mt-0.5 text-2xs font-normal text-fg-subtle">{formatEUR(total.gross)} incl. VAT</div>
              </td>
              <td className={cn('px-2', num, 'font-medium text-fg-muted')}>{totalRate}</td>
              <td className={cn('pl-2 pr-5', num, 'font-medium text-fg-subtle')}>100%</td>
            </tr>
          ) : (
            <tr className="h-11 font-semibold text-fg">
              <td className="pl-5 pr-3"><span className="pl-[30px]">Total</span></td>
              <td className={cn('px-3', num)}>{formatHM(total.ms)}</td>
              <td className={cn('px-3', num)}>{formatHM(total.billableMs)}</td>
              <td className={cn('px-3', num)}>{formatEUR(total.net)}</td>
              <td className={cn('px-3', num, 'font-medium text-fg-muted')}>{formatEUR(total.gross)}</td>
              <td className={cn('px-3', num, 'font-medium text-fg-muted')}>{totalRate}</td>
              <td className={cn('pl-3 pr-5', num, 'font-medium text-fg-subtle')}>100%</td>
            </tr>
          )}
        </tfoot>
      </table>
      <p className="sr-only">{`Rows are grouped by ${groupBy}. Expand a ${KIND_NAME[groupBy === 'activity' ? 'task' : groupBy]} to see the breakdown below it.`}</p>
    </div>
  );
}

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AI_FACTOR } from '../../lib/billing.js';
import { BarChart3, ChevronDown, Download, FileText, Gift } from 'lucide-react';
import { clientColor } from '../../lib/colors.js';
import { formatEUR, formatHM, formatHoursNum, isoDay } from '../../lib/format.js';
import { readUiPref, writeUiPref } from '../../lib/useMediaQuery.js';
import { DateRangePicker, formatRange, PRESETS } from '../../components/ui/DateRangePicker.jsx';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '../../components/ui/DropdownMenu.jsx';
import { Page, PageHeader } from '../../components/shell/PageHeader.jsx';
import { ActivityFilter } from '../../components/ui/ActivityFilter.jsx';
import { ClientDot } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { SegmentedControl } from '../../components/ui/SegmentedControl.jsx';
import { Select } from '../../components/ui/Select.jsx';
import { Amount } from '../../components/ui/Stat.jsx';
import { Tooltip } from '../../components/ui/Tooltip.jsx';
import { BreakdownTable } from './parts/BreakdownTable.jsx';
import { KpiStrip } from './parts/KpiStrip.jsx';
import { SplitDonut } from './parts/SplitDonut.jsx';
import { TimeChart } from './parts/TimeChart.jsx';
import { useSepSpelling } from './parts/useSepSpelling.js';
import {
  buildBuckets, buildTree, change, entryMoney, eurAxis, freeValueOf, HOUR, isUnbilled, matchesFilters, netByClient, periodWindow, previousWindow, stretchLabel, summarize,
} from './reportData.js';

// UI preferences (never in backups).
const K = {
  range: 'tracker:ui:reports:range',
  measure: 'tracker:ui:reports:measure',
  stack: 'tracker:ui:reports:stack',
  groupBy: 'tracker:ui:reports:groupBy',
};
const RELATIVE = ['yesterday', 'lastWeek', 'lastMonth', 'last7', 'last30'];
const DEFAULT_RANGE = { preset: 'last30' };
// The saved range is applied once per app start, the first time the Dashboard opens.
let rangeRestored = false;

const GROUPS = [{ value: 'client', label: 'Client' }, { value: 'project', label: 'Project' }, { value: 'activity', label: 'Activity' }];
// Unbilled work is the bulk of most bars, so it gets the calm graphite of the Insights bars (the
// unbilled amber stays a small marker, as the design contract says); invoiced and free stand out.
const STATUS = [
  { key: 'invoiced', label: 'Invoiced', color: 'rgb(var(--invoiced))' },
  { key: 'unbilled', label: 'Unbilled', color: 'rgb(var(--fg) / 0.8)' },
  { key: 'free', label: 'Complimentary', color: 'rgb(var(--free))' },
];
const UNIT_WORD = { day: 'day', week: 'week', month: 'month' };
const MAX_STACK = 4;
const REST = '__rest';

export function Dashboard({ period, setPeriod, customStart, setCustomStart, customEnd, setCustomEnd, filterClient, setFilterClient, filterBilled, setFilterBilled, activityOptions, excludedTasks, setExcludedTasks, clients, totalMs, totalBillableMs, totalEarnings, totalGross, complimentaryCount, byClient, filteredCount, filteredEntries = [], allEntries, rates, clientRates, rounding, clientRounding, onExport, onExportPDF }) {
  const [measure, setMeasureState] = useState(() => (readUiPref(K.measure, 'hours') === 'money' ? 'money' : 'hours'));
  // Billing status is the default stack: two or three calm colors read at a glance; by client is one click away.
  const [stack, setStackState] = useState(() => (readUiPref(K.stack, 'status') === 'client' ? 'client' : 'status'));
  const pickerRef = useRef(null);
  useSepSpelling(pickerRef);
  const [groupBy, setGroupByState] = useState(() => { const g = readUiPref(K.groupBy, 'client'); return GROUPS.some(x => x.value === g) ? g : 'client'; });
  const setMeasure = (v) => { setMeasureState(v); writeUiPref(K.measure, v); };
  const setStack = (v) => { setStackState(v); writeUiPref(K.stack, v); };
  const setGroupBy = (v) => { setGroupByState(v); writeUiPref(K.groupBy, v); };
  const [pendingInvoice, setPendingInvoice] = useState(null);

  // ---- date range: one control, remembered between sessions ----
  const applyRange = (saved) => {
    const now = new Date();
    if (saved?.preset && PRESETS[saved.preset]) {
      const p = PRESETS[saved.preset];
      if (p.named) { setPeriod(saved.preset); return; }
      const r = p.range(now);
      setCustomStart(isoDay(r.from)); setCustomEnd(isoDay(r.to)); setPeriod('custom');
    } else if (saved?.from) {
      setCustomStart(saved.from); setCustomEnd(saved.to || ''); setPeriod('custom');
    }
  };
  useLayoutEffect(() => {
    if (rangeRestored) return;
    rangeRestored = true;
    applyRange(readUiPref(K.range, null) || DEFAULT_RANGE);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const onRange = ({ period: p, from, to }) => {
    if (p === 'custom') { setCustomStart(from); setCustomEnd(to); }
    setPeriod(p);
    let saved = { preset: p };
    if (p === 'custom') {
      const now = new Date();
      const rel = RELATIVE.find(id => { const r = PRESETS[id].range(now); return isoDay(r.from) === from && isoDay(r.to) === to; });
      saved = rel ? { preset: rel } : { from, to };
    }
    writeUiPref(K.range, saved);
  };

  const cfg = useMemo(() => ({ rates, clientRates, rounding, clientRounding }), [rates, clientRates, rounding, clientRounding]);
  const vatOf = (c) => byClient[c]?.vat ?? 0;
  // Only a client's own rounding is worth a badge; the studio default is explained under the table.
  const roundingOf = (c) => { const r = byClient[c]?.rounding ?? 0; return r !== rounding ? r : 0; };
  // The usual VAT rate is the one most clients in view share; others get a badge and a footnote.
  const vatInfo = useMemo(() => {
    const count = {};
    Object.values(byClient).forEach(d => { count[d.vat] = (count[d.vat] || 0) + 1; });
    const usual = Object.keys(count).map(Number).sort((a, b) => count[b] - count[a] || b - a)[0] ?? 0;
    const others = Object.entries(byClient).filter(([, d]) => d.vat !== usual).map(([c, d]) => `${c} ${d.vat}%`);
    return { usual, others };
  }, [byClient]);
  const vatBadgeOf = useCallback((c) => { const v = byClient[c]?.vat; return v != null && v !== vatInfo.usual ? v : null; }, [byClient, vatInfo]);

  const win = useMemo(() => periodWindow(period, customStart, customEnd, filteredEntries), [period, customStart, customEnd, filteredEntries]);
  // en-GB spells September "Sept"; the axes, compare labels and Insights say "Sep".
  const rangeText = period === 'all' ? 'All time' : formatRange({ from: win.from, to: win.to }).replace(/\bSept\b/g, 'Sep');

  // ---- comparison with the stretch before (like for like) ----
  // Both sides are cut at the same moment: when the period runs past now, the earlier stretch stops
  // at the same point (3 Nov 15:35 -> 3 Oct 15:35) and so does the current side, so work dated
  // later (typed ahead) never makes the change look bigger. The tiles still show the full period.
  const cmp = useMemo(() => { const now = new Date(); return { win: previousWindow(period, win, now), now: now.getTime() }; }, [period, win]);
  const prevWin = cmp.win;
  const prev = useMemo(() => {
    if (!prevWin || !allEntries) return null;
    const f = { filterClient, filterBilled, excludedTasks };
    return summarize(allEntries.filter(e => e.start >= prevWin.from && e.start < prevWin.end && matchesFilters(e, f)), cfg);
  }, [prevWin, allEntries, filterClient, filterBilled, excludedTasks, cfg]);
  const cur = useMemo(() => summarize(filteredEntries, cfg), [filteredEntries, cfg]);
  const cutAt = prevWin?.partial ? cmp.now : Infinity;
  const curCmp = useMemo(() => (cutAt === Infinity ? cur : summarize(filteredEntries.filter(e => e.start <= cutAt), cfg)), [cur, cutAt, filteredEntries, cfg]);
  const laterCount = prev ? cur.count - curCmp.count : 0;
  const prevLabel = prevWin ? stretchLabel(prevWin.from, prevWin.end) : '';
  const rate = totalMs > 0 ? totalEarnings / (totalMs / HOUR) : 0;
  // A change pill needs something on at least one side; "New" when only the current stretch has work.
  const was = (fmt, curV, prevV, curFmt) => (prev && (curV > 0 || prevV > 0)
    ? `${laterCount > 0 ? `Up to now ${curFmt}, against ` : ''}${fmt} on ${prevLabel}` : undefined);

  // ---- unbilled, ready to invoice (money per client from billingTotals) ----
  const unbilledByClient = useMemo(() => {
    const list = filteredEntries.filter(e => isUnbilled(e, cfg));
    const nets = netByClient(list, cfg);
    const m = {};
    for (const e of list) { if (!m[e.client]) m[e.client] = { net: nets[e.client] || 0, count: 0 }; m[e.client].count += 1; }
    return Object.entries(m).sort((a, b) => b[1].net - a[1].net || a[0].localeCompare(b[0]));
  }, [filteredEntries, cfg]);
  // Net per client in the period for the PDF menu, from the same rule as the totals.
  const netPerClient = useMemo(() => netByClient(filteredEntries, cfg), [filteredEntries, cfg]);
  const startInvoice = (client) => {
    if (filterBilled === 'unbilled' && filterClient === client) { onExportPDF(client); return; }
    setFilterBilled('unbilled'); setFilterClient(client); setPendingInvoice(client);
  };
  // Open the PDF dialog once the filters show exactly the unbilled work of that client.
  useEffect(() => {
    if (!pendingInvoice) return;
    if (filterBilled === 'unbilled' && filterClient === pendingInvoice) { setPendingInvoice(null); onExportPDF(pendingInvoice); }
  }, [pendingInvoice, filterBilled, filterClient, onExportPDF]);

  // ---- chart ----
  // Clients beyond the top four fold into one grey "N more" segment, so every color stays readable.
  // The tooltip and the screen-reader table still list every client.
  const chart = useMemo(() => {
    const { unit, buckets, keyOf } = buildBuckets(win);
    const index = new Map(buckets.map((b, i) => [b.key, i]));
    const rows = buckets.map(b => ({ ...b }));
    const totals = {};
    // Money adds up in whole cents (each entry's net is already cents), so a bar, its tooltip and
    // the totals agree with billingTotals to the cent; hours stay as they are.
    const money = measure === 'money';
    // Client series keys carry a prefix, so a client called "label" or "today" never overwrites a bucket field.
    const keyFor = (e) => (stack === 'status' ? (e.free ? 'free' : e.invoiced ? 'invoiced' : 'unbilled') : `c:${e.client}`);
    for (const e of filteredEntries) {
      const i = index.get(keyOf(e.start));
      if (i == null) continue;
      const v = money ? Math.round(entryMoney(e, cfg).net * 100) : e.duration / HOUR;
      const k = keyFor(e);
      rows[i][k] = (rows[i][k] || 0) + v;
      totals[k] = (totals[k] || 0) + v;
    }
    const keys = Object.keys(totals);
    const finish = (extra = []) => {
      if (money) {
        const all = [...keys, ...extra];
        rows.forEach(r => { all.forEach(k => { if (r[k] != null) r[k] /= 100; }); });
        keys.forEach(k => { totals[k] /= 100; });
      }
    };
    if (stack === 'status') {
      finish();
      const series = STATUS.filter(s => totals[s.key] > 0);
      return { unit, rows, series, detail: series };
    }
    const ranked = keys.filter(k => totals[k] > 0).sort((a, b) => totals[b] - totals[a] || a.localeCompare(b));
    const detail = ranked.map(k => ({ key: k, label: k.slice(2), color: clientColor(k.slice(2)) }));
    if (ranked.length <= MAX_STACK + 1) { finish(); return { unit, rows, series: detail, detail }; }
    const rest = ranked.slice(MAX_STACK);
    rows.forEach(r => { const v = rest.reduce((s, c) => s + (r[c] || 0), 0); if (v > 0) r[REST] = v; });
    finish([REST]);
    const series = [...detail.slice(0, MAX_STACK), { key: REST, label: `${rest.length} more`, color: 'rgb(var(--fg) / 0.26)', members: rest.map(k => k.slice(2)) }];
    return { unit, rows, series, detail };
  }, [filteredEntries, win, measure, stack, cfg]);
  const fmtHours = (h) => formatHM(h * HOUR);
  const chartFormat = measure === 'money' ? formatEUR : fmtHours;
  const chartAxis = measure === 'money' ? eurAxis : (v) => `${v}h`;
  const chartShort = measure === 'money' ? eurAxis : (v) => (v >= 10 ? v.toFixed(0) : v.toFixed(1));
  const chartTag = measure === 'money' ? eurAxis : (v) => `${v.toFixed(1)}h`;
  const chartAvg = measure === 'money' ? formatEUR : (v) => `${v.toFixed(1)} h`;

  // ---- grouping tree for the donut and the table ----
  const tree = useMemo(() => buildTree(filteredEntries, groupBy, cfg, vatOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filteredEntries, groupBy, cfg, byClient]);
  const donutByMoney = totalEarnings > 0;
  const donutItems = useMemo(() => [...tree]
    .map(r => ({ id: r.id, label: r.label, sub: groupBy === 'project' ? r.client : undefined, value: donutByMoney ? r.net : r.ms / HOUR, color: r.color }))
    .filter(d => d.value > 0)
    .sort((a, b) => b.value - a.value), [tree, groupBy, donutByMoney]);

  const hasData = filteredCount > 0;
  const clientCount = Object.keys(byClient).length;
  const sortedClients = useMemo(() => Object.entries(byClient).sort((a, b) => b[1].earnings - a[1].earnings), [byClient]);
  const pdfClients = sortedClients.filter(([, d]) => d.total > 0);
  const groupWord = { client: 'client', project: 'project', activity: 'activity' }[groupBy];

  const tiles = [
    {
      id: 'tracked', label: 'Tracked', value: formatHoursNum(totalMs), unit: 'h',
      delta: prev && change(curCmp.ms, prev.ms), goodWhen: 'none', hint: prev ? was(`${formatHoursNum(prev.ms)} h`, curCmp.ms, prev.ms, `${formatHoursNum(curCmp.ms)} h`) : undefined,
      sub: hasData ? `${filteredCount} ${filteredCount === 1 ? 'session' : 'sessions'} · avg ${formatHoursNum(totalMs / filteredCount)} h` : 'No sessions',
    },
    {
      id: 'billable', label: 'Billable', value: formatHoursNum(totalBillableMs), unit: 'h',
      delta: prev && change(curCmp.billableMs, prev.billableMs), hint: prev ? was(`${formatHoursNum(prev.billableMs)} h`, curCmp.billableMs, prev.billableMs, `${formatHoursNum(curCmp.billableMs)} h`) : undefined,
      sub: totalMs > 0 ? `${Math.round((totalBillableMs / totalMs) * 100)}% of tracked` : 'Nothing billable',
    },
    {
      id: 'net', label: 'Earnings (net)', value: <Amount value={totalEarnings} />,
      delta: prev && change(curCmp.net, prev.net), hint: prev ? was(formatEUR(prev.net), curCmp.net, prev.net, formatEUR(curCmp.net)) : undefined,
      sub: `${formatEUR(totalGross)} incl. VAT`,
    },
    {
      id: 'rate', label: 'Effective rate', value: rate > 0 ? <Amount value={rate} /> : '–', unit: rate > 0 ? '/h' : undefined,
      delta: prev && prev.rate > 0 && curCmp.rate > 0 ? change(curCmp.rate, prev.rate) : null,
      hint: prev && prev.rate > 0 && curCmp.rate > 0 ? was(`${formatEUR(prev.rate)}/h`, curCmp.rate, prev.rate, `${formatEUR(curCmp.rate)}/h`) : undefined,
      sub: (
        <>
          {clientCount > 0 && (
            <span className="flex shrink-0 items-center -space-x-0.5">
              {sortedClients.slice(0, 6).map(([c]) => <ClientDot key={c} client={c} size={8} className="ring-2 ring-surface" />)}
            </span>
          )}
          <span className="truncate">{clientCount} active {clientCount === 1 ? 'client' : 'clients'}</span>
        </>
      ),
    },
    {
      id: 'unbilled', label: (<><span aria-hidden className="size-1.5 rounded-full bg-unbilled" />Unbilled</>),
      value: <Amount value={cur.unbilledNet} />,
      emphasis: cur.unbilledNet > 0,
      sub: cur.unbilledNet > 0
        ? `${cur.unbilledCount} ${cur.unbilledCount === 1 ? 'entry' : 'entries'} · ready to invoice`
        : !hasData ? 'Nothing to invoice' : filterBilled === 'invoiced' ? 'Showing invoiced work' : 'All invoiced',
    },
  ];

  // Complimentary value under the same money rule as every other total.
  const totalComplimentary = cur.freeValue;
  const footer = (prevWin || totalComplimentary > 0) ? (
    <>
      <span className="tnum">
        {prevWin ? <>Changes compared with <span className="font-medium text-fg-muted">{prevLabel}</span></> : 'All time, nothing to compare with'}
        {laterCount > 0 && <> · both up to now, so {laterCount} {laterCount === 1 ? 'entry' : 'entries'} dated later {laterCount === 1 ? 'is' : 'are'} left out</>}
      </span>
      {totalComplimentary > 0 && (
        <span className="flex items-center gap-1.5 text-free-text">
          <Gift className="size-3.5" />
          <span className="tnum">{complimentaryCount} complimentary {complimentaryCount === 1 ? 'session' : 'sessions'} · {formatEUR(totalComplimentary)} not billed</span>
        </span>
      )}
    </>
  ) : null;

  return (
    <Page>
      <PageHeader title="Dashboard"
        description={`${rangeText} · ${filteredCount} ${filteredCount === 1 ? 'entry' : 'entries'}`}
        actions={(
          <>
            <Button variant="secondary" onClick={onExport} disabled={!hasData}><Download /> Export CSV</Button>
            {filterClient === 'all' ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="primary" disabled={pdfClients.length === 0}><FileText /> PDF / Invoice <ChevronDown className="-mr-0.5 opacity-70" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-[min(560px,var(--radix-dropdown-menu-content-available-height))] w-80 overflow-y-auto">
                  {/* One place for documents: invoice the unbilled work of a client in one step, or open
                      the PDF dialog for everything a client has in the period. */}
                  {unbilledByClient.length > 0 && (
                    <>
                      <DropdownMenuLabel className="flex items-center justify-between gap-3">
                        <span>Invoice unbilled work</span>
                        <span className="flex items-center gap-1.5 text-2xs font-medium text-fg-subtle"><span aria-hidden className="size-1.5 rounded-full bg-unbilled" />Unbilled</span>
                      </DropdownMenuLabel>
                      {unbilledByClient.map(([c, d]) => (
                        <DropdownMenuItem key={`u:${c}`} onSelect={() => startInvoice(c)} className="h-auto items-start py-1.5">
                          <ClientDot client={c} className="mt-1.5" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{c}</span>
                            <span className="block text-2xs text-fg-subtle tnum">{d.count} {d.count === 1 ? 'entry' : 'entries'} to invoice</span>
                          </span>
                          <span className="pt-px text-xs font-medium text-fg tnum">{formatEUR(d.net)}</span>
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuLabel className="flex items-center justify-between gap-3">
                    <span>Report or invoice for</span>
                    <span className="text-2xs font-medium text-fg-subtle">Net in period</span>
                  </DropdownMenuLabel>
                  {pdfClients.map(([c]) => (
                    <DropdownMenuItem key={c} onSelect={() => onExportPDF(c)}>
                      <ClientDot client={c} />
                      <span className="min-w-0 flex-1 truncate">{c}</span>
                      <span className="text-xs font-medium text-fg tnum">{formatEUR(netPerClient[c] || 0)}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Tooltip content={`PDF report or invoice for ${filterClient}`}>
                <Button variant="primary" onClick={() => onExportPDF(filterClient)} disabled={!hasData}><FileText /> PDF / Invoice</Button>
              </Tooltip>
            )}
          </>
        )}>
        <div className="flex flex-wrap items-center gap-2">
          <div ref={pickerRef} className="contents">
            <DateRangePicker value={{ period, from: customStart, to: customEnd }} onChange={onRange}
              presets={['today', 'week', 'month', 'lastWeek', 'lastMonth', 'last7', 'last30', 'year', 'all']} />
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Select value={filterClient} onChange={setFilterClient} clientDots aria-label="Client" className="w-[190px]"
              options={[{ value: 'all', label: 'All clients' }, ...clients.map(c => ({ value: c, label: c }))]} />
            <Select value={filterBilled} onChange={setFilterBilled} aria-label="Billing status" title="Filter by billing status" className="w-[140px]"
              options={[{ value: 'all', label: 'All entries' }, { value: 'unbilled', label: 'Unbilled' }, { value: 'invoiced', label: 'Invoiced' }]} />
            <ActivityFilter options={activityOptions} excluded={excludedTasks} onChange={setExcludedTasks} align="right" />
          </div>
        </div>
      </PageHeader>

      <KpiStrip tiles={tiles} footer={footer} className="mb-4" />

      {!hasData ? (
        <Card>
          <EmptyState icon={<BarChart3 />} title="No tracked time in this period"
            description="Pick a longer period or clear a filter. Time you track shows up here with earnings per client."
            action={period !== 'all' && <Button variant="secondary" size="sm" onClick={() => onRange({ period: 'all', from: customStart, to: customEnd })}>Show all time</Button>} />
        </Card>
      ) : (
        <>
          <div className="mb-4 grid gap-4 min-[1180px]:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Card className="flex min-w-0 flex-col">
              <CardHeader title={measure === 'money' ? 'Earnings' : 'Tracked time'}
                description={`Per ${UNIT_WORD[chart.unit]} · by ${stack === 'status' ? 'billing status' : 'client'}`}
                actions={(
                  <div className="flex flex-wrap justify-end gap-2">
                    <SegmentedControl size="sm" label="Measure" value={measure} onChange={setMeasure}
                      options={[{ value: 'hours', label: 'Hours' }, { value: 'money', label: 'Earnings' }]} />
                    <SegmentedControl size="sm" label="Stack by" value={stack} onChange={setStack}
                      options={[{ value: 'client', label: 'Clients' }, { value: 'status', label: 'Status' }]} />
                  </div>
                )} />
              <div className="flex flex-1 flex-col px-5 pb-4 pt-4">
                <TimeChart key={`${measure}|${stack}`} fill data={chart.rows} series={chart.series} detail={chart.detail}
                  format={chartFormat} axisFormat={chartAxis} shortFormat={chartShort} tagFormat={chartTag} avgFormat={chartAvg}
                  avgUnit={chart.unit}
                  description={`${measure === 'money' ? 'Net earnings' : 'Tracked hours'} per ${chart.unit}, stacked by ${stack === 'status' ? 'billing status' : 'client'}`} />
              </div>
            </Card>

            <Card className="min-w-0">
              <CardHeader title={donutByMoney ? 'Earnings split' : 'Time split'} description={donutByMoney ? 'Net, before VAT' : 'Tracked hours'}
                actions={<Select size="sm" value={groupBy} onChange={setGroupBy} aria-label="Slice by" className="w-[128px]"
                  options={GROUPS.map(g => ({ value: g.value, label: `By ${g.label.toLowerCase()}` }))} />} />
              <div className="px-5 pb-4 pt-4">
                <div>
                  {donutItems.length ? (
                    <SplitDonut items={donutItems} format={donutByMoney ? formatEUR : fmtHours}
                      center={donutByMoney ? <Amount value={totalEarnings} /> : `${formatHoursNum(totalMs)} h`}
                      centerLabel={donutByMoney ? 'Net' : 'Tracked'} limit={5}
                      description={`Share of ${donutByMoney ? 'net earnings' : 'tracked time'} per ${groupWord}`} />
                  ) : (
                    <div className="py-10 text-center text-sm text-fg-subtle">Nothing to split in this period.</div>
                  )}
                </div>
              </div>
            </Card>
          </div>

          <Card className="overflow-hidden">
            <CardHeader title={`Breakdown by ${groupWord}`}
              description={groupBy === 'client' ? 'Expand a client for activities and notes.' : groupBy === 'project' ? 'Expand a project for activities and notes.' : 'Expand an activity for clients and notes.'}
              actions={<SegmentedControl size="sm" label="Group by" value={groupBy} onChange={setGroupBy} options={GROUPS} />}
              className="pb-4" />
            <BreakdownTable key={`${groupBy}|${rangeText}|${filterClient}|${filterBilled}|${excludedTasks.join(',')}`}
              rows={tree} groupBy={groupBy} roundingOf={roundingOf} vatBadgeOf={vatBadgeOf}
              total={{ ms: totalMs, billableMs: totalBillableMs, net: totalEarnings, gross: totalGross }} />
            <p className="border-t border-line px-5 py-3 text-xs leading-5 text-fg-subtle">
              Billable time counts AI-assisted work ×{AI_FACTOR}{rounding > 0 ? ` and rounds each entry up to ${rounding}-minute blocks, unless a client has its own rule` : ''}. Complimentary work bills €0.{' '}
              Incl. VAT adds <span className="font-medium text-fg-muted tnum">{vatInfo.usual}%</span>
              {vatInfo.others.length > 0 && <> (<span className="tnum">{vatInfo.others.join(', ')}</span>)</>}, rounded once per client.
            </p>
          </Card>
        </>
      )}
    </Page>
  );
}

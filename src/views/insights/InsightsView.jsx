import { useMemo, useState } from 'react';
import { CalendarClock, TrendingUp } from 'lucide-react';
import { formatEUR, formatHM, formatHoursNum } from '../../lib/format.js';
import { Page, PageHeader } from '../../components/shell/PageHeader.jsx';
import { ActivityFilter } from '../../components/ui/ActivityFilter.jsx';
import { ClientDot } from '../../components/ui/Badge.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { Amount } from '../../components/ui/Stat.jsx';
import { cn } from '../../lib/cn.js';
import { KpiStrip } from '../dashboard/parts/KpiStrip.jsx';
import { change } from '../dashboard/reportData.js';
import { Attention } from './parts/Attention.jsx';
import { RateChip, RateLegend } from './parts/RateChip.jsx';
import { TrendChart } from './parts/TrendChart.jsx';
import { UnbilledAge } from './parts/UnbilledAge.jsx';
import { buildInsights } from './insightsData.js';

const th = 'h-9 whitespace-nowrap px-3 text-2xs font-semibold uppercase tracking-[0.08em] text-fg-subtle';
const TOP_PROJECTS = 8;

export function InsightsView({ entries: allEntries, activityOptions, rates, clientRates, rounding, clientRounding }) {
  const [excluded, setExcluded] = useState([]);
  const cfg = useMemo(() => ({ rates, clientRates, rounding, clientRounding }), [rates, clientRates, rounding, clientRounding]);
  const entries = useMemo(() => allEntries.filter(e => !excluded.includes(e.task)), [allEntries, excluded]);
  const d = useMemo(() => buildInsights(entries, cfg), [entries, cfg]);

  if (allEntries.length === 0) {
    return (
      <Page>
        <PageHeader title="Insights" description="Trends across all your tracked time." />
        <Card><EmptyState icon={<TrendingUp />} title="No data yet" description="Track some time to see monthly earnings, real hourly rates and top projects." /></Card>
      </Page>
    );
  }

  const mtdDelta = change(d.mtd, d.prevSameNet);
  const projDelta = d.projected != null ? change(d.projected, d.last.net) : null;
  const topProjects = d.projectRows.slice(0, TOP_PROJECTS);
  const maxNet = Math.max(1, ...d.clientRows.map(r => r.net));

  const tiles = [
    {
      id: 'mtd', label: `${d.monthName} so far`, value: <Amount value={d.mtd} />,
      delta: mtdDelta,
      hint: d.mtd > 0 || d.prevSameNet > 0 ? `${formatEUR(d.prevSameNet)} ${d.prevWholeMonth ? 'in all of' : 'on'} ${d.prevSameLabel}` : undefined,
      sub: (
        <span className="truncate">
          vs <span className="font-medium text-fg-muted">{formatEUR(d.prevSameNet)}</span> {d.prevWholeMonth ? `in ${d.lastName}` : `on ${d.prevSameLabel}`}
        </span>
      ),
    },
    {
      id: 'proj', label: 'Forecast', value: d.projected != null ? <Amount value={d.projected} /> : '–',
      delta: projDelta, hint: `Against all of ${d.lastName}: ${formatEUR(d.last.net)}`,
      sub: d.projected != null ? `${d.monthName}, at 12-week pace` : 'Not enough recent work',
    },
    {
      id: 'y', label: 'Last 12 months', value: <Amount value={d.total12} />,
      sub: d.activeMonths ? `Avg ${formatEUR(d.avgMonth)} per month` : d.ms12 > 0 ? 'First month of tracking' : 'No tracked time yet',
    },
    {
      id: 'rate', label: 'Effective rate', value: d.rate12 > 0 ? <Amount value={d.rate12} /> : '–', unit: d.rate12 > 0 ? '/h' : undefined,
      sub: `${formatHoursNum(d.ms12)} h in 12 months`,
    },
    {
      id: 'unbilled', label: (<><span aria-hidden className="size-1.5 rounded-full bg-unbilled" />Unbilled</>), value: <Amount value={d.unbilled.net} />,
      emphasis: d.unbilled.oldNet > 0,
      sub: d.unbilled.oldNet > 0 ? <span className="truncate"><span className="font-medium text-warning-text">{formatEUR(d.unbilled.oldNet)}</span> is 30+ days old</span> : d.unbilled.net > 0 ? 'None older than 30 days' : entries.length ? 'Everything is invoiced' : 'Nothing to invoice',
    },
  ];

  const footer = (
    <>
      <span className="tnum">
        {d.prevWholeMonth
          ? <>Like for like: {d.monthName} so far is compared with all of <span className="font-medium text-fg-muted">{d.prevSameLabel}</span>, a shorter month.</>
          : <>Like for like: {d.monthName} so far is compared with <span className="font-medium text-fg-muted">{d.prevSameLabel}</span>, the same days of {d.lastName}.</>}
      </span>
      {d.later.count > 0 && (
        <span className="flex items-center gap-1.5 tnum">
          <CalendarClock aria-hidden className="size-3.5" />
          {d.later.count} {d.later.count === 1 ? 'entry' : 'entries'} dated after now ({formatEUR(d.later.net)}) {d.later.count === 1 ? 'waits' : 'wait'} for {d.later.count === 1 ? 'its' : 'their'} day in the month and rate figures
        </span>
      )}
    </>
  );

  return (
    <Page>
      <PageHeader title="Insights"
        description={`Earnings, hourly rates and projects${d.sinceLabel ? ` · tracking since ${d.sinceLabel}` : ''}`}
        actions={<ActivityFilter options={activityOptions} excluded={excluded} onChange={setExcluded} align="right" />} />

      <KpiStrip tiles={tiles} className="mb-4" footer={footer} />

      {/* Two columns only from 1240px: with the 232px sidebar a narrower window leaves the client column a few px wide. */}
      <div className="mb-4 grid gap-4 min-[1240px]:grid-cols-[minmax(0,1.62fr)_minmax(0,1fr)]">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader title="Effective rate by client" description="Net ÷ tracked time, last 12 months"
            actions={<RateLegend className="hidden justify-end pt-1 lg:flex" />} className="pb-3" />
          {d.clientRows.length === 0 ? (
            <div className="border-t border-line">
              <EmptyState icon={<TrendingUp />} title="No tracked time in the last 12 months"
                description="Client rates show here once there is work dated in the last 12 months." />
            </div>
          ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-y border-line bg-surface-2/60">
                <th scope="col" className={cn(th, 'pl-5 text-left')}>Client</th>
                <th scope="col" className={cn(th, 'hidden text-right sm:table-cell')}>Tracked</th>
                <th scope="col" className={cn(th, 'text-right')}>Net</th>
                <th scope="col" className={cn(th, 'text-right normal-case tracking-normal')}>€/h</th>
                <th scope="col" className={cn(th, 'pr-5 text-right')}>vs avg</th>
              </tr>
            </thead>
            <tbody>
              {d.clientRows.map(r => (
                <tr key={r.client} className="h-12 border-b border-line transition-colors last:border-0 hover:bg-fg/[0.02]">
                  <td className="w-[36%] max-w-0 pl-5 pr-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <ClientDot client={r.client} />
                      <span className="truncate font-medium text-fg">{r.client}</span>
                    </div>
                  </td>
                  <td className="hidden px-3 text-right text-fg-muted tnum sm:table-cell">{formatHM(r.ms)}</td>
                  <td className="px-3 text-right tnum">
                    <div className="flex items-center justify-end gap-3">
                      <span aria-hidden className="hidden h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-fg/[0.07] md:block">
                        <span className="block h-full rounded-full" style={{ width: `${(r.net / maxNet) * 100}%`, background: r.color }} />
                      </span>
                      <span className="min-w-[5.75rem] text-fg-muted">{formatEUR(r.net)}</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 text-right font-semibold text-fg tnum">{formatEUR(r.rate)}</td>
                  <td className="pr-5 text-right">
                    <RateChip vs={r.vsAvg} health={r.health}
                      hint={`${formatEUR(r.rate)}/h against your ${formatEUR(d.avgRate)}/h average${r.health ? '' : '. Under 2 h in 12 months is too little to judge'}`} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="h-12 border-t border-line font-semibold text-fg">
                <td className="pl-5 pr-3">All clients</td>
                <td className="hidden px-3 text-right tnum sm:table-cell">{formatHM(d.allMs)}</td>
                <td className="px-3 text-right tnum">{formatEUR(d.allNet)}</td>
                <td className="whitespace-nowrap px-3 text-right tnum">{formatEUR(d.avgRate)}</td>
                <td className="pr-5 text-right text-xs font-medium text-fg-subtle">average</td>
              </tr>
            </tfoot>
          </table>
          )}
        </Card>

        <Card className="flex min-w-0 flex-col">
          <CardHeader title="Needs attention" description="Worth a look before the next invoice" className="pb-3" />
          <div className="flex flex-1 flex-col border-t border-line">
            <Attention items={d.attention} />
          </div>
          <UnbilledAge ages={d.unbilled.ages} total={d.unbilled.net} className="border-t border-line" />
        </Card>
      </div>

      <div className="grid gap-4 min-[1240px]:grid-cols-[minmax(0,1.62fr)_minmax(0,1fr)]">
        <Card className="min-w-0">
          <CardHeader title="Monthly earnings" description={`Net per month and effective €/h${d.months.length < 12 && d.sinceLabel ? ` since ${d.sinceLabel}` : ''}`}
            actions={(
              <ul aria-hidden className="hidden flex-wrap items-center justify-end gap-x-3.5 gap-y-1 pt-1 text-xs text-fg-muted sm:flex">
                <li className="flex items-center gap-1.5"><span className="size-2 rounded-[3px] bg-fg/[0.84]" />Net</li>
                {d.projected != null && <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] border border-dashed border-fg/40 bg-fg/[0.06]" />Forecast</li>}
                <li className="flex items-center gap-1.5"><span className="h-0.5 w-3 rounded bg-invoiced" />€/h</li>
              </ul>
            )} />
          <div className="px-4 pb-3 pt-1">
            {d.months.some(m => m.count > 0) || d.projected != null ? (
              <TrendChart data={d.months} projected={d.projected} monthName={d.monthName} height={Math.max(300, 50 * Math.min(TOP_PROJECTS, topProjects.length) + 20)} />
            ) : (
              <EmptyState icon={<TrendingUp />} title="No earnings to chart yet" description="Months with tracked work show here as bars, with the hourly rate above them." />
            )}
          </div>
        </Card>

        {topProjects.length > 0 && (
          <Card className="min-w-0 overflow-hidden">
            <CardHeader title="Top projects" description="By net earnings, all time" className="pb-3" />
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-y border-line bg-surface-2/60">
                  <th scope="col" className={cn(th, 'w-10 pl-5 text-left')}>#</th>
                  <th scope="col" className={cn(th, 'text-left')}>Project</th>
                  <th scope="col" className={cn(th, 'pr-5 text-right')}>Net · <span className="normal-case tracking-normal">€/h</span></th>
                </tr>
              </thead>
              <tbody>
                {topProjects.map((r, i) => (
                  <tr key={r.id} className="h-[50px] border-b border-line last:border-0">
                    <td className="pl-5 text-xs font-medium text-fg-subtle tnum">{i + 1}</td>
                    <td className="w-full max-w-0 px-3">
                      <div className="truncate font-medium text-fg">{r.project}</div>
                      <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-fg-subtle">
                        <ClientDot client={r.client} size={6} /><span className="truncate">{r.client}</span>
                        <span aria-hidden className="text-fg-faint">·</span><span className="shrink-0 tnum">{formatHM(r.ms)} h</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap pr-5 text-right tnum">
                      <div className="font-semibold text-fg">{formatEUR(r.net)}</div>
                      <div className="mt-0.5 text-xs text-fg-subtle">{formatEUR(r.rate)}/h</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </Page>
  );
}

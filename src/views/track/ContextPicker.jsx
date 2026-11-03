import { useMemo, useRef, useState } from 'react';
import { Command } from 'cmdk';
import { motion, useReducedMotion } from 'motion/react';
import { Check, ChevronDown, CornerDownLeft, FolderOpen, Plus, Search, X } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { ClientDot } from '../../components/ui/Badge.jsx';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/Popover.jsx';

const STEPS = [
  { id: 'client', label: 'Client', search: 'Find a client or project…' },
  { id: 'task', label: 'Activity', search: 'Find an activity…' },
  { id: 'project', label: 'Project', search: 'Find or type a project…' },
];

const itemCls = 'flex h-9 cursor-default items-center gap-2.5 rounded-lg px-2.5 text-sm text-fg outline-none data-[selected=true]:bg-fg/[0.06]';
const groupCls = '[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.08em] [&_[cmdk-group-heading]]:text-fg-subtle';
const match = (value, search, keywords) => ((keywords || []).join(' ').toLowerCase().includes(search.toLowerCase()) ? 1 : 0);
// Project step ranking while typing: this client's projects first (prefix matches on top), then
// "Use “…”" (a new project for this client), then other clients' projects, which switch the client.
// "Use" is scored by its value, not its keywords: cmdk filters before the row re-renders with the new text.
const rankProject = (value, search, keywords) => {
  const s = search.trim().toLowerCase();
  if (value.startsWith('custom:')) return 0.5;
  const hay = (keywords || []).join(' ').toLowerCase();
  if (!s || !hay.includes(s)) return 0;
  if (value.startsWith('other:')) return 0.25;
  return hay.startsWith(s) ? 1 : 0.8;
};

// One compact chip for client, activity and project, attached to the timer input.
// The popover walks three steps: client → activity → project. A recent client·project row in step one
// sets both at once and skips the project step. Projects are scoped to the chosen client.
// Lists are cmdk: type to filter, arrows, Enter. Pick with the mouse at any press length.
export function ContextPicker({ clients, tasks, client, setClient, task, setTask, project, setProject, projectIndex = {}, lastTask = {}, pairs = [], onDone, className }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState('client');
  const [query, setQuery] = useState('');
  const [hl, setHl] = useState('');
  const [viaPair, setViaPair] = useState(false);
  const inputRef = useRef(null);
  const pickedRef = useRef(false);
  const reduce = useReducedMotion();
  const values = { client, task, project };
  const meta = STEPS.find(s => s.id === step);
  const scoped = projectIndex[client] || [];

  const focusSearch = () => requestAnimationFrame(() => inputRef.current?.focus());
  const go = (id, highlight = '') => { setStep(id); setQuery(''); setHl(highlight); focusSearch(); };
  // A finished pick hands focus to the description field; Esc returns it to the chip.
  const close = () => { pickedRef.current = true; setOpen(false); };

  // Where the cursor lands in each step: the value most likely to be picked next.
  const taskHighlight = (c, p) => {
    const fromPair = p && (projectIndex[c] || []).find(x => x.project === p);
    const t = (fromPair && fromPair.task) || lastTask[c] || task;
    return `task:${t}`;
  };
  const projectHighlight = (c, t) => {
    const list = projectIndex[c] || [];
    if (project && list.some(x => x.project === project)) return `proj:${project}`;
    const sameTask = list.find(x => x.task === t);
    if (sameTask) return `proj:${sameTask.project}`;
    return list[0] ? `proj:${list[0].project}` : 'none';
  };

  const chooseClient = (c) => {
    // A project belongs to a client: switching clients never keeps another client's project.
    if (c !== client && !(projectIndex[c] || []).some(x => x.project === project)) setProject('');
    setClient(c);
    setViaPair(false);
    go('task', taskHighlight(c, ''));
  };
  const choosePair = (p) => {
    setClient(p.client);
    setProject(p.project);
    setViaPair(true);
    go('task', taskHighlight(p.client, p.project));
  };
  const chooseTask = (t) => {
    setTask(t);
    if (viaPair) { close(); return; }
    go('project', projectHighlight(client, t));
  };
  const chooseProject = (v) => { setProject(v); close(); };
  // A project always belongs to its client: picking another client's project switches the client too.
  const chooseOther = (p) => { setClient(p.client); setProject(p.project); close(); };

  const onOpenChange = (o) => {
    setOpen(o);
    if (o) { pickedRef.current = false; setStep('client'); setQuery(''); setViaPair(false); setHl(`client:${client}`); }
  };

  const q = query.trim();
  const ql = q.toLowerCase();
  // Projects of other clients appear only while searching, so the default list stays scoped.
  const others = useMemo(() => {
    if (step !== 'project' || !q) return [];
    const own = new Set(scoped.map(x => x.project));
    const seen = new Set();
    return Object.values(projectIndex).flat()
      .filter(x => x.client !== client && !own.has(x.project) && x.project.toLowerCase().includes(ql))
      .filter(x => (seen.has(x.project) ? false : (seen.add(x.project), true)))
      .slice(0, 6);
  }, [step, q, ql, projectIndex, client, scoped]);
  const allPairs = useMemo(() => Object.values(projectIndex).flat(), [projectIndex]);
  const pairRows = q ? allPairs.filter(p => `${p.project} ${p.client}`.toLowerCase().includes(ql)).slice(0, 5) : pairs;
  // "Use" hides only when this client already has a project with exactly that name.
  const exactProject = scoped.some(x => x.project.toLowerCase() === ql);
  // Typing "no", "no project" or "none" means the No project row, not a new project with that name.
  // (cmdk 1.1 does not reorder groups, so the order here is the order on screen.)
  const noneFirst = !!ql && ['no project', 'none', 'no'].some(w => w.startsWith(ql));
  const noneGroup = (
    <Command.Group value="none" className={groupCls}>
      <Command.Item value="none" keywords={['no project', 'none']} onSelect={() => chooseProject('')} className={cn(itemCls, 'text-fg-muted')}>
        <X aria-hidden className="size-4 text-fg-subtle" />
        <span className="min-w-0 flex-1 truncate">No project</span>
        {!project && <Check aria-hidden className="size-4 text-fg" />}
      </Command.Item>
    </Command.Group>
  );

  const clientGroup = (
    <Command.Group heading="Clients" className={groupCls}>
      {clients.map(c => (
        <Command.Item key={c} value={`client:${c}`} keywords={[c]} onSelect={() => chooseClient(c)} className={itemCls}>
          <ClientDot client={c} />
          <span className="min-w-0 flex-1 truncate">{c}</span>
          {(projectIndex[c] || []).length > 0 && <span className="text-2xs text-fg-subtle tnum">{projectIndex[c].length} {projectIndex[c].length === 1 ? 'project' : 'projects'}</span>}
          {c === client && <Check aria-hidden className="size-4 text-fg" />}
        </Command.Item>
      ))}
    </Command.Group>
  );

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button type="button" data-ctx-chip="" aria-label={`Client, activity and project: ${client}, ${task}${project ? ', ' + project : ''}. Change`}
          className={cn(
            'group flex h-9 min-w-0 max-w-full items-center gap-2 rounded-lg px-2.5 text-sm outline-none transition-colors duration-fast',
            'hover:bg-fg/[0.05] focus-visible:ring-2 focus-visible:ring-ring/60 data-[state=open]:bg-fg/[0.06]',
            className,
          )}>
          <ClientDot client={client} />
          <span className="min-w-[2.5rem] max-w-[11rem] shrink truncate font-medium text-fg">{client}</span>
          <span aria-hidden className="text-fg-faint">·</span>
          {/* The activity sets the rate, so it stays whole at every width; client and project give way first. */}
          <span className="max-w-[10rem] shrink-0 truncate text-fg-muted">{task}</span>
          {project && (
            <span className="flex min-w-[3.25rem] max-w-[10rem] shrink-[3] items-center gap-1 text-fg-muted">
              <FolderOpen aria-hidden className="size-3.5 shrink-0 text-fg-subtle" />
              <span className="min-w-0 truncate">{project}</span>
            </span>
          )}
          <ChevronDown aria-hidden className="size-3.5 shrink-0 text-fg-subtle transition-transform duration-base group-data-[state=open]:rotate-180" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(26rem,calc(100vw-24px))] p-0"
        onOpenAutoFocus={(e) => { e.preventDefault(); inputRef.current?.focus(); }}
        // After a pick the description field takes focus (Enter there starts the timer).
        onCloseAutoFocus={(e) => { if (pickedRef.current && onDone) { e.preventDefault(); onDone(); } pickedRef.current = false; }}>
        {/* Steps: where you are, and what is picked so far. */}
        <div role="tablist" aria-label="Timer details" className="grid grid-cols-3 gap-1 border-b border-line p-1.5">
          {STEPS.map(s => {
            const on = s.id === step;
            const v = values[s.id];
            return (
              <button key={s.id} type="button" role="tab" aria-selected={on}
                onClick={() => go(s.id, s.id === 'client' ? `client:${client}` : s.id === 'task' ? `task:${task}` : projectHighlight(client, task))}
                className={cn('relative flex min-w-0 flex-col items-start rounded-lg px-2.5 py-1.5 text-left outline-none transition-colors duration-fast focus-visible:ring-2 focus-visible:ring-ring/60',
                  on ? '' : 'hover:bg-fg/[0.04]')}>
                {on && (
                  <motion.span layoutId="ctx-step" aria-hidden className="absolute inset-0 rounded-lg bg-fg/[0.065]"
                    transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 40 }} />
                )}
                <span className={cn('relative text-2xs font-semibold uppercase tracking-[0.08em]', on ? 'text-fg-muted' : 'text-fg-subtle')}>{s.label}</span>
                <span className="relative mt-0.5 flex w-full min-w-0 items-center gap-1.5 text-sm">
                  {s.id === 'client' && v && <ClientDot client={v} size={7} />}
                  <span className={cn('truncate', v ? 'font-medium text-fg' : 'text-fg-subtle')}>{v || 'None'}</span>
                </span>
              </button>
            );
          })}
        </div>
        <Command key={step} loop className="flex flex-col" label={meta.label} filter={step === 'project' ? rankProject : match} value={hl} onValueChange={setHl}>
          <div className="flex items-center gap-2 border-b border-line px-3">
            <Search aria-hidden className="size-4 shrink-0 text-fg-subtle" />
            <Command.Input ref={inputRef} value={query} onValueChange={setQuery} placeholder={meta.search}
              className="h-10 w-full bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle" />
          </div>
          <Command.List className="max-h-[19rem] overflow-y-auto p-1">
            {!(step === 'project' && q) && <Command.Empty className="px-3 py-6 text-center text-sm text-fg-subtle">No matches.</Command.Empty>}

            {step === 'client' && (
              <>
                {/* Searching: a matching client name comes first. Browsing: recent projects first. */}
                {q && clientGroup}
                {pairRows.length > 0 && (
                  <Command.Group heading={q ? 'Projects' : 'Recent projects'} className={groupCls}>
                    {pairRows.map(p => (
                      <Command.Item key={`${p.client}|${p.project}`} value={`pair:${p.client}|${p.project}`} keywords={[p.project, p.client]}
                        onSelect={() => choosePair(p)} className={itemCls}>
                        <ClientDot client={p.client} />
                        <span className="min-w-0 truncate font-medium">{p.project}</span>
                        <span className="min-w-0 flex-1 truncate text-fg-subtle">{p.client}</span>
                        {p.client === client && p.project === project && <Check aria-hidden className="size-4 text-fg" />}
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}
                {!q && clientGroup}
              </>
            )}

            {step === 'task' && tasks.map(t => (
              <Command.Item key={t} value={`task:${t}`} keywords={[t]} onSelect={() => chooseTask(t)} className={itemCls}>
                <span className="min-w-0 flex-1 truncate">{t}</span>
                {t === lastTask[client] && t !== task && <span className="text-2xs text-fg-subtle">Last used</span>}
                {t === task && <Check aria-hidden className="size-4 text-fg" />}
              </Command.Item>
            ))}

            {step === 'project' && (
              <>
                {/* Every row sits in a group: cmdk lifts ungrouped rows above all groups, whatever their rank. */}
                {scoped.length > 0 && (
                  <Command.Group heading={`${client} projects`} className={groupCls}>
                    {scoped.map(p => (
                      <Command.Item key={p.project} value={`proj:${p.project}`} keywords={[p.project]} onSelect={() => chooseProject(p.project)} className={itemCls}>
                        <FolderOpen aria-hidden className="size-4 text-fg-subtle" />
                        <span className="min-w-0 flex-1 truncate">{p.project}</span>
                        {p.project === project && <Check aria-hidden className="size-4 text-fg" />}
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}
                {noneFirst && noneGroup}
                {q && !exactProject && (
                  <Command.Group value="new" className={groupCls}>
                    {/* No forceMount: a force-mounted row never registers with its group, so the group would stay hidden. */}
                    <Command.Item value={`custom:${q}`} keywords={[q]} onSelect={() => chooseProject(q)} className={itemCls}>
                      <Plus aria-hidden className="size-4 text-fg-muted" />
                      <span className="min-w-0 flex-1 truncate">Use “{q}”</span>
                      <span className="shrink-0 text-2xs text-fg-subtle">New project for {client}</span>
                    </Command.Item>
                  </Command.Group>
                )}
                {others.length > 0 && (
                  <Command.Group heading="Other clients" className={groupCls}>
                    {others.map(p => (
                      <Command.Item key={p.project} value={`other:${p.client}|${p.project}`} keywords={[p.project]} onSelect={() => chooseOther(p)} className={itemCls}>
                        <ClientDot client={p.client} />
                        <span className="min-w-0 truncate">{p.project}</span>
                        <span className="min-w-0 flex-1 truncate text-fg-subtle">{p.client}</span>
                        <span className="shrink-0 text-2xs text-fg-subtle">Switches client</span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}
                {!noneFirst && noneGroup}
              </>
            )}
          </Command.List>
        </Command>
        <div className="flex items-center justify-between gap-3 border-t border-line px-3 py-2 text-2xs text-fg-subtle">
          <span className="flex items-center gap-1.5">
            <CornerDownLeft aria-hidden className="size-3" />
            {step === 'project' ? 'Pick one, or leave it empty.' : step === 'task' ? 'The activity sets the rate.' : 'Pick a client, or a recent project.'}
          </span>
          <button type="button" onClick={close}
            className="rounded-md px-1.5 py-0.5 text-xs font-medium text-fg-muted outline-none hover:bg-fg/[0.05] hover:text-fg focus-visible:ring-2 focus-visible:ring-ring/60">Done</button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

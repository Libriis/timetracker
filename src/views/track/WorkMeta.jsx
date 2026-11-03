import { cn } from '../../lib/cn.js';

const Sep = () => <span aria-hidden className="shrink-0 px-[0.35em] text-fg-faint">·</span>;

// "Client · Project · Activity" on one line. The activity sets the rate, so it never truncates:
// the project gives way first, then the client (down to a few letters). The full line is in the title.
// strong: the client in medium weight (running timers). quiet: everything in the subtle color (paused).
export function WorkMeta({ client, project, task, showTask = true, strong = false, quiet = false, className }) {
  const full = [client, project, showTask ? task : ''].filter(Boolean).join(' · ');
  const name = quiet ? 'text-fg-subtle' : 'text-fg-muted';
  return (
    <span className={cn('flex min-w-0 items-baseline text-fg-subtle', className)} title={full}>
      <span className={cn('min-w-[3rem] shrink truncate', name, strong && 'font-medium')}>{client}</span>
      {project && <><Sep /><span className={cn('min-w-[2.5rem] shrink-[4] truncate', name)}>{project}</span></>}
      {showTask && task && <><Sep /><span className="shrink-0 whitespace-nowrap">{task}</span></>}
    </span>
  );
}

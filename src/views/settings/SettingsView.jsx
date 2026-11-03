import { Building2, Database, Palette, Receipt, Users } from 'lucide-react';
import { Page, PageHeader } from '../../components/shell/PageHeader.jsx';
import { cn } from '../../lib/cn.js';
import { AppearanceCard } from './AppearanceCard.jsx';
import { ClientOverrides } from './ClientOverrides.jsx';
import { CsvFormatEditor } from './CsvFormatEditor.jsx';
import { DataBackup } from './DataBackup.jsx';
import { DescriptionsEditor } from './DescriptionsEditor.jsx';
import { EditableList } from './EditableList.jsx';
import { IssuerEditor } from './IssuerEditor.jsx';
import { RateEditor } from './RateEditor.jsx';
import { RoundingEditor } from './RoundingEditor.jsx';
import { UpdatesView } from './UpdatesView.jsx';
import { VatEditor } from './VatEditor.jsx';

const SECTIONS = [
  { id: 'billing', label: 'Billing', icon: Receipt },
  { id: 'invoices', label: 'Invoices', icon: Building2 },
  { id: 'lists', label: 'Clients & activities', icon: Users },
  { id: 'data', label: 'Data & updates', icon: Database },
  { id: 'appearance', label: 'Appearance', icon: Palette },
];

function Section({ id, title, description, children }) {
  return (
    <section id={`settings-${id}`} className="scroll-mt-6">
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-fg">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-fg-subtle">{description}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export function SettingsView({ clients, tasks, rates, clientRates, vat, clientVat, rounding, clientRounding, descriptions, issuer, csvFormat, onSaveClients, onSaveTasks, onSaveRates, onSaveClientRates, onSaveVat, onSaveClientVat, onSaveRounding, onSaveClientRounding, onSaveDescriptions, onSaveIssuer, onSaveCsvFormat, entryCount, onExportBackup, onImportBackup, onRequestConfirm, pushToast, themePref, onThemeChange }) {
  const jump = (id) => document.getElementById(`settings-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return (
    <Page>
      <PageHeader title="Settings" description="Rates, VAT, rounding, invoices and your data. Changes save on their own." />
      <div className="grid gap-8 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="hidden lg:block">
          <ul className="sticky top-6 space-y-0.5">
            {SECTIONS.map(s => (
              <li key={s.id}>
                <button type="button" onClick={() => jump(s.id)}
                  className={cn('flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-fg-muted outline-none transition-colors hover:bg-fg/[0.05] hover:text-fg focus-visible:ring-2 focus-visible:ring-ring/50')}>
                  <s.icon className="size-4 text-fg-subtle" />{s.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 max-w-[820px] space-y-10">
          <Section id="billing" title="Billing" description="How tracked time turns into money.">
            <div className="grid gap-4 md:grid-cols-2">
              <VatEditor vat={vat} onSaveVat={onSaveVat} />
              <RoundingEditor rounding={rounding} onSaveRounding={onSaveRounding} />
            </div>
            <RateEditor tasks={tasks} rates={rates} onSaveRates={onSaveRates} />
            <ClientOverrides clients={clients} tasks={tasks} rates={rates} clientRates={clientRates}
              vat={vat} clientVat={clientVat} rounding={rounding} clientRounding={clientRounding}
              onSaveClientRates={onSaveClientRates} onSaveClientVat={onSaveClientVat} onSaveClientRounding={onSaveClientRounding} />
          </Section>
          <Section id="invoices" title="Invoices" description="What appears on PDF reports and invoices.">
            <IssuerEditor issuer={issuer} onSaveIssuer={onSaveIssuer} />
            <DescriptionsEditor tasks={tasks} descriptions={descriptions} onSaveDescriptions={onSaveDescriptions} />
          </Section>
          <Section id="lists" title="Clients & activities" description="The lists you pick from when you track.">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <EditableList title="Clients" items={clients} onSave={onSaveClients} placeholder="New client name" clientDots />
              <EditableList title="Activities" items={tasks} onSave={onSaveTasks} placeholder="New activity" />
            </div>
          </Section>
          <Section id="data" title="Data & updates" description="Exports, backups and app updates.">
            <DataBackup entryCount={entryCount} onExport={onExportBackup} onImport={onImportBackup} onRequestConfirm={onRequestConfirm} pushToast={pushToast} />
            <CsvFormatEditor csvFormat={csvFormat} onSaveCsvFormat={onSaveCsvFormat} />
            <UpdatesView />
          </Section>
          <Section id="appearance" title="Appearance">
            <AppearanceCard themePref={themePref} onThemeChange={onThemeChange} />
          </Section>
        </div>
      </div>
    </Page>
  );
}

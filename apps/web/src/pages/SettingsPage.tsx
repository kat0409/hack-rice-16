import { Eyebrow } from '@/components/ui/Eyebrow'
import { Heading } from '@/components/ui/Heading'

export function SettingsPage() {
  return (
    <div className="flex flex-col gap-8">
      <header className="rounded-2xl border-2 border-ink/10 bg-paper px-5 py-4 shadow-chunky">
        <Eyebrow>Settings</Eyebrow>
        <Heading as="h1" size="page" className="mt-1">
          Settings
        </Heading>
      </header>
      <p className="max-w-md text-sm text-ink-soft">
        Account and workspace preferences will live here. Nothing to configure yet for the local MVP.
      </p>
    </div>
  )
}

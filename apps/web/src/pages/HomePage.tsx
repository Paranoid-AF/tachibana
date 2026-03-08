import { AppLayout } from '@/components/AppLayout'
import { ScrollArea } from '@/components/ui/scroll-area'

export function HomePage() {
  return (
    <AppLayout>
      {/* Middle panel */}
      <div className="flex-1 p-4 overflow-hidden">
        <div className="h-full rounded-xl border border-border" />
      </div>

      {/* Right panel: Sessions */}
      <div className="w-72 flex-shrink-0 border-l border-border flex flex-col">
        <div className="px-4 py-3 border-b border-border">
          <span className="text-xs font-medium uppercase tracking-wide">
            Sessions for this device
          </span>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-4" />
        </ScrollArea>
      </div>
    </AppLayout>
  )
}

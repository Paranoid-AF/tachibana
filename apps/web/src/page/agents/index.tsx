import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  fetchApiTokens,
  deleteApiToken,
  type TokenRow,
} from '@/lib/admin-auth-api'
import { AppLayout } from '@/component/biz/app-layout'
import { Button } from '@/component/ui/button'

import { fetchToolsDocs } from './libs/agents-api'
import { useFormatDate } from './hooks/use-format-date'
import { TokenTable } from './components/token-table'
import { CreateDialog } from './components/create-dialog'
import { RenameDialog } from './components/rename-dialog'
import { SetupGuideDialog } from './components/setup-guide-dialog'

export function AgentsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { formatDate, formatRelativeDate } = useFormatDate()

  const { data: tokens = [] } = useQuery<TokenRow[]>({
    queryKey: ['api-tokens'],
    queryFn: fetchApiTokens,
  })

  const { data: toolsDocs = '' } = useQuery<string>({
    queryKey: ['tools-docs'],
    queryFn: fetchToolsDocs,
  })

  const [createOpen, setCreateOpen] = useState(false)
  const [renameToken, setRenameToken] = useState<TokenRow | null>(null)
  const [revealedAgent, setRevealedAgent] = useState<{
    name: string
    key: string
  } | null>(null)

  const deleteMutation = useMutation({
    mutationFn: deleteApiToken,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-tokens'] })
    },
  })

  return (
    <AppLayout>
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-4xl">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-2xl font-bold">{t('agents.title')}</h1>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4" />
              {t('agents.register')}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mb-6">
            {t('agents.description')}
          </p>

          <TokenTable
            tokens={tokens}
            formatDate={formatDate}
            formatRelativeDate={formatRelativeDate}
            onRename={setRenameToken}
            onDelete={id => deleteMutation.mutate(id)}
          />

          <RenameDialog
            token={renameToken}
            onClose={() => setRenameToken(null)}
            onRenamed={() =>
              queryClient.invalidateQueries({ queryKey: ['api-tokens'] })
            }
          />

          <CreateDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            onCreated={result => {
              setRevealedAgent(result)
              queryClient.invalidateQueries({ queryKey: ['api-tokens'] })
            }}
          />

          <SetupGuideDialog
            revealedAgent={revealedAgent}
            onClose={() => setRevealedAgent(null)}
            toolsDocs={toolsDocs}
          />
        </div>
      </div>
    </AppLayout>
  )
}

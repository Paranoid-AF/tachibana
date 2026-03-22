import { useState } from 'react'
import { Copy, Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { renderTemplates, downloadSkillZip } from '../libs/agents-api'

import agentSkillsLogo from '../../../../assets/images/agents/agentskills-logo.png'
import mcpLogo from '../../../../assets/images/agents/mcp-logo.svg'

interface SetupGuideDialogProps {
  revealedAgent: { name: string; key: string } | null
  onClose: () => void
  toolsDocs: string
}

export function SetupGuideDialog({
  revealedAgent,
  onClose,
  toolsDocs,
}: SetupGuideDialogProps) {
  const { t } = useTranslation()
  const [copiedItem, setCopiedItem] = useState<'mcp' | 'token' | null>(null)

  async function copyToClipboard(text: string, item: 'mcp' | 'token') {
    await navigator.clipboard.writeText(text)
    setCopiedItem(item)
  }

  const rendered = revealedAgent
    ? renderTemplates(revealedAgent.key, toolsDocs, 'tachibana-cli')
    : null

  return (
    <Dialog
      open={!!revealedAgent}
      onOpenChange={open => {
        if (!open) {
          onClose()
          setCopiedItem(null)
        }
      }}
    >
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('agents.setupDialog.title')}</DialogTitle>
          <DialogDescription>
            {t('agents.setupDialog.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-6">
          {/* AgentSkill column */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <img
                src={agentSkillsLogo}
                alt="AgentSkills"
                className="w-6 h-6"
              />
              <span className="font-semibold">
                {t('agents.setupDialog.agentSkill')}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('agents.setupDialog.agentSkillDescription')}
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={() =>
                revealedAgent && downloadSkillZip(revealedAgent.key, toolsDocs)
              }
            >
              <Download className="w-4 h-4 mr-2" />
              {t('agents.setupDialog.downloadZip')}
            </Button>
            <p className="text-xs text-muted-foreground">
              {t('agents.setupDialog.agentSkillHint')}
            </p>
          </div>

          {/* MCP column */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <img src={mcpLogo} alt="MCP" className="w-6 h-6" />
              <span className="font-semibold">
                {t('agents.setupDialog.mcp')}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('agents.setupDialog.mcpDescription')}
            </p>
            <div className="relative">
              <pre className="rounded-md bg-muted px-3 py-2 text-xs font-mono overflow-x-auto whitespace-pre">
                {rendered?.mcpJson}
              </pre>
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-1 right-1 h-7 w-7"
                onClick={() =>
                  rendered && copyToClipboard(rendered.mcpJson, 'mcp')
                }
              >
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </div>
            {copiedItem === 'mcp' && (
              <p className="text-xs text-muted-foreground">
                {t('agents.setupDialog.copied')}
              </p>
            )}
          </div>
        </div>

        {/* Raw token section */}
        <div className="border-t pt-4 mt-2">
          <p className="text-sm text-muted-foreground mb-2">
            {t('agents.setupDialog.saveToken')}
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-md bg-muted px-3 py-2 text-xs font-mono break-all">
              {revealedAgent?.key}
            </code>
            <Button
              variant="outline"
              size="icon"
              className="shrink-0"
              onClick={() =>
                revealedAgent && copyToClipboard(revealedAgent.key, 'token')
              }
            >
              <Copy className="w-4 h-4" />
            </Button>
          </div>
          {copiedItem === 'token' && (
            <p className="text-sm text-muted-foreground mt-1">
              {t('agents.setupDialog.copied')}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

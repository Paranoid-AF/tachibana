import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { type TokenRow } from '@/lib/admin-auth-api'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'

interface TokenTableProps {
  tokens: TokenRow[]
  formatDate: (ms: number | null) => string
  formatRelativeDate: (ms: number | null) => string
  onRename: (token: TokenRow) => void
  onDelete: (id: number) => void
}

export function TokenTable({
  tokens,
  formatDate,
  formatRelativeDate,
  onRename,
  onDelete,
}: TokenTableProps) {
  const { t } = useTranslation()

  if (tokens.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        {t('agents.noAgents')}
      </p>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('agents.agentName')}</TableHead>
          <TableHead>{t('agents.expires')}</TableHead>
          <TableHead>{t('agents.lastUsed')}</TableHead>
          <TableHead className="w-12" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {tokens.map(token => (
          <TableRow key={token.id}>
            <TableCell>
              <div className="font-medium">{token.name}</div>
              <div className="text-xs text-muted-foreground font-mono">
                {token.keyPrefix}...
              </div>
            </TableCell>
            <TableCell>{formatDate(token.expiresAt)}</TableCell>
            <TableCell>{formatRelativeDate(token.lastUsedAt)}</TableCell>
            <TableCell>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onRename(token)}>
                    <Pencil className="w-4 h-4 mr-2" />
                    {t('agents.rename')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => onDelete(token.id)}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    {t('agents.delete')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

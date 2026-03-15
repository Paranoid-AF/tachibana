import { useTranslation } from 'react-i18next'
import { Languages } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'

const LANGUAGES = [
  { code: 'en-US', label: 'English' },
  { code: 'zh-CN', label: '简体中文' },
] as const

export function LanguageSwitcher({
  variant = 'ghost',
}: {
  variant?: 'ghost' | 'outline'
}) {
  const { i18n } = useTranslation()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size="icon" className="h-8 w-8">
          <Languages className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {LANGUAGES.map(lang => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => i18n.changeLanguage(lang.code)}
            className={i18n.language === lang.code ? 'font-semibold' : ''}
          >
            {lang.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

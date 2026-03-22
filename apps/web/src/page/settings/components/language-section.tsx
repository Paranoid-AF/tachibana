import { useTranslation } from 'react-i18next'

import { Button } from '@/component/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/component/ui/dropdown-menu'

const LANGUAGES = [
  { code: 'en-US', label: 'English' },
  { code: 'zh-CN', label: '简体中文' },
] as const

export function LanguageSection() {
  const { t, i18n } = useTranslation()

  const currentLangLabel =
    LANGUAGES.find(l => l.code === i18n.language)?.label ?? 'English'

  return (
    <div className="mt-10">
      <h2 className="text-2xl font-bold mb-2">
        {t('settings.language.title')}
      </h2>
      <p className="text-sm text-muted-foreground mb-4">
        {t('settings.language.description')}
      </p>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="w-56 justify-between">
            {currentLangLabel}
            <span className="text-muted-foreground">&#9662;</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56">
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
    </div>
  )
}

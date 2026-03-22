import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AppLayout } from '@/components/biz/app-layout'
import { Button } from '@/components/ui/button'
import { ChangePasswordDialog } from './components/change-password-dialog'
import { LanguageSection } from './components/language-section'

export function SettingsPage() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <AppLayout>
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-bold mb-2">
            {t('settings.password.title')}
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            {t('settings.password.description')}
          </p>

          <Button onClick={() => setOpen(true)}>
            {t('settings.password.change')}
          </Button>

          <ChangePasswordDialog open={open} onOpenChange={setOpen} />

          <LanguageSection />
        </div>
      </div>
    </AppLayout>
  )
}

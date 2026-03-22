import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { enUS, zhCN, type Locale } from 'date-fns/locale'

const localeMap: Record<string, Locale> = {
  'en-US': enUS,
  'zh-CN': zhCN,
}

export function useDateLocale(): Locale {
  const { i18n } = useTranslation()
  return useMemo(() => localeMap[i18n.language] ?? enUS, [i18n.language])
}

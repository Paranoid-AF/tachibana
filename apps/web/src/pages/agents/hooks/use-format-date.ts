import { useTranslation } from 'react-i18next'
import { format, formatDistanceToNow } from 'date-fns'
import { useDateLocale } from '@/hooks/use-date-locale'

export function useFormatDate() {
  const { t } = useTranslation()
  const dateLocale = useDateLocale()

  return {
    formatDate(ms: number | null): string {
      if (!ms) return t('agents.never')
      return format(ms, 'MMM d, yyyy', { locale: dateLocale })
    },
    formatRelativeDate(ms: number | null): string {
      if (!ms) return t('agents.never')
      return formatDistanceToNow(ms, { addSuffix: true, locale: dateLocale })
    },
  }
}

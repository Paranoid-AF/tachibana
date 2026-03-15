/* eslint-disable no-named-as-default-member */

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import enUS from '../locales/en-US.json'
import zhCN from '../locales/zh-CN.json'

i18n.on('languageChanged', lng => {
  document.documentElement.lang = lng
})

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init(
    {
      resources: {
        'en-US': { translation: enUS },
        'zh-CN': { translation: zhCN },
      },
      fallbackLng: 'en-US',
      supportedLngs: ['en-US', 'zh-CN'],
      interpolation: { escapeValue: false },
      detection: {
        order: ['localStorage', 'navigator'],
        caches: ['localStorage'],
        lookupLocalStorage: 'tachibana-lang',
      },
    },
    () => {
      document.documentElement.lang = i18n.language
    }
  )

const ERROR_MAP: Record<string, string> = {
  'Setup failed': 'errors.setupFailed',
  'Login failed': 'errors.loginFailed',
  'Logout failed': 'errors.logoutFailed',
  'Password change failed': 'errors.passwordChangeFailed',
  'Failed to fetch tokens': 'errors.fetchTokensFailed',
  'Failed to create token': 'errors.createTokenFailed',
  'Failed to rename token': 'errors.renameTokenFailed',
  'Failed to delete token': 'errors.deleteTokenFailed',
  'Invalid password': 'errors.invalidPassword',
}

export function translateError(error: string): string {
  const key = ERROR_MAP[error]
  return key ? i18n.t(key) : error
}

export default i18n

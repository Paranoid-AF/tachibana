import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow, format, fromUnixTime } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { useDateLocale } from '@/hooks/use-date-locale'
import {
  ArrowUpToLine,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Download,
  Home,
  ImageIcon,
  LayoutGrid,
  Lock,
  LockOpen,
  Package,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { fetchDeviceLogs } from '@/lib/logs-api'
import type { DeviceLog } from '@/lib/logs-api'
import {
  homescreen,
  keys,
  launchApp,
  lock,
  terminateApp,
  unlock,
  isLocked,
} from '@/lib/wda-api'

interface AppInfo {
  bundleId: string
  name: string
  iconUrl60?: string
  iconUrl100?: string
}

interface PhotoEntry {
  path: string
  size: number
  modified: number
}

const LOGS_PAGE_SIZE = 20

const SOURCE_COLORS: Record<string, string> = {
  web: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  agent:
    'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  mcp: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
}

function formatParamsSummary(action: string, params: string | null): string {
  if (!params) return ''
  try {
    const p = JSON.parse(params)

    // Helper: extract coordinates from WDA actions payload
    const extractWdaCoords = (): { x: number; y: number } | null => {
      const act = p?.actions?.[0]?.actions
      if (!Array.isArray(act)) return null
      const move = act.find(
        (a: Record<string, unknown>) => a.type === 'pointerMove'
      )
      if (move)
        return {
          x: Math.round(move.x as number),
          y: Math.round(move.y as number),
        }
      return null
    }

    switch (action) {
      case 'tap':
      case 'double_tap': {
        if (p.x != null && p.y != null)
          return `(${Math.round(p.x)}, ${Math.round(p.y)})`
        const c = extractWdaCoords()
        return c ? `(${c.x}, ${c.y})` : ''
      }
      case 'drag': {
        if (p.fromX != null)
          return `(${Math.round(p.fromX)},${Math.round(p.fromY)}) → (${Math.round(p.toX)},${Math.round(p.toY)})`
        // WDA payload: look for multiple pointerMove actions
        const acts = p?.actions?.[0]?.actions
        if (Array.isArray(acts)) {
          const moves = acts.filter(
            (a: Record<string, unknown>) => a.type === 'pointerMove'
          )
          if (moves.length >= 2) {
            const f = moves[0],
              t = moves[moves.length - 1]
            return `(${Math.round(f.x as number)},${Math.round(f.y as number)}) → (${Math.round(t.x as number)},${Math.round(t.y as number)})`
          }
        }
        return ''
      }
      case 'touch_and_hold': {
        if (p.x != null && p.y != null) {
          const dur = p.duration != null ? ` ${p.duration}s` : ''
          return `(${Math.round(p.x)}, ${Math.round(p.y)})${dur}`
        }
        return ''
      }
      case 'type_text': {
        let text = ''
        if (typeof p.text === 'string') text = p.text
        else if (Array.isArray(p.value)) text = p.value.join('')
        if (!text) return ''
        return text.length > 20 ? `"${text.slice(0, 20)}..."` : `"${text}"`
      }
      case 'launch_app':
      case 'terminate_app':
        return p.bundleId ?? ''
      case 'execute_device_control':
        return p.device_control_token
          ? p.device_control_token.slice(0, 8) + '...'
          : ''
      case 'set_device_prefs':
        if (p.alwaysAwake != null) return `awake=${p.alwaysAwake}`
        return ''
      case 'link_device':
        return p.name ?? ''
      default: {
        // Generic fallback: show first few key=value pairs
        const entries = Object.entries(p).filter(([k]) => k !== 'udid')
        if (entries.length === 0) return ''
        return entries
          .slice(0, 3)
          .map(
            ([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`
          )
          .join(' ')
      }
    }
  } catch {
    return ''
  }
}

interface ControlPanelProps {
  udid: string
}

export function ControlPanel({ udid }: ControlPanelProps) {
  const { t } = useTranslation()
  const dateLocale = useDateLocale()
  const [appsOpen, setAppsOpen] = useState(false)
  const [apps, setApps] = useState<AppInfo[]>([])
  const [appsLoading, setAppsLoading] = useState(false)
  const [locked, setLocked] = useState(false)
  const [alwaysAwake, setAlwaysAwake] = useState(true)
  const [contextMenuApp, setContextMenuApp] = useState<string | null>(null)
  const [photosOpen, setPhotosOpen] = useState(false)
  const [photosList, setPhotosList] = useState<PhotoEntry[]>([])
  const [photosLoading, setPhotosLoading] = useState(false)
  const [photosNextCursor, setPhotosNextCursor] = useState<string | undefined>()
  const [photosHasMore, setPhotosHasMore] = useState(false)
  const [revealedPhotos, setRevealedPhotos] = useState<Set<string>>(new Set())
  const [logsPage, setLogsPage] = useState(1)
  const [logsAutoRefresh, setLogsAutoRefresh] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!appsOpen) return
    let cancelled = false
    setAppsLoading(true)
    fetch(`/api/devices/${udid}/apps`)
      .then(res => res.json())
      .then((data: AppInfo[]) => {
        if (!cancelled)
          setApps(data.sort((a, b) => a.name.localeCompare(b.name)))
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setAppsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [udid, appsOpen])

  const fetchPhotos = useCallback(
    (cursor?: string) => {
      setPhotosLoading(true)
      const params = new URLSearchParams({ limit: '50' })
      if (cursor) params.set('cursor', cursor)
      fetch(`/api/devices/${udid}/photos?${params}`)
        .then(res => res.json())
        .then((data: { photos: PhotoEntry[]; nextCursor?: string }) => {
          setPhotosList(prev =>
            cursor ? [...prev, ...data.photos] : data.photos
          )
          setPhotosNextCursor(data.nextCursor)
          setPhotosHasMore(!!data.nextCursor)
        })
        .catch(() => {})
        .finally(() => setPhotosLoading(false))
    },
    [udid]
  )

  useEffect(() => {
    if (!photosOpen) return
    setPhotosList([])
    setRevealedPhotos(new Set())
    setPhotosNextCursor(undefined)
    setPhotosHasMore(false)
    fetchPhotos()
  }, [udid, photosOpen, fetchPhotos])

  // Poll lock state on mount
  useEffect(() => {
    isLocked(udid)
      .then(setLocked)
      .catch(() => {})
  }, [udid])

  // Fetch always-awake preference from server
  useEffect(() => {
    fetch(`/api/devices/${udid}/prefs`)
      .then(res => res.json())
      .then((data: { alwaysAwake: boolean }) =>
        setAlwaysAwake(data.alwaysAwake)
      )
      .catch(() => {})
  }, [udid])

  const { data: logsData } = useQuery({
    queryKey: ['device-logs', udid, logsPage],
    queryFn: () => fetchDeviceLogs(udid, logsPage, LOGS_PAGE_SIZE),
    refetchInterval: logsAutoRefresh ? 5000 : false,
  })

  const logs = logsData?.logs ?? []
  const logsTotal = logsData?.total ?? 0
  const logsTotalPages = Math.max(1, Math.ceil(logsTotal / LOGS_PAGE_SIZE))

  const handleAlwaysAwakeToggle = useCallback(
    (checked: boolean) => {
      setAlwaysAwake(checked)
      fetch(`/api/devices/${udid}/prefs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alwaysAwake: checked }),
      }).catch(() => {})
    },
    [udid]
  )

  const handleHome = useCallback(() => {
    homescreen(udid).catch(() => {})
  }, [udid])

  const handleLockToggle = useCallback(() => {
    isLocked(udid)
      .then(currentlyLocked => {
        const action = currentlyLocked ? unlock : lock
        return action(udid).then(() => setLocked(!currentlyLocked))
      })
      .catch(() => {})
  }, [udid])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') return
      if (e.key.length === 1) {
        keys(udid, [e.key]).catch(() => {})
        setTimeout(() => {
          if (inputRef.current) inputRef.current.value = ''
        }, 100)
      } else if (e.key === 'Backspace') {
        keys(udid, ['\b']).catch(() => {})
      } else if (e.key === 'Enter') {
        keys(udid, ['\n']).catch(() => {})
      }
    },
    [udid]
  )

  const handleLaunch = useCallback(
    (bundleId: string) => {
      launchApp(udid, bundleId).catch(() => {})
    },
    [udid]
  )

  const handleKillAndLaunch = useCallback(
    (bundleId: string) => {
      terminateApp(udid, bundleId)
        .then(() => launchApp(udid, bundleId))
        .catch(() => {})
    },
    [udid]
  )

  const handleLogsPageInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseInt(e.target.value, 10)
      if (val >= 1 && val <= logsTotalPages) setLogsPage(val)
    },
    [logsTotalPages]
  )

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <span className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          {t('controlPanel.control')}
          <span className="relative group">
            <CircleHelp className="h-3.5 w-3.5 cursor-help text-muted-foreground/60" />
            <div className="absolute left-0 top-full mt-1.5 z-50 hidden group-hover:block w-52 rounded-md border bg-popover p-3 text-xs font-normal tracking-normal text-popover-foreground shadow-md normal-case">
              <p className="font-medium mb-1.5">
                {t('controlPanel.screenControls')}
              </p>
              <ul className="space-y-1 text-muted-foreground">
                <li>
                  <kbd className="font-mono">{t('controlPanel.click')}</kbd> —{' '}
                  {t('controlPanel.clickTap')}
                </li>
                <li>
                  <kbd className="font-mono">
                    {t('controlPanel.doubleClick')}
                  </kbd>{' '}
                  — {t('controlPanel.doubleClickTap')}
                </li>
                <li>
                  <kbd className="font-mono">{t('controlPanel.clickDrag')}</kbd>{' '}
                  — {t('controlPanel.clickDragSwipe')}
                </li>
                <li>
                  <kbd className="font-mono">
                    {t('controlPanel.rightClick')}
                  </kbd>{' '}
                  — {t('controlPanel.rightClickHold')}
                </li>
              </ul>
            </div>
          </span>
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant={appsOpen ? 'default' : 'ghost'}
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => {
              setAppsOpen(v => !v)
              setPhotosOpen(false)
            }}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            {t('controlPanel.apps')}
          </Button>
          <Button
            variant={photosOpen ? 'default' : 'ghost'}
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => {
              setPhotosOpen(v => !v)
              setAppsOpen(false)
            }}
          >
            <ImageIcon className="h-3.5 w-3.5" />
            {t('controlPanel.photos')}
          </Button>
        </div>
      </div>

      {/* Home + lock + text input row */}
      <div className="flex items-center gap-2 px-4 py-2">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={handleHome}
          title={t('controlPanel.home')}
        >
          <Home className="h-4 w-4" />
        </Button>
        <Input
          ref={inputRef}
          className="h-8 text-sm"
          placeholder={t('controlPanel.typeHint')}
          onKeyDown={handleKeyDown}
        />
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={handleLockToggle}
          title={locked ? t('controlPanel.unlock') : t('controlPanel.lock')}
        >
          {locked ? (
            <Lock className="h-4 w-4" />
          ) : (
            <LockOpen className="h-4 w-4" />
          )}
        </Button>
        <label className="flex items-center shrink-0 text-xs text-muted-foreground cursor-pointer select-none">
          <Switch
            checked={alwaysAwake}
            onCheckedChange={handleAlwaysAwakeToggle}
            className="scale-75 origin-left"
          />
          {t('controlPanel.alwaysAwake')}
        </label>
      </div>

      {/* Apps grid */}
      {appsOpen && (
        <>
          <Separator />
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-3">
              {appsLoading && apps.length === 0 && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-4 justify-center">
                  <Spinner className="h-4 w-4" />
                  {t('controlPanel.loadingApps')}
                </div>
              )}
              <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-3">
                {apps.map(app => (
                  <DropdownMenu
                    key={app.bundleId}
                    open={contextMenuApp === app.bundleId}
                    onOpenChange={open => {
                      if (!open) setContextMenuApp(null)
                    }}
                  >
                    <DropdownMenuTrigger asChild>
                      <button
                        className="flex flex-col items-center gap-1.5 p-2 rounded-lg hover:bg-accent/50 cursor-pointer transition-colors"
                        onClick={e => {
                          if (contextMenuApp) return
                          e.preventDefault()
                          handleLaunch(app.bundleId)
                        }}
                        onContextMenu={e => {
                          e.preventDefault()
                          setContextMenuApp(app.bundleId)
                        }}
                        title={app.bundleId}
                      >
                        {app.iconUrl60 ? (
                          <img
                            src={app.iconUrl60}
                            srcSet={
                              app.iconUrl100
                                ? `${app.iconUrl60} 1x, ${app.iconUrl100} 2x`
                                : undefined
                            }
                            alt={app.name}
                            className="w-12 h-12 rounded-[12px]"
                            draggable={false}
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-[12px] bg-muted flex items-center justify-center">
                            <Package className="h-6 w-6 text-muted-foreground" />
                          </div>
                        )}
                        <span className="text-[11px] leading-tight text-center line-clamp-2 w-full">
                          {app.name}
                        </span>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem
                        onSelect={() => handleLaunch(app.bundleId)}
                      >
                        {t('controlPanel.launchApp')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() => handleKillAndLaunch(app.bundleId)}
                      >
                        {t('controlPanel.killAndLaunch')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ))}
              </div>
            </div>
          </ScrollArea>
        </>
      )}

      {/* Photos grid */}
      {photosOpen && (
        <>
          <Separator />
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-3">
              {photosLoading && photosList.length === 0 && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-4 justify-center">
                  <Spinner className="h-4 w-4" />
                  {t('controlPanel.loadingPhotos')}
                </div>
              )}
              {!photosLoading && photosList.length === 0 && (
                <div className="text-xs text-muted-foreground py-4 text-center">
                  {t('controlPanel.noPhotos')}
                </div>
              )}
              <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-1.5">
                {photosList.map(photo => {
                  const revealed = revealedPhotos.has(photo.path)
                  const ext = photo.path.split('.').pop()?.toUpperCase() ?? ''
                  const photoUrl = `/api/devices/${udid}/photos/file?path=${encodeURIComponent(photo.path)}`
                  const previewUrl = `${photoUrl}&preview=true`
                  const extLower =
                    photo.path.split('.').pop()?.toLowerCase() ?? ''
                  const dateTimeStr = format(
                    fromUnixTime(photo.modified),
                    'yyyyMMdd-HHmmss'
                  )
                  const downloadName = `idevice-photo-${dateTimeStr}.${extLower}`

                  if (revealed) {
                    return (
                      <div
                        key={photo.path}
                        className="aspect-square rounded-md overflow-hidden relative group bg-muted"
                      >
                        <img
                          src={previewUrl}
                          alt={photo.path}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                        <a
                          href={photoUrl}
                          download={downloadName}
                          className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 text-white rounded-md p-1"
                          title={t('controlPanel.download')}
                          onClick={e => e.stopPropagation()}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    )
                  }

                  return (
                    <button
                      key={photo.path}
                      className="aspect-square rounded-md bg-muted flex flex-col items-center justify-center gap-1 p-2 cursor-pointer hover:bg-accent/50 transition-colors"
                      onClick={() =>
                        setRevealedPhotos(prev => new Set(prev).add(photo.path))
                      }
                    >
                      <span className="text-[10px] text-muted-foreground">
                        {format(
                          fromUnixTime(photo.modified),
                          'MMM d, yyyy',
                          {
                            locale: dateLocale,
                          }
                        )}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {photo.size < 1024 * 1024
                          ? `${(photo.size / 1024).toFixed(0)} KB`
                          : `${(photo.size / 1024 / 1024).toFixed(1)} MB`}
                      </span>
                      <span className="text-[9px] font-medium bg-background/80 px-1.5 py-0.5 rounded">
                        {ext}
                      </span>
                    </button>
                  )
                })}
              </div>
              {photosHasMore && (
                <div className="flex justify-center pt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    disabled={photosLoading}
                    onClick={() => fetchPhotos(photosNextCursor)}
                  >
                    {photosLoading ? (
                      <>
                        <Spinner className="h-3.5 w-3.5 mr-1.5" />
                        {t('common.loading', 'Loading...')}
                      </>
                    ) : (
                      t('controlPanel.loadMore')
                    )}
                  </Button>
                </div>
              )}
            </div>
          </ScrollArea>
        </>
      )}

      {/* LOGS section */}
      {(appsOpen || photosOpen) && (
        <div>
          <div className="flex items-center justify-between px-4 py-2 border-t">
            <span className="flex items-center gap-4 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              {t('controlPanel.logs')}
              <label className="flex items-center font-normal tracking-normal cursor-pointer select-none normal-case">
                <Switch
                  checked={logsAutoRefresh}
                  onCheckedChange={setLogsAutoRefresh}
                  className="scale-75 origin-left"
                />
                {t('controlPanel.autoRefresh')}
              </label>
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => {
                setAppsOpen(false)
                setPhotosOpen(false)
              }}
              title={t('controlPanel.closePanel')}
            >
              <ArrowUpToLine className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
      {!(appsOpen || photosOpen) && (
        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between px-4 py-2 border-t">
            <span className="flex items-center gap-4 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              {t('controlPanel.logs')}
              <label className="flex items-center font-normal tracking-normal cursor-pointer select-none normal-case">
                <Switch
                  checked={logsAutoRefresh}
                  onCheckedChange={setLogsAutoRefresh}
                  className="scale-75 origin-left"
                />
                {t('controlPanel.autoRefresh')}
              </label>
            </span>
          </div>
          <ScrollArea className="flex-1 min-h-0">
            <div className="px-2">
              {logs.length === 0 && (
                <div className="text-xs text-muted-foreground py-4 text-center">
                  {t('controlPanel.noLogs')}
                </div>
              )}
              {logs.map((log: DeviceLog) => {
                const paramSummary = formatParamsSummary(log.action, log.params)
                return (
                  <div
                    key={log.id}
                    className="flex items-center gap-2 px-2 py-1.5 text-xs border-b border-border/50 last:border-b-0"
                    title={
                      log.status === 'failed' && log.error
                        ? `Error: ${log.error}`
                        : (log.params ?? undefined)
                    }
                  >
                    <span className="text-muted-foreground shrink-0 w-24 text-right tabular-nums">
                      {formatDistanceToNow(log.createdAt, {
                        addSuffix: true,
                        locale: dateLocale,
                      })}
                    </span>
                    <span
                      className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${SOURCE_COLORS[log.source] ?? 'bg-muted text-muted-foreground'}`}
                    >
                      {log.source}
                      {log.authName ? `:${log.authName}` : ''}
                    </span>
                    <span className="font-mono truncate">{log.action}</span>
                    {paramSummary && (
                      <span
                        className="text-muted-foreground truncate max-w-[140px]"
                        title={paramSummary}
                      >
                        {paramSummary}
                      </span>
                    )}
                    <span className="ml-auto" />
                    <span
                      className={`shrink-0 h-2 w-2 rounded-full ${
                        log.status === 'success'
                          ? 'bg-green-500'
                          : log.status === 'processing'
                            ? 'bg-yellow-500 animate-pulse'
                            : 'bg-red-500'
                      }`}
                      title={log.status}
                    />
                  </div>
                )
              })}
            </div>
          </ScrollArea>
          {logsTotal > 0 && (
            <div className="flex items-center justify-between px-4 py-1.5 border-t text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={1}
                  max={logsTotalPages}
                  value={logsPage}
                  onChange={handleLogsPageInput}
                  className="h-6 w-10 text-center text-xs px-1 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <span>/ {logsTotalPages}</span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  disabled={logsPage <= 1}
                  onClick={() => setLogsPage(p => Math.max(1, p - 1))}
                  title={t('controlPanel.previousPage')}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  disabled={logsPage >= logsTotalPages}
                  onClick={() =>
                    setLogsPage(p => Math.min(logsTotalPages, p + 1))
                  }
                  title={t('controlPanel.nextPage')}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowUpToLine,
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

interface ControlPanelProps {
  udid: string
}

export function ControlPanel({ udid }: ControlPanelProps) {
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

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <span className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted-foreground">
          CONTROL
          <span className="relative group">
            <CircleHelp className="h-3.5 w-3.5 cursor-help text-muted-foreground/60" />
            <div className="absolute left-0 top-full mt-1.5 z-50 hidden group-hover:block w-52 rounded-md border bg-popover p-3 text-xs font-normal tracking-normal text-popover-foreground shadow-md">
              <p className="font-medium mb-1.5">Screen controls</p>
              <ul className="space-y-1 text-muted-foreground">
                <li>
                  <kbd className="font-mono">Click</kbd> — Tap
                </li>
                <li>
                  <kbd className="font-mono">Double click</kbd> — Double tap
                </li>
                <li>
                  <kbd className="font-mono">Click + drag</kbd> — Swipe
                </li>
                <li>
                  <kbd className="font-mono">Right click</kbd> — Touch &amp;
                  hold
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
            Apps
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
            Photos
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
          title="Home"
        >
          <Home className="h-4 w-4" />
        </Button>
        <Input
          ref={inputRef}
          className="h-8 text-sm"
          placeholder="Type here to send keys to device..."
          onKeyDown={handleKeyDown}
        />
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={handleLockToggle}
          title={locked ? 'Unlock' : 'Lock'}
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
          Always Awake
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
                  Loading apps...
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
                        Launch App
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() => handleKillAndLaunch(app.bundleId)}
                      >
                        Kill and Launch App
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
                  Loading photos...
                </div>
              )}
              {!photosLoading && photosList.length === 0 && (
                <div className="text-xs text-muted-foreground py-4 text-center">
                  No photos found
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
                  const d = new Date(photo.modified * 1000)
                  const dateTimeStr =
                    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}` +
                    `-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`
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
                          title="Download"
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
                        {new Date(photo.modified * 1000).toLocaleDateString(
                          undefined,
                          { month: 'short', day: 'numeric', year: 'numeric' }
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
                        Loading...
                      </>
                    ) : (
                      'Load More'
                    )}
                  </Button>
                </div>
              )}
            </div>
          </ScrollArea>
        </>
      )}

      {/* LOGS section */}
      <div className={appsOpen || photosOpen ? '' : 'flex-1 flex flex-col'}>
        <div className="flex items-center justify-between px-4 py-2 border-t">
          <span className="text-xs font-semibold tracking-wider text-muted-foreground">
            LOGS
          </span>
          {(appsOpen || photosOpen) && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => {
                setAppsOpen(false)
                setPhotosOpen(false)
              }}
              title="Close panel"
            >
              <ArrowUpToLine className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

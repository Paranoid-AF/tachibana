import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { linkDevice } from '@/api/device-api'
import type { DeviceListResponseItem } from '@/types'

export function useLinkDevice() {
  const queryClient = useQueryClient()
  const [showTrustModal, setShowTrustModal] = useState(false)
  const [linkingDevice, setLinkingDevice] =
    useState<DeviceListResponseItem | null>(null)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [showAuthDialog, setShowAuthDialog] = useState(false)

  const mutation = useMutation({
    mutationFn: ({ udid, name }: { udid: string; name: string }) =>
      linkDevice(udid, name),
    onSuccess: () => {
      setShowTrustModal(false)
      queryClient.invalidateQueries({ queryKey: ['devices'] })
    },
    onError: (err: Error) => {
      setShowTrustModal(false)
      setLinkError(err.message)
    },
  })

  function handleLink(device: DeviceListResponseItem, isLoggedIn: boolean) {
    if (!isLoggedIn) {
      setShowAuthDialog(true)
      return
    }
    setLinkingDevice(device)
    setShowTrustModal(true)
    mutation.mutate({ udid: device.udid, name: device.name })
  }

  return {
    handleLink,
    isPending: mutation.isPending,
    pendingUdid: mutation.variables?.udid ?? null,
    trustModalProps: {
      open: showTrustModal,
      deviceName: linkingDevice?.name,
      onClose: () => setShowTrustModal(false),
    },
    linkErrorProps: {
      error: linkError,
      onClose: () => setLinkError(null),
    },
    authDialogProps: {
      open: showAuthDialog,
      onClose: () => setShowAuthDialog(false),
    },
  }
}

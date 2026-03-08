import { useState, useEffect, useCallback } from 'react'
import { useTopology } from './state'
import { useHealthStatus } from './useHealthStatus'
import type { PortPosition, Device } from './types'
import { generateId } from './constants'
import { proxmoxVmAction } from './api'
import Canvas from './components/Canvas'
import Sidebar from './components/Sidebar'
import ConfigPanel from './components/ConfigPanel'
import ZoneConfigPanel from './components/ZoneConfigPanel'
import SshDrawer from './components/SshDrawer'
import SshConnectDialog from './components/SshConnectDialog'
import type { SshConnectParams } from './components/SshConnectDialog'
import VmDiscoveryModal from './components/VmDiscoveryModal'
import ConfirmModal from './components/ConfirmModal'

interface DragConnection {
  sourceDeviceId: string
  sourcePort: PortPosition
  sourceX: number
  sourceY: number
  mouseX: number
  mouseY: number
}

export default function App() {
  const { state, dispatch, currentTopologyId, topologies, loading, switchTopology, createNewTopology, deleteCurrentTopology, refreshTopologies } = useTopology()
  const { statuses: healthStatuses } = useHealthStatus(currentTopologyId)

  const [dragConn, setDragConn] = useState<DragConnection | null>(null)
  const [sshTabs, setSshTabs] = useState<Array<{ id: string; label: string; params: SshConnectParams }>>([])
  const [sshConnectTarget, setSshConnectTarget] = useState<{ host: string; label: string } | null>(null)
  const [showVmDiscovery, setShowVmDiscovery] = useState(false)
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; confirmLabel: string; onConfirm: () => void } | null>(null)

  const handleExport = useCallback(() => {
    if (!currentTopologyId) return
    const base = window.location.pathname.replace(/\/[^/]*$/, '/')
    window.open(`${base}api/topologies/${currentTopologyId}/export`, '_blank')
  }, [currentTopologyId])

  const handleImport = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      const text = await file.text()
      const data = JSON.parse(text)
      const api = await import('./api')
      const created = await api.importTopology({ name: data.name || file.name, state: data.state })
      await refreshTopologies()
      await switchTopology(created.id)
    }
    input.click()
  }, [switchTopology, refreshTopologies])

  const handleSshConnect = useCallback((host: string, label: string) => {
    setSshConnectTarget({ host, label })
  }, [])

  const handleSshConnectSubmit = useCallback((params: SshConnectParams) => {
    setSshTabs(prev => [...prev, { id: generateId(), label: params.label, params }])
    setSshConnectTarget(null)
  }, [])

  const handleCloseSshTab = useCallback((id: string) => {
    setSshTabs(prev => prev.filter(t => t.id !== id))
  }, [])

  const handleCloseAllSsh = useCallback(() => {
    setSshTabs([])
  }, [])

  const handleVmAction = useCallback((action: 'start' | 'shutdown' | 'reboot', device: Device) => {
    if (!device.proxmoxVm) return

    const actionLabels = { start: 'Start', shutdown: 'Shut Down', reboot: 'Reboot' }
    const vm = device.proxmoxVm

    const hostDevice = state.devices.find(d => d.ip === vm.host && d.healthCheck?.apiPreset === 'proxmox')
    const token = hostDevice?.healthCheck?.apiToken || device.healthCheck?.apiToken

    if (!token) {
      alert('No API token found. Configure the Proxmox host device with an API token first.')
      return
    }

    setConfirmAction({
      title: `${actionLabels[action]} VM`,
      message: `Are you sure you want to ${action} "${device.label}" (VMID ${vm.vmid})?`,
      confirmLabel: actionLabels[action],
      onConfirm: async () => {
        try {
          await proxmoxVmAction(action, {
            host: vm.host,
            node: vm.node,
            vmid: vm.vmid,
            type: vm.type,
            token,
          })
        } catch (err) {
          alert(`Failed: ${(err as Error).message}`)
        }
        setConfirmAction(null)
      },
    })
  }, [state.devices])

  const handleVmDiscoveryAdd = useCallback((vms: Array<{ vmid: number; name: string; type: 'qemu' | 'lxc'; node: string; host: string; token: string }>) => {
    const startX = state.viewBox.x + 200
    const startY = state.viewBox.y + 200

    vms.forEach((vm, i) => {
      const device: Device = {
        id: generateId(),
        type: vm.type === 'lxc' ? 'container' : 'vmhost',
        label: vm.name,
        x: startX + (i % 5) * 120,
        y: startY + Math.floor(i / 5) * 120,
        ip: '',
        notes: `Proxmox ${vm.type.toUpperCase()} - VMID ${vm.vmid}`,
        proxmoxVm: {
          host: vm.host,
          node: vm.node,
          vmid: vm.vmid,
          type: vm.type,
        },
        healthCheck: {
          type: 'api',
          apiPreset: 'proxmox',
          apiToken: vm.token,
          interval: 60,
        },
      }
      dispatch({ type: 'ADD_DEVICE', device })
    })

    setShowVmDiscovery(false)
  }, [dispatch, state.viewBox])

  const selectedDevice = state.selectionType === 'device' && state.selectedIds.length === 1
    ? state.devices.find(d => d.id === state.selectedIds[0])
    : null

  const selectedZone = state.selectionType === 'zone' && state.selectedIds.length === 1
    ? state.zones.find(z => z.id === state.selectedIds[0])
    : null

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const tag = (e.target as HTMLElement).tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        if (state.selectedIds.length === 0) return
        e.preventDefault()

        if (state.selectionType === 'zone') {
          state.selectedIds.forEach(id => dispatch({ type: 'DELETE_ZONE', id }))
        } else {
          state.selectedIds.forEach(id => dispatch({ type: 'DELETE_DEVICE', id }))
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [state.selectedIds, state.selectionType, dispatch])

  const onPortDragStart = useCallback((deviceId: string, port: PortPosition, x: number, y: number) => {
    setDragConn({ sourceDeviceId: deviceId, sourcePort: port, sourceX: x, sourceY: y, mouseX: x, mouseY: y })
  }, [])

  const onPortDragMove = useCallback((x: number, y: number) => {
    setDragConn(prev => prev ? { ...prev, mouseX: x, mouseY: y } : null)
  }, [])

  const onPortDragEnd = useCallback((targetDeviceId: string, targetPort: PortPosition) => {
    if (dragConn && dragConn.sourceDeviceId !== targetDeviceId) {
      dispatch({
        type: 'ADD_CONNECTION',
        connection: {
          id: generateId(),
          sourceDeviceId: dragConn.sourceDeviceId,
          targetDeviceId,
          sourcePort: dragConn.sourcePort,
          targetPort,
        },
      })
    }
    setDragConn(null)
  }, [dragConn, dispatch])

  const onPortDragCancel = useCallback(() => {
    setDragConn(null)
  }, [])

  if (loading) {
    return (
      <div className="h-screen w-screen bg-zinc-900 flex items-center justify-center text-zinc-400">
        Loading...
      </div>
    )
  }

  return (
    <div className="h-screen w-screen bg-zinc-900 text-zinc-100 flex flex-col overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          onDragStart={() => {}}
          topologies={topologies}
          currentTopologyId={currentTopologyId}
          onSwitchTopology={switchTopology}
          onNewTopology={createNewTopology}
          onDeleteTopology={deleteCurrentTopology}
          onExport={handleExport}
          onImport={handleImport}
          onDiscoverVms={() => setShowVmDiscovery(true)}
        />
        <Canvas
          state={state}
          dispatch={dispatch}
          dragConn={dragConn}
          onPortDragStart={onPortDragStart}
          onPortDragMove={onPortDragMove}
          onPortDragEnd={onPortDragEnd}
          onPortDragCancel={onPortDragCancel}
          healthStatuses={healthStatuses}
        />
        {selectedDevice && (
          <ConfigPanel
            device={selectedDevice}
            dispatch={dispatch}
            healthStatus={healthStatuses.get(selectedDevice.id)}
            allDevices={state.devices}
            onSshConnect={handleSshConnect}
            onVmAction={handleVmAction}
          />
        )}
        {selectedZone && <ZoneConfigPanel zone={selectedZone} dispatch={dispatch} />}
      </div>

      <SshDrawer tabs={sshTabs} onCloseTab={handleCloseSshTab} onCloseAll={handleCloseAllSsh} />

      {sshConnectTarget && (
        <SshConnectDialog
          defaultHost={sshConnectTarget.host}
          defaultLabel={sshConnectTarget.label}
          onConnect={handleSshConnectSubmit}
          onClose={() => setSshConnectTarget(null)}
        />
      )}

      {showVmDiscovery && (
        <VmDiscoveryModal
          onAdd={handleVmDiscoveryAdd}
          onClose={() => setShowVmDiscovery(false)}
        />
      )}

      {confirmAction && (
        <ConfirmModal
          title={confirmAction.title}
          message={confirmAction.message}
          confirmLabel={confirmAction.confirmLabel}
          onConfirm={confirmAction.onConfirm}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  )
}

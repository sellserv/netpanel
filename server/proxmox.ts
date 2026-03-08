import type { Request, Response } from 'express'

interface ProxmoxVm {
  vmid: number
  name: string
  type: 'qemu' | 'lxc'
  status: string
  node: string
  cpu?: number
  maxmem?: number
  mem?: number
  uptime?: number
  maxdisk?: number
  disk?: number
}

export async function discoverVms(req: Request, res: Response) {
  const host = req.query.host as string
  const token = req.query.token as string

  if (!host || !token) {
    res.status(400).json({ error: 'host and token query params required' })
    return
  }

  try {
    const headers: Record<string, string> = { Authorization: `PVEAPIToken=${token}` }

    const nodesRes = await fetch(`https://${host}:8006/api2/json/nodes`, { headers })
    if (!nodesRes.ok) {
      res.status(nodesRes.status).json({ error: `Proxmox API: HTTP ${nodesRes.status}` })
      return
    }
    const nodesJson = await nodesRes.json() as { data: Array<{ node: string }> }
    const nodes = nodesJson.data || []

    const vms: ProxmoxVm[] = []

    for (const n of nodes) {
      const qemuRes = await fetch(`https://${host}:8006/api2/json/nodes/${n.node}/qemu`, { headers })
      if (qemuRes.ok) {
        const qemuJson = await qemuRes.json() as { data: Array<{ vmid: number; name?: string; status: string; cpu?: number; maxmem?: number; mem?: number; uptime?: number; maxdisk?: number; disk?: number }> }
        for (const vm of qemuJson.data || []) {
          vms.push({
            vmid: vm.vmid,
            name: vm.name || `VM ${vm.vmid}`,
            type: 'qemu',
            status: vm.status,
            node: n.node,
            cpu: vm.cpu,
            maxmem: vm.maxmem,
            mem: vm.mem,
            uptime: vm.uptime,
            maxdisk: vm.maxdisk,
            disk: vm.disk,
          })
        }
      }

      const lxcRes = await fetch(`https://${host}:8006/api2/json/nodes/${n.node}/lxc`, { headers })
      if (lxcRes.ok) {
        const lxcJson = await lxcRes.json() as { data: Array<{ vmid: number; name?: string; status: string; cpu?: number; maxmem?: number; mem?: number; uptime?: number; maxdisk?: number; disk?: number }> }
        for (const ct of lxcJson.data || []) {
          vms.push({
            vmid: ct.vmid,
            name: ct.name || `CT ${ct.vmid}`,
            type: 'lxc',
            status: ct.status,
            node: n.node,
            cpu: ct.cpu,
            maxmem: ct.maxmem,
            mem: ct.mem,
            uptime: ct.uptime,
            maxdisk: ct.maxdisk,
            disk: ct.disk,
          })
        }
      }
    }

    res.json(vms)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
}

export async function vmAction(req: Request, res: Response) {
  const action = req.params.action as string

  if (!['start', 'shutdown', 'reboot'].includes(action)) {
    res.status(400).json({ error: 'action must be start, shutdown, or reboot' })
    return
  }

  const { host, node, vmid, type, token } = req.body
  if (!host || !node || vmid == null || !type || !token) {
    res.status(400).json({ error: 'host, node, vmid, type, and token are required' })
    return
  }

  try {
    const url = `https://${host}:8006/api2/json/nodes/${node}/${type}/${vmid}/status/${action}`
    const result = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `PVEAPIToken=${token}` },
    })

    if (!result.ok) {
      const body = await result.text()
      res.status(result.status).json({ error: body || `HTTP ${result.status}` })
      return
    }

    const json = await result.json()
    res.json({ ok: true, upid: json.data })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
}

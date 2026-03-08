const ICON_PATHS: Record<string, string[]> = {
  Server: [
    'M2 9h20', 'M2 15h20',
    'M2 5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5z',
    'M6 12h.01', 'M6 6h.01', 'M6 18h.01',
  ],
  Shield: [
    'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
  ],
  Network: [
    'M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l2.3 2.3a2.4 2.4 0 0 0 3.4 0l2.1-2.1a2.4 2.4 0 0 0 0-3.4L17.5 12l2.3-2.3a2.4 2.4 0 0 0 0-3.4l-2.1-2.1a2.4 2.4 0 0 0-3.4 0L12 6.5 9.7 4.2a2.4 2.4 0 0 0-3.4 0L4.2 6.3a2.4 2.4 0 0 0 0 3.4L6.5 12l-2.3 2.3a2.4 2.4 0 0 0 0 3.4z',
  ],
  Router: [
    'M12 2L2 7l10 5 10-5-10-5z',
    'M2 17l10 5 10-5',
    'M2 12l10 5 10-5',
  ],
  HardDrive: [
    'M22 12H2',
    'M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
    'M6 16h.01', 'M10 16h.01',
  ],
  Monitor: [
    'M5 3h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z',
    'M8 21h8', 'M12 17v4',
  ],
  Box: [
    'M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z',
    'M3.3 7l8.7 5 8.7-5',
    'M12 22V12',
  ],
  Cloud: [
    'M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z',
  ],
  Lock: [
    'M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2z',
    'M7 11V7a5 5 0 0 1 10 0v4',
  ],
  Wifi: [
    'M12 20h.01',
    'M2 8.82a15 15 0 0 1 20 0',
    'M5 12.859a10 10 0 0 1 14 0',
    'M8.5 16.429a5 5 0 0 1 7 0',
  ],
  MonitorDot: [
    'M5 3h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z',
    'M8 21h8', 'M12 17v4',
    'M12 11a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  ],
  CircleDot: [
    'M12 12m-10 0a10 10 0 1 0 20 0a10 10 0 1 0 -20 0',
    'M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
  ],
}

interface DeviceIconProps {
  icon: string
  x: number
  y: number
  size: number
  color: string
}

export default function DeviceIcon({ icon, x, y, size, color }: DeviceIconProps) {
  const paths = ICON_PATHS[icon]
  if (!paths) return null

  const scale = size / 24

  return (
    <g transform={`translate(${x}, ${y}) scale(${scale})`}>
      {paths.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </g>
  )
}

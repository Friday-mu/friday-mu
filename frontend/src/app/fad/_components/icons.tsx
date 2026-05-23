import type { SVGProps, ReactElement } from 'react';

type IconProps = Omit<SVGProps<SVGSVGElement>, 'stroke'> & { size?: number; stroke?: number };

const Icon = ({ children, size = 16, stroke = 1.5, ...rest }: IconProps & { children: React.ReactNode }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={stroke}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...rest}
  >
    {children}
  </svg>
);

export const IconInbox = (p: IconProps) => <Icon {...p}><path d="M2 8l2-5h8l2 5v5H2V8z"/><path d="M2 8h4l1 2h2l1-2h4"/></Icon>;
export const IconTasks = (p: IconProps) => <Icon {...p}><rect x="2" y="2.5" width="12" height="11" rx="1"/><path d="M5 6l1.5 1.5L9 5"/><path d="M5 10.5h6"/></Icon>;
export const IconCal = (p: IconProps) => <Icon {...p}><rect x="2" y="3" width="12" height="11" rx="1"/><path d="M2 6h12"/><path d="M5 2v2M11 2v2"/></Icon>;
export const IconReviews = (p: IconProps) => <Icon {...p}><path d="M8 2l1.8 3.8 4.2.4-3.1 2.9 1 4-3.9-2.2-3.9 2.2 1-4L2 6.2l4.2-.4L8 2z"/></Icon>;
export const IconProp = (p: IconProps) => <Icon {...p}><path d="M2 7l6-4 6 4v7H2V7z"/><path d="M6 14V9h4v5"/></Icon>;
export const IconOps = (p: IconProps) => <Icon {...p}><circle cx="8" cy="8" r="2"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5L13 13M3 13l1.5-1.5M11.5 4.5L13 3"/></Icon>;
export const IconFinance = (p: IconProps) => <Icon {...p}><path d="M3 4h10M3 8h10M3 12h10"/><circle cx="5.5" cy="4" r="0.8" fill="currentColor" stroke="none"/><circle cx="10.5" cy="8" r="0.8" fill="currentColor" stroke="none"/><circle cx="7" cy="12" r="0.8" fill="currentColor" stroke="none"/></Icon>;
export const IconLegal = (p: IconProps) => <Icon {...p}><path d="M8 2v12M4 5h8M4 5l-1.5 4h3L4 5zM12 5l-1.5 4h3L12 5z"/></Icon>;
export const IconGuests = (p: IconProps) => <Icon {...p}><circle cx="8" cy="6" r="2.5"/><path d="M3 14c0-2.8 2.2-5 5-5s5 2.2 5 5"/></Icon>;
export const IconOwners = (p: IconProps) => <Icon {...p}><path d="M2 7l6-4 6 4v7H2V7z"/><circle cx="8" cy="9" r="1.5"/></Icon>;
export const IconMkt = (p: IconProps) => <Icon {...p}><path d="M2 10l9-5v7L2 10z"/><path d="M5 9v3.5a1 1 0 0 0 2 0V10"/></Icon>;
export const IconLeads = (p: IconProps) => <Icon {...p}><circle cx="5" cy="6" r="2"/><circle cx="11" cy="6" r="2"/><path d="M2 13c0-2 1.5-3 3-3s3 1 3 3M8 13c0-2 1.5-3 3-3s3 1 3 3"/></Icon>;
export const IconIntel = (p: IconProps) => <Icon {...p}><path d="M2 13h12"/><path d="M4 13V9M7 13V5M10 13V7M13 13V4"/></Icon>;
export const IconSyndic = (p: IconProps) => <Icon {...p}><rect x="2" y="4" width="5" height="10"/><rect x="9" y="2" width="5" height="12"/><path d="M3.5 7h2M3.5 10h2M10.5 5h2M10.5 8h2M10.5 11h2"/></Icon>;
export const IconInterior = (p: IconProps) => <Icon {...p}><rect x="2" y="3" width="12" height="10" rx="1"/><path d="M2 9h12M8 9v4"/></Icon>;
export const IconAgency = (p: IconProps) => <Icon {...p}><path d="M3 13V6l5-3 5 3v7"/><rect x="6" y="9" width="4" height="4"/></Icon>;
export const IconSettings = (p: IconProps) => <Icon {...p}><circle cx="8" cy="8" r="2"/><path d="M8 1.5v1.5M8 13v1.5M1.5 8h1.5M13 8h1.5M3.5 3.5l1 1M11.5 11.5l1 1M3.5 12.5l1-1M11.5 4.5l1-1"/></Icon>;
export const IconBell = (p: IconProps) => <Icon {...p}><path d="M4 11V7a4 4 0 0 1 8 0v4l1 1H3l1-1z"/><path d="M7 13a1 1 0 0 0 2 0"/></Icon>;
export const IconHelp = (p: IconProps) => <Icon {...p}><circle cx="8" cy="8" r="6"/><path d="M6.5 6a1.5 1.5 0 0 1 3 0c0 1-1.5 1-1.5 2M8 10.5v0"/></Icon>;
export const IconSparkle = (p: IconProps) => <Icon {...p}><path d="M8 2v4M8 10v4M2 8h4M10 8h4M4 4l1.5 1.5M10.5 10.5L12 12M4 12l1.5-1.5M10.5 5.5L12 4"/></Icon>;
export const IconSearch = (p: IconProps) => <Icon {...p}><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5l3 3"/></Icon>;
export const IconChevron = (p: IconProps) => <Icon {...p}><path d="M6 4l4 4-4 4"/></Icon>;
export const IconClose = (p: IconProps) => <Icon {...p}><path d="M4 4l8 8M12 4l-8 8"/></Icon>;
export const IconExpand = (p: IconProps) => <Icon {...p}><path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4"/></Icon>;
export const IconSun = (p: IconProps) => <Icon {...p}><circle cx="8" cy="8" r="3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5L13 13M3 13l1.5-1.5M11.5 4.5L13 3"/></Icon>;
export const IconMoon = (p: IconProps) => <Icon {...p}><path d="M13 9a5 5 0 1 1-6-6 4 4 0 0 0 6 6z"/></Icon>;
export const IconSidebar = (p: IconProps) => <Icon {...p}><rect x="2" y="3" width="12" height="10" rx="1"/><path d="M6 3v10"/></Icon>;
export const IconArrow = (p: IconProps) => <Icon {...p}><path d="M3 8h10M9 4l4 4-4 4"/></Icon>;
export const IconSend = (p: IconProps) => <Icon {...p}><path d="M14 2L2 7l5 2 2 5 5-12z"/></Icon>;
export const IconMic = (p: IconProps) => <Icon {...p}><rect x="5" y="2" width="6" height="8" rx="3"/><path d="M3 8a5 5 0 0 0 10 0M8 13v2M5.5 15h5"/></Icon>;
export const IconStop = (p: IconProps) => <Icon {...p}><rect x="4" y="4" width="8" height="8" rx="1.5"/></Icon>;
export const IconPaperclip = (p: IconProps) => <Icon {...p}><path d="M12 7l-5 5a2.5 2.5 0 0 1-3.5-3.5l6-6a1.5 1.5 0 0 1 2 2l-5.5 5.5"/></Icon>;
export const IconAI = (p: IconProps) => <Icon {...p}><path d="M8 2l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z"/><circle cx="12.5" cy="11.5" r="1.2"/></Icon>;
export const IconCheck = (p: IconProps) => <Icon {...p}><path d="M3 8.5L6 11.5 13 4.5"/></Icon>;
export const IconPlus = (p: IconProps) => <Icon {...p}><path d="M8 3v10M3 8h10"/></Icon>;
export const IconFilter = (p: IconProps) => <Icon {...p}><path d="M2 3h12l-4.5 6V13l-3 1V9L2 3z"/></Icon>;
export const IconUsers = (p: IconProps) => <Icon {...p}><circle cx="6" cy="6" r="2.2"/><path d="M2 13c0-2.2 1.8-4 4-4s4 1.8 4 4"/><circle cx="11.5" cy="5" r="1.8"/><path d="M10 9.2c2 0 3.5 1.4 3.5 3.3"/></Icon>;
export const IconMail = (p: IconProps) => <Icon {...p}><rect x="2" y="3" width="12" height="10" rx="1"/><path d="M2 4l6 5 6-5"/></Icon>;
export const IconChat = (p: IconProps) => <Icon {...p}><path d="M2 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H6l-3 2.5V11H3a1 1 0 0 1-1-1V4z"/></Icon>;
export const IconChart = (p: IconProps) => <Icon {...p}><circle cx="8" cy="8" r="5.5"/><path d="M8 2.5V8L12 10.5"/></Icon>;
export const IconLock = (p: IconProps) => <Icon {...p}><rect x="3" y="7" width="10" height="7" rx="1"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/></Icon>;
export const IconSpark = (p: IconProps) => <Icon {...p}><path d="M2 12l3-3 3 2 4-5 2 3"/></Icon>;
export const IconBed = (p: IconProps) => <Icon {...p}><path d="M2 12V6h8a3 3 0 0 1 3 3v3M2 9h11M2 12v1M14 12v1"/></Icon>;
export const IconTool = (p: IconProps) => <Icon {...p}><path d="M11 2l3 3-2 2-3-3 2-2zM9 4l-6 6-1 4 4-1 6-6"/></Icon>;
export const IconPin = (p: IconProps) => <Icon {...p}><path d="M8 1.5c-2.5 0-4.5 2-4.5 4.5 0 3 4.5 8.5 4.5 8.5s4.5-5.5 4.5-8.5c0-2.5-2-4.5-4.5-4.5z"/><circle cx="8" cy="6" r="1.5"/></Icon>;
export const IconBook = (p: IconProps) => <Icon {...p}><path d="M3 3h4.5a2 2 0 0 1 1.5 0.6V13a2 2 0 0 0-1.5-0.6H3V3zM13 3H8.5a2 2 0 0 0-1.5 0.6V13a2 2 0 0 1 1.5-0.6H13V3z"/></Icon>;
export const IconRoad = (p: IconProps) => <Icon {...p}><path d="M4 2v12M12 2v12"/><path d="M4 4h8M4 8h8M4 12h8" strokeDasharray="2 2"/></Icon>;
export const IconRefresh = (p: IconProps) => <Icon {...p}><path d="M13 8a5 5 0 1 1-1.5-3.5L14 3v4h-4"/></Icon>;
export const IconDownload = (p: IconProps) => <Icon {...p}><path d="M8 2v9M4 8l4 4 4-4M3 14h10"/></Icon>;
export const IconClock = (p: IconProps) => <Icon {...p}><circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.5 2"/></Icon>;
export const IconGlobe = (p: IconProps) => <Icon {...p}><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12"/></Icon>;

export const ICON_MAP: Record<string, (p: IconProps) => ReactElement> = {
  IconInbox, IconTasks, IconCal, IconReviews, IconProp, IconOps,
  IconFinance, IconLegal, IconGuests, IconOwners, IconMkt, IconLeads,
  IconIntel, IconSyndic, IconInterior, IconAgency, IconSettings,
  IconBell, IconHelp, IconSparkle, IconSearch, IconChevron, IconClose,
  IconExpand, IconSun, IconMoon, IconSidebar, IconArrow, IconSend,
  IconMic, IconStop, IconPaperclip, IconAI, IconCheck, IconPlus, IconFilter, IconUsers,
  IconMail, IconChat, IconChart, IconLock, IconSpark, IconBed, IconTool,
  IconPin, IconBook, IconRoad, IconRefresh, IconDownload,
  IconClock, IconGlobe,
};

export const iconFor = (name?: string) => (name && ICON_MAP[name]) || IconInbox;

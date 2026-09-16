/**
 * Official Lucide icon library adapters.
 *
 * Replaces hand-rolled SVG paths with canonical, pixel-perfect icons from
 * the official `lucide` package, rendered as lightweight inline SVG strings.
 * Tree-shaken by Vite so only the imported icons are bundled.
 */
import {
  CheckCircle2,
  Circle,
  Download,
  FileText,
  Moon,
  PanelLeft,
  PanelLeftClose,
  Pencil,
  Plus,
  Settings,
  Sun,
  Trash2,
  Upload,
  X,
  type IconNode,
} from 'lucide';

function renderSvg(icon: IconNode, size = 16, strokeWidth = 1.75): string {
  const children = icon
    .map(([tag, attrs]) => {
      const a = Object.entries(attrs)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ');
      return `<${tag} ${a} />`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${children}</svg>`;
}

export const iconPlus = renderSvg(Plus);
export const iconX = renderSvg(X);
export const iconTrash = renderSvg(Trash2);
export const iconTask = renderSvg(Circle);
export const iconTaskDone = renderSvg(CheckCircle2);
export const iconNote = renderSvg(FileText);
export const iconGear = renderSvg(Settings);
export const iconDownload = renderSvg(Download);
export const iconUpload = renderSvg(Upload);
export const iconPencil = renderSvg(Pencil);
export const iconSidebar = renderSvg(PanelLeft);
export const iconChevronLeft = renderSvg(PanelLeftClose);
export const iconSun = renderSvg(Sun);
export const iconMoon = renderSvg(Moon);

import { useToast } from '../components/Toasts'
import { copyText } from '../lib/desktop'

/** @returns `copy`: puts text on the clipboard, then says so in a toast. */
export function useCopy() {
  const toast = useToast()
  return (text: string, message: string) => copyText(text).then(() => toast(message))
}

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { Button } from './ui/Button';
import type { InstallPromptEvent } from '@/lib/pwa';

const DISMISSED_KEY = 'vig.installPromptDismissed';

/**
 * Install invitation (F22).
 *
 * Deliberately quiet: a small bar, dismissible, and once dismissed it stays
 * dismissed. A teacher between classes should not be asked twice.
 */
export function InstallPrompt() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === 'true');

  useEffect(() => {
    function onBeforeInstall(event: Event) {
      // Chrome fires this instead of showing its own bar, but only if we
      // preventDefault — otherwise the browser handles it and this never shows.
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    }

    function onInstalled() {
      setPrompt(null);
      localStorage.setItem(DISMISSED_KEY, 'true');
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!prompt || dismissed) return null;

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, 'true');
    setDismissed(true);
  }

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice;
    // The browser allows one prompt per event; drop it either way.
    setPrompt(null);
  }

  return (
    <div className="mx-auto mb-4 flex max-w-3xl items-center gap-3 rounded-[12px] border border-line bg-lavender-2 px-4 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-lavender text-violet">
        <Download size={18} aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Install Valmiki LMS</p>
        <p className="text-xs text-ink-2">Add it to your home screen for quicker access.</p>
      </div>
      <Button size="sm" onClick={install}>
        Install
      </Button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss install prompt"
        className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-3 hover:bg-lavender"
      >
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}

let installPrompt = null;

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  window.dispatchEvent(new Event('teachflow-install-ready'));
});

window.addEventListener('appinstalled', () => {
  installPrompt = null;
  window.dispatchEvent(new Event('teachflow-installed'));
});

window.addEventListener('teachflow-install', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
});

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch((error) => {
    console.error('Không đăng ký được service worker:', error);
  }));
}

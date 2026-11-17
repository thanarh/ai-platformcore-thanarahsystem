export function getSafePostLoginPath(search: string): string {
  const candidate = new URLSearchParams(search).get('returnTo');
  if (!candidate?.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) {
    return '/chat';
  }

  try {
    const destination = new URL(candidate, 'https://thanarah.invalid');
    if (destination.origin !== 'https://thanarah.invalid') return '/chat';
    if (destination.pathname === '/login' || destination.pathname === '/register') return '/chat';
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return '/chat';
  }
}

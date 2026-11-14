/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { Storefront } from './components/Storefront.tsx';
import { AdminDashboard } from './components/AdminDashboard.tsx';

const BASE_PREFIX = ((import.meta.env.BASE_URL as string | undefined) || '/').replace(/\/+$/, '');

function getNormalizedRoute(): string {
  if (typeof window === 'undefined') return '/';
  if (window.location.hash.startsWith('#/admin')) return '/admin';
  let path = window.location.pathname || '/';
  if (BASE_PREFIX && BASE_PREFIX !== '/' && path.startsWith(BASE_PREFIX)) {
    path = path.slice(BASE_PREFIX.length) || '/';
  }
  return path.startsWith('/') ? path : `/${path}`;
}

export default function App() {
  const [route, setRoute] = useState<string>(() => getNormalizedRoute());
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  useEffect(() => {
    const onRouteChange = () => {
      setRoute(getNormalizedRoute());
    };
    const onQuotaExceeded = () => setQuotaExceeded(true);
    window.addEventListener('popstate', onRouteChange);
    window.addEventListener('hashchange', onRouteChange);
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () => {
      window.removeEventListener('popstate', onRouteChange);
      window.removeEventListener('hashchange', onRouteChange);
      window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
    };
  }, []);

  const navigate = (to: string) => {
    const normalizedTo = to.startsWith('/') ? to : `/${to}`;
    const fullTarget = `${BASE_PREFIX}${normalizedTo}` || '/';
    if (window.location.pathname !== fullTarget) {
      window.history.pushState({}, '', fullTarget);
      setRoute(normalizedTo);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <>
      {quotaExceeded && (
        <div
          role="alert"
          className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-sm flex items-center justify-between gap-4 sticky top-0 z-50 print:hidden"
        >
          <span>
            Map functionality is limited because the free Google Maps Platform quota has been exceeded.
            Wait for the quota to reset or link a Google Cloud Billing account for higher limits.{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-medium"
            >
              Learn more
            </a>
          </span>
          <button
            type="button"
            onClick={() => setQuotaExceeded(false)}
            className="text-amber-700 hover:text-amber-950 font-medium px-2 py-0.5 shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}
      {route.startsWith('/admin') ? (
        <AdminDashboard onNavigateStore={() => navigate('/')} />
      ) : (
        <Storefront onNavigateAdmin={() => navigate('/admin')} />
      )}
    </>
  );
}

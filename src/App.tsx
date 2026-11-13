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

  useEffect(() => {
    const onRouteChange = () => {
      setRoute(getNormalizedRoute());
    };
    window.addEventListener('popstate', onRouteChange);
    window.addEventListener('hashchange', onRouteChange);
    return () => {
      window.removeEventListener('popstate', onRouteChange);
      window.removeEventListener('hashchange', onRouteChange);
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

  if (route.startsWith('/admin')) {
    return <AdminDashboard onNavigateStore={() => navigate('/')} />;
  }

  return <Storefront onNavigateAdmin={() => navigate('/admin')} />;
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { Storefront } from './components/Storefront.tsx';
import { AdminDashboard } from './components/AdminDashboard.tsx';

export default function App() {
  const [pathname, setPathname] = useState<string>(() =>
    typeof window !== 'undefined' ? window.location.pathname : '/'
  );

  useEffect(() => {
    const onPopState = () => {
      setPathname(window.location.pathname);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = (to: string) => {
    if (window.location.pathname !== to) {
      window.history.pushState({}, '', to);
      setPathname(to);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  if (pathname.startsWith('/admin')) {
    return <AdminDashboard onNavigateStore={() => navigate('/')} />;
  }

  return <Storefront onNavigateAdmin={() => navigate('/admin')} />;
}

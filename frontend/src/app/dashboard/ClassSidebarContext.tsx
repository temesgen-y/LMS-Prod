'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

const SIDEBAR_COLLAPSED_KEY = 'lms_class_sidebar_collapsed';

type ClassSidebarContextValue = {
  collapsed: boolean;
  toggle: () => void;
};

const ClassSidebarContext = createContext<ClassSidebarContextValue | null>(null);

export function ClassSidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      setCollapsed(sessionStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1');
    }
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
      }
      return next;
    });
  }, []);

  const value = mounted ? { collapsed, toggle } : { collapsed: false, toggle };

  return (
    <ClassSidebarContext.Provider value={value}>
      {children}
    </ClassSidebarContext.Provider>
  );
}

export function useClassSidebar() {
  const ctx = useContext(ClassSidebarContext);
  return ctx ?? { collapsed: false, toggle: () => {} };
}

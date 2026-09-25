import { createContext, useContext } from 'react';

export type PageKey = 'site-audit' | 'issues' | 'history' | 'settings';

/** Lets any page switch the active page (App provides the setter). */
export const NavContext = createContext<(page: PageKey) => void>(() => {});
export const useNav = () => useContext(NavContext);

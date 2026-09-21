import { useEffect } from 'react';

/** Syncs the browser tab title with the given string. */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}

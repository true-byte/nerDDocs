/** @jsxImportSource react */
import { hydrateRoot } from 'react-dom/client';
import { Contents, type ContentsData } from './contents.tsx';
import './page.css';

// The look of each theme folder, so a new theme needs no import line here. Vite puts these imports first in the
// module, so each look comes before the page style in app.css: a look rule wins by its `:root[data-theme]` start.
import.meta.glob('../themes/*/look.css', { eager: true });

const data = JSON.parse(document.getElementById('nd-data')!.textContent!) as ContentsData;
hydrateRoot(document.getElementById('contents')!, <Contents initial={data} />);

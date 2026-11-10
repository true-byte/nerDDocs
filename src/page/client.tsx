/** @jsxImportSource react */
import { hydrateRoot } from 'react-dom/client';
import { Contents, type ContentsData } from './contents.tsx';
import { watchLinkCopies } from './copy-link.tsx';
import { watchCopies } from './copy.ts';
import { watchDiagrams } from './diagrams.ts';
import { watchFrames } from './frames.ts';
import { watchFullView } from './full-view.ts';
import { startAddress } from './level-address.ts';
import { watchOutline } from './outline.ts';
import './page.css';
import { holdContent, watchImageLoads } from './place-hold.ts';
import { watchBoxes } from './scroll-boxes.ts';

// The look of each theme folder, so a new theme needs no import line here. Vite puts these imports first in the
// module, so each look comes before the page style in app.css: a look rule wins by its `:root[data-theme]` start.
import.meta.glob('../themes/*/look.css', { eager: true });

const data = JSON.parse(document.getElementById('nd-data')!.textContent!) as ContentsData;
hydrateRoot(document.getElementById('contents')!, <Contents initial={data} />);
startAddress(data);
watchBoxes(document.getElementById('page')!);
watchOutline();
watchCopies();
watchLinkCopies();
watchFullView();
watchImageLoads();
holdContent(() => watchDiagrams(data.diagrams));
holdContent(() => watchFrames());

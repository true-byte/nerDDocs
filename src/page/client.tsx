/** @jsxImportSource react */
import { hydrateRoot } from 'react-dom/client';
import { Contents, type ContentsData } from './contents.tsx';
import './page.css';

const data = JSON.parse(document.getElementById('nd-data')!.textContent!) as ContentsData;
hydrateRoot(document.getElementById('contents')!, <Contents initial={data} />);

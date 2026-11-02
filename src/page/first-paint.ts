import type { PageLevels } from '../site/view.ts';
import { DEFAULT_KEY, KEPT_KEY } from './level-memory.ts';
import { colorOf, hollowStops, isFlat, levelRule, openingLevel } from './levels.ts';
import { PANEL_KEY, SHUT_KEY, SLIDER_KEY } from './panel-state.ts';

/** Text that is safe inside a script element. */
export function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/**
 * The stored level before the first paint, as `openingLevelFor` works it out. The server cannot know it, so the
 * slider in the server's HTML still shows the server's level: the style `nd-first` draws the right stop and thumb
 * and hides the row above the stops, until React moves the slider.
 */
function levelScript(page: PageLevels & { url: string }): string {
  const data = {
    url: page.url,
    ids: page.levels.map((level) => level.id),
    colors: page.levels.map((_, stop) => colorOf(stop)),
    hollow: hollowStops(page),
    author: page.defaultLevel,
    server: openingLevel(page),
    rule: levelRule('@'),
    stops: !isFlat(page),
  };
  return `(function(){
var d=${safeJson(data)},n=d.ids,w=-1,k;
try{k=JSON.parse(sessionStorage.getItem(${safeJson(KEPT_KEY)})||"{}")[d.url];if(k&&Array.isArray(k.live))w=n.indexOf(k.level)}catch(e){}
if(w<0)try{w=n.indexOf(localStorage.getItem(${safeJson(DEFAULT_KEY)}))}catch(e){}
if(w<0)w=Math.max(0,n.indexOf(d.author));
var a=w;while(a>=0&&d.hollow[a])a--;
if(a<0){a=w;while(a<n.length&&d.hollow[a])a++;if(a>=n.length)a=w}
if(n[a]===d.server)return;
var s=document.getElementById("nd-level");s.setAttribute("data-level",n[a]);s.textContent=d.rule.split("@").join(n[a]);
if(!d.stops)return;
var e=document.createElement("style");e.id="nd-first";e.textContent=".stops .stop.on{color:var(--soft);font-weight:inherit}.stops .stop:nth-child("+(a+1)+"){color:var(--c);font-weight:700}#thumb{left:"+(a+.5)/n.length*100+"%!important}.track{--c:"+d.colors[a]+"!important}.b1{visibility:hidden}";document.head.appendChild(e)
})();`;
}

/**
 * Runs in the page head, before the first paint, so a hidden panel, a closed section or a wrong level
 * never shows for a moment on each new page. React takes over once it hydrates.
 */
export function firstPaintScript(openSections: string[], page?: PageLevels & { url: string }): string {
  return `${page?.levels.length ? levelScript(page) : ''}(function(){try{
var r=document.documentElement,l=localStorage;
if(l.getItem(${safeJson(PANEL_KEY)})==="off")r.setAttribute("data-panel","off");
if(l.getItem(${safeJson(SLIDER_KEY)})==="off")r.setAttribute("data-slider","off");
var o=${safeJson(openSections)},s=JSON.parse(l.getItem(${safeJson(SHUT_KEY)})||"[]").filter(function(i){return o.indexOf(i)<0});
if(s.length){var e=document.createElement("style");e.id="nd-shut";e.textContent=s.map(function(i){var q='[data-section="'+CSS.escape(i)+'"]';return q+">ul{display:none}"+q+">.topic .i{transform:rotate(-90deg)}"}).join("");document.head.appendChild(e)}
}catch(e){}})()`;
}

/** With no script, the text comes first and the nav follows it, with every section open. */
export const NO_SCRIPT_STYLE =
  '#rail,#bar,#closeP,.p-foot,.chev svg,.marks{display:none!important}' +
  // No !important, so the level rule still hides the button at a level with no time.
  '.tl{display:inline-flex}' +
  '@media (max-width:959px){#app{display:flex;flex-direction:column}main{order:-1}' +
  '#panel{display:flex;position:static;height:auto}}';

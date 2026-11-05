import type { PageLevels } from '../site/view.ts';
import { DEFAULT_THEME, THEMES } from '../themes/index.ts';
import { DEFAULT_KEY, KEPT_KEY } from './level-memory.ts';
import { colorOf, hollowStops, isFlat, levelRule, openingLevel } from './levels.ts';
import { PANEL_KEY, SHUT_KEY, SLIDER_KEY } from './panel-state.ts';
import { CHAR_EM_MAX, CHAR_EM_MIN, CHAR_KEY, CHAR_SAMPLE, WIDTH_KEY } from './text-width.ts';
import { DARK_QUERY, MODE_KEY, THEME_KEY } from './theme-memory.ts';

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
var e=document.createElement("style");e.id="nd-first";e.textContent=".stops .stop.on{color:var(--soft);font-weight:inherit}.stops .stop:nth-child("+(a+1)+"){color:var(--c);font-weight:700}#thumb{left:"+(a+.5)/n.length*100+"%!important;--t:"+(a+.5)/n.length+"!important}.track{--c:"+d.colors[a]+"!important}.b1{visibility:hidden}";document.head.appendChild(e)
})();`;
}

/** A script expression that gives the computer's look, "dark" or "light". With no `matchMedia`, it gives "light". */
export function computerLookScript(): string {
  return `(typeof matchMedia=="function"&&matchMedia(${safeJson(DARK_QUERY)}).matches?"dark":"light")`;
}

/**
 * The stored theme and look, so a page never shows the default theme or the other look first. An unknown id or a
 * blocked storage gives the default theme, and any look setting but light or dark gives the computer's look.
 */
function themeScript(): string {
  const ids = THEMES.map((theme) => theme.id);
  return `(function(){var i=${safeJson(ids)},r=document.documentElement,t,m;
try{t=localStorage.getItem(${safeJson(THEME_KEY)});m=localStorage.getItem(${safeJson(MODE_KEY)})}catch(e){}
r.setAttribute("data-theme",i.indexOf(t)<0?${safeJson(DEFAULT_THEME)}:t);
r.setAttribute("data-mode",m==="light"||m==="dark"?m:${computerLookScript()})
})();`;
}

/** The body size and the body font stack of each theme with system fonts only and a body size in px, by theme id. */
function systemFonts(): Record<string, [string, string]> {
  const fonts: Record<string, [string, string]> = {};
  for (const theme of THEMES) {
    if (!theme.faces.length && /^\d+(\.\d+)?px$/.test(theme.shape.bodySize)) {
      fonts[theme.id] = [theme.shape.bodySize, theme.fonts.body];
    }
  }
  return fonts;
}

/**
 * The reader's text width and the character width of the theme, as `parseWidth` and `storedCharWidth` read them.
 * 'full' sets `data-width` on `<html>`, and the rest goes into the style `nd-width`. A bad value of one key leaves the
 * other key to hold. With no stored character width, a theme with system fonts only measures its body font on a
 * canvas, as `measureCharEm` of width-page.ts measures it in the text, since a system font is there before the first
 * paint.
 */
function widthScript(): string {
  return `(function(){var r=document.documentElement,t=r.getAttribute("data-theme"),h=Object.prototype.hasOwnProperty,f=${safeJson(systemFonts())},d=${safeJson(CHAR_SAMPLE)},l,w,c=null,x,s=[];
function ok(n){return typeof n=="number"&&n>=${CHAR_EM_MIN}&&n<=${CHAR_EM_MAX}}
try{l=localStorage;w=l.getItem(${safeJson(WIDTH_KEY)})}catch(e){}
if(w==="full")r.setAttribute("data-width","full");
else if(/^\\d+$/.test(w)&&+w>=1)s.push("--text-chars:"+(+w));
try{c=JSON.parse(l.getItem(${safeJson(CHAR_KEY)}));c=c&&typeof c=="object"&&!Array.isArray(c)&&h.call(c,t)?c[t]:null}catch(e){c=null}
if(!ok(c)){c=null;try{if(h.call(f,t)){x=document.createElement("canvas").getContext("2d");x.font=f[t][0]+" "+f[t][1];c=Math.round(x.measureText(d).width/d.length/parseFloat(f[t][0])*10000)/10000}}catch(e){c=null}}
if(ok(c))s.push("--char-w:"+c+"em");
if(s.length){var e=document.createElement("style");e.id="nd-width";e.textContent=":root{"+s.join(";")+"}";document.head.appendChild(e)}
})();`;
}

/**
 * Runs in the page head, before the first paint, so a wrong theme, a wrong look, a hidden panel, a closed section, a
 * wrong level or a wrong text width never shows for a moment on each new page. React takes over once it hydrates.
 */
export function firstPaintScript(openSections: string[], page?: PageLevels & { url: string }): string {
  return `${themeScript()}${widthScript()}${page?.levels.length ? levelScript(page) : ''}(function(){try{
var r=document.documentElement,l=localStorage;
if(l.getItem(${safeJson(PANEL_KEY)})==="off")r.setAttribute("data-panel","off");
if(l.getItem(${safeJson(SLIDER_KEY)})==="off")r.setAttribute("data-slider","off");
var o=${safeJson(openSections)},s=JSON.parse(l.getItem(${safeJson(SHUT_KEY)})||"[]").filter(function(i){return o.indexOf(i)<0});
if(s.length){var e=document.createElement("style");e.id="nd-shut";e.textContent=s.map(function(i){var q='[data-section="'+CSS.escape(i)+'"]';return q+">ul{display:none}"+q+">.topic .i{transform:rotate(-90deg)}"}).join("");document.head.appendChild(e)}
}catch(e){}})()`;
}

/** With no script, the text comes first and the nav follows it, with every section open. */
export const NO_SCRIPT_STYLE =
  '#rail,#bar,#closeP,#dimB,.p-foot,.chev svg,.marks,.fold,.copy,.wf-bar{display:none!important}' +
  // Only the script opens the list of dimensions, so it shows open in the flow of the panel.
  '#dimL{position:static!important;box-shadow:none!important}#dimL[hidden]{display:flex!important}' +
  // A wireframe shows in the frame inside its `noscript`, since only the script gives the other frame its document.
  '.wf-frame[data-srcdoc]{display:none!important}' +
  // No !important, so the level rule still hides the button at a level with no time.
  '.tl{display:inline-flex}' +
  // An image opens full size only with the script.
  '#page [data-full]{cursor:auto}' +
  // A diagram draws only with the script, so its source shows as code with no reserved box.
  '#page .dg{aspect-ratio:auto!important;min-height:0!important;max-height:none!important;background:none!important}' +
  '#page .dg>pre{display:block!important}' +
  '@media (max-width:959px){#app{display:flex;flex-direction:column}main{order:-1}' +
  '#panel{display:flex;position:static;height:auto}}';

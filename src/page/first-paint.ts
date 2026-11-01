import { PANEL_KEY, SHUT_KEY } from './panel-state.ts';

/** Text that is safe inside a script element. */
export function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/**
 * Runs in the page head, before the first paint, so a hidden panel or a closed section
 * never shows for a moment on each new page. React takes over once it hydrates.
 */
export function firstPaintScript(openSections: string[]): string {
  return `(function(){try{
var r=document.documentElement,l=localStorage;
if(l.getItem(${safeJson(PANEL_KEY)})==="off")r.setAttribute("data-panel","off");
var o=${safeJson(openSections)},s=JSON.parse(l.getItem(${safeJson(SHUT_KEY)})||"[]").filter(function(i){return o.indexOf(i)<0});
if(s.length){var e=document.createElement("style");e.id="nd-shut";e.textContent=s.map(function(i){var q='[data-section="'+CSS.escape(i)+'"]';return q+">ul{display:none}"+q+">.topic .i{transform:rotate(-90deg)}"}).join("");document.head.appendChild(e)}
}catch(e){}})()`;
}

/** With no script, the text comes first and the nav follows it, with every section open. */
export const NO_SCRIPT_STYLE =
  '#rail,#bar,#closeP,.chev svg{display:none!important}' +
  '@media (max-width:959px){#app{display:flex;flex-direction:column}main{order:-1}' +
  '#panel{display:flex;position:static;height:auto}}';

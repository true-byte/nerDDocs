# Read a page

::: casual
The slider at the foot of a page picks how deep, and how nerdy, the page reads. The buttons next to it show the read time, change the look and the width of the text, and copy a link to your place.

::: pro full-nerd
On a wide window, the bar at the foot of the page holds the slider, then the clock button, 'Text width', 'Defaults', 'Themes' and 'Copy link'. The slider sets how deep the page reads. The clock button shows the read time, 'Text width' sets the width of the text, 'Themes' changes the look, and 'Copy link' copies a link to your place. 'Search' sits at the top of the contents panel.

::: full-nerd
The bar floats over the page. On a phone, the bar runs along the bottom of the screen, and 'Themes' and 'Copy link' sit at the foot of the contents panel.

::: pro
The examples come from the docs of a backup app, with the levels 'Basics', 'Details' and 'Internals'.

::: full-nerd
The examples come from the docs of a backup app, with the levels 'Basics', 'Details' and 'Internals' and the page 'Restore a file' at `restore.html`. The times below are exact, down to the millisecond.
:::

## Pick a level

::: casual
Move the slider, and the page changes to that level in place. The text that you read stays where it was on the screen, and a tint marks the new text for a moment. A page opens at the level that you chose for it last, and the button 'All pages' makes a level your default for every page.

::: pro
Drag the slider, or click a stop. With the slider in focus, the arrow keys move it one stop. On a wide window, each stop shows the icon, the name and the read time of a level, in the color of that level. A page with no text at a level shows no stop for it.

The text changes in place. The block on the line 30% down the window holds its place, and the text above and below it grows or shrinks around it. The changed text shows a tint in the color of the new stop, with a bar at its left edge, and a tick at the right edge of the window marks each change that is off screen. Both fade after a moment.

A page opens at the level that you last chose for it in this tab, or else at your default. An address that names a level, such as `restore.html#internals`, opens the page at that level. After a move of the slider, the button 'All pages' makes the current level your default for every page, and the 'Defaults' button sets any level as your default. Your default holds in this browser.

::: full-nerd
The stops of the slider are the levels with text on the page, in the order of `nerddocs.json`. Each stop keeps the color of its level, and on a wide window it shows the icon, the name and the read time of that level. A drag, a click on a stop or a click on the track moves the slider. During a drag, the level changes once the thumb rests on a stop for 150 ms. With the focus on the slider, the right and up arrow keys go to the next stop and the left and down arrow keys to the stop before it. Home and End go to the first and the last stop, and the keys `1` to `9` go to the stop of that number. The link 'Go to text' moves the focus from the slider to the block on the line.

A switch swaps the text in place over 560 ms. The block on the line 30% down the window, or else the first block below the line, holds its place, and the text above and below it grows or shrinks around it. Text that leaves fades out as its room closes, and new text fades in as its room opens. When that block has no text at the new level, the text that replaces it takes the line, or else the next block that shows. At the top of the page, the page stays at the top. Moves in a row with no scroll between them hold the place of the first move, so a move back puts the text where it was. Only the text within one screen of the window moves, and the rest changes at once. With the reduced motion setting of the system, all the text changes at once.

During a switch, the changed text shows a tint in the color of the new stop, with a bar at its left edge. Where text leaves and no new text comes, a line in that color marks the place. A tick at the right edge of the window marks each changed part that is off screen, as far down the edge as the part sits down the page, and the parts at one place share one tick. The tint, the bars, the line and the ticks fade in 2.6 seconds. No tint and no tick show when every block on the screen changed.

A page opens at the level in its address, such as `restore.html#internals`. Back, Forward and a reload skip the level in the address, so the page opens at the level that you last chose for it. With no level in the address, a page opens at the level that you last chose for it in this tab. With no such level, it opens at your default level, and otherwise at the level that `defaultLevel` sets. A page with no text at that level opens at the nearest lower level with text, or else at the nearest higher level with text. An address that names a section alone, such as `restore.html#pick-a-day`, opens at the level that holds the section: the level that the page would open at when it holds the section, or else the nearest lower level with the section, or else the nearest higher one.

After a move of the slider, the button 'All pages' sets the current level as your default for every page. The 'Defaults' button sets any level as your default. When a page that you moved would open at another level, the modal 'Change 2 pages?' first lists each such page, with the count of pages in its title. Your default holds in this browser, and it replaces the level that you chose for each page.

The tab keeps the level of each page in its session storage, under `nerddocs-page-levels`. A move to the level that your default gives the page takes the page out of that list. Your default stays in the local storage of the browser, under `nerddocs-default-level`. When the browser keeps neither, such as with its storage blocked, a choice lasts until the page closes. A script in the head of the page picks the level before the page first shows, so the page never shows another level first.
:::

## See the read time

::: casual
Each stop of the slider tells how long the page takes to read at that level. The clock button shows the read time of each level, on this page and on all pages.

::: pro full-nerd
On a wide window, each stop of the slider shows the read time of the page at its level. On a phone, the row above the slider shows the read time of the current level.

::: pro
The clock button, 'Read time', opens a table with the read time of each level on 'This page' and on 'All pages'. A read time counts the words, images, diagrams and wireframes that a level shows.

::: full-nerd
After a click on 'Hide panel', and on a page with no stops, the read time shows next to the title. The clock button, 'Read time', opens a box with a table, which gives the read time of each level on 'This page' and on 'All pages'.

The read time counts the words, images, box diagrams, Mermaid diagrams and HTML wireframes that a level shows. Its words include the text of code blocks, tables and API references. A word is any text between spaces that holds a letter or a digit. In Chinese, Japanese, Thai, Lao, Khmer and Burmese, which put no spaces between words, the read time counts the words of the language. The text of a diagram or a wireframe counts no words. The title counts when the level shows a word, an image, a diagram or a wireframe.

Words read at 238 per minute, unless `wordsPerMinute` in `nerddocs.json` sets another speed. Each image, each diagram and each wireframe adds 12 seconds, and a light and dark pair adds 12 seconds once. A read time rounds up to a whole minute.
:::

## Search

::: casual
The 'Search' button finds the words that you type, in the text of every level. A hit opens its page at the level that holds the words, and the words light up.

::: pro
The 'Search' button at the top of the contents panel opens the search box, and so does `Ctrl+K`, or `Cmd+K` on a Mac. Type words in the field 'Search', and the hits show under it. The search finds the words in the text of every level, and a hit holds each word that you type. The last word also matches the start of a word, so `sched` finds the 'Schedules' page.

The up and down arrow keys move through the hits, and Enter or a click opens one. The page opens at the level of the hit, and the matched words light up for 2 seconds. Esc closes the box.

::: full-nerd
The 'Search' button at the top of the contents panel opens the search box. With the contents panel hidden, the button sits under 'Show contents'. `Ctrl+K`, or `Cmd+K` on a Mac, opens the box from anywhere on the page. On a phone, the button sits at the top of the contents panel too, and the box fills the screen.

Type words in the field 'Search', and the hits show under it. The search finds the words in the text of every level. A hit holds each word that you type, in its text, in its heading or in its page title. The last word also matches the start of a word, so `sched` finds the 'Schedules' page. A word of 5 letters or more also matches with one letter wrong. A word such as `Ctrl+R` or `REQ-2.1` matches whole, and `ctrl` also finds `Ctrl+R`.

Each hit shows the icons of the levels of its text, its page title and its heading. Under them, it shows its text with the matched words marked. The hits that your level of each page shows come first. On a site with dimensions, the hits of the other dimensions follow under the name of their dimension.

The up and down arrow keys move through the hits. Enter or a click opens a hit, and a middle click opens its page in a new tab, at its level and its heading. Esc, a click outside the box or 'Close search' closes the box.

A hit opens its page at the level of the hit, with its text on the line 30% down the window. So a search for `Ctrl+R` opens the 'Restore a file' page at a level that holds `Ctrl+R`. The matched words light up for 2 seconds.

Search runs in the browser. MiniSearch indexes the text of every page on the first search, and each save of the docs shows in the next search, with no reload.
:::

## Share a link

::: casual
The 'Copy link' button copies the address of your place on the page. The address names your level and your section, so it opens the page at the same level and place.

::: pro full-nerd
The 'Copy link' button is the last button of the bar. It copies the address of your place, which names the level and then the section that you read, such as `restore.html#internals/pick-a-day`. That address opens the page at the same level and place. At the top of the page, the address names the level alone, such as `restore.html#internals`.

::: pro
On a phone, the button sits at the foot of the contents panel.

::: full-nerd
After a click on 'Hide panel', the button sits next to the title. On a phone, it sits at the foot of the contents panel, and on a phone with a share sheet, it opens the share sheet in place of the copy. After a copy, the button shows a check for 1.5 seconds.

The section of the address is the heading of the bold row of the outline. On a page with no levels, the address names the section alone, and nothing at the top of the page.

The address in the browser follows your place in the same way. Each scroll, level change or change of the window size replaces the address, so Back never steps through your places.
:::

## Pick a theme

::: casual
The 'Themes' button opens a list of themes, with a sample page that shows each theme before you pick it. The theme that you pick shows on every page in that browser.

::: pro full-nerd
The 'Themes' button in the bar opens a box with the list of themes and a sample page. On a phone, the button sits at the foot of the contents panel. A click on a theme shows it on the sample page.

::: full-nerd
Type a part of a theme name in 'Search' to list only the themes with that name. The up and down arrow keys move through the list.

::: pro full-nerd
The list holds these themes, in this order: 'Themelessness', 'I love MSDOS', 'Original Nerd', 'I'm in', 'I void warranties', 'I fly spaceships' and 'I'm a serious person'. A page shows 'Themelessness' until you pick another theme.

::: pro
The switch 'Light', 'Dark' and 'System' sets the look. 'Apply', or Enter, puts the theme and the look on every page in that browser, and 'Cancel' or Esc changes nothing.

::: full-nerd
The switch 'Light', 'Dark' and 'System' sets the look, and 'System' follows the light or dark setting of the computer. The sample page and the list show that look at once. 'Apply', or Enter, changes the theme and the look of every page in that browser. 'Cancel', Esc or a click outside the box closes the box and changes nothing.
:::

## Set the text width

::: casual
On a wide window, the 'Text width' button shows a ruler at the top of the window. Drag the ruler to set how many characters a line of text holds on every page. The text also narrows with the window.

::: full-nerd
A line of text holds the characters that `textWidth` in `nerddocs.json` sets, 75 by default, counted in the body font of the theme. The text narrows with the window down to a column of 288 px, and a window narrower than 320 px scrolls sideways. A window narrower than 960 px has no 'Text width' button.

::: pro full-nerd
In a window 960 px wide or wider, the 'Text width' button in the bar opens a menu. 'Show ruler' shows the ruler at the top of the window, and 'Restore default' sets the width of `textWidth` again. Drag either handle of the ruler, or click the ruler, and both edges of the text move. The number in the middle of the ruler is the width in characters.

::: pro
'Apply' keeps the width on every page in that browser. The text also narrows with the window.

::: full-nerd
With the focus on the right handle, the arrow keys step 5 characters, and Page Up and Page Down step 25. Home gives the narrowest text, and End makes the text as wide as the page allows.

'Restore' sets the width that the ruler opened with. 'Apply', or a click on 'Text width', closes the ruler and keeps the width. Your width holds on every page in that browser. Each change of the width keeps the text on the line 30% down the window in place, and a page scrolled to the top stays at the top.
:::

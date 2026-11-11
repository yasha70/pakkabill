#!/usr/bin/env python3
"""Builds the hand-written design files into index.html (the site has no other build step).

    python3 design/build.py

- design/official.css: PakkaBill's look (colours, headings, cards, menus). It goes between the
  /*pb-official*/ ... /*/pb-official*/ marks, in a <style id="pb-official"> placed straight after
  the app's main styles, so it wins over them.
- design/home-gate.html, design/home.css, design/home.html: the home page. They go between the
  <!--pb-home--> ... <!--/pb-home--> marks.
"""
import pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
D = ROOT / 'design'
A, B = '/*pb-official*/', '/*/pb-official*/'
HA, HB = '<!--pb-home-->', '<!--/pb-home-->'


def minify(css: str) -> str:
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    css = re.sub(r'\s*\n\s*', '', css)
    return css.strip()


def read(name: str) -> str:
    return (D / name).read_text(encoding='utf-8')


def main():
    page = ROOT / 'index.html'
    html = page.read_text(encoding='utf-8')

    css = minify(read('official.css'))
    block = f'{A}{css}{B}'
    if A in html:
        i, j = html.index(A), html.index(B) + len(B)
        html = html[:i] + block + html[j:]
    else:
        # first run: after the main style sheet and the <title>, before <meta name="description">
        mark = '</title>\n<meta name="description"'
        assert html.count(mark) == 1, 'cannot find where the main styles end'
        html = html.replace(mark, f'</title><style id="pb-official">{block}</style>\n<meta name="description"')

    gate = read('home-gate.html')
    assert gate.startswith(HA), 'design/home-gate.html must start with <!--pb-home-->'
    home = gate.rstrip('\n') + '\n<style id="pb-home-css">' + minify(read('home.css')) + '</style>\n' + read('home.html').rstrip('\n') + '\n'
    assert html.count(HA) == 1 and html.count(HB) == 1, 'cannot find the home page marks'
    i, j = html.index(HA), html.index(HB)
    html = html[:i] + home + html[j:]

    page.write_text(html, encoding='utf-8')
    print(f'index.html: official.css {len(css):,} characters, home page {len(home):,} characters')


if __name__ == '__main__':
    main()

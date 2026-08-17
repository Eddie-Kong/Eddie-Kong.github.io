#!/usr/bin/env python3
"""Generate and verify the site's derived files.

Three things are derived from the HTML pages rather than maintained by hand,
because hand-maintained copies of the same facts always drift apart:

    sitemap.xml             every indexable page
    feed.xml                RSS, built from data/posts.json
    data/search-index.json  the client-side search index

Usage
-----
    python tools/gen.py           write the three files
    python tools/gen.py --check   fail if they are stale, or if a link is broken

Standard library only, and no f-strings in anger, so it runs on the Python
that is already on this machine (3.8) as well as anything newer. Nothing to
install.
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from email.utils import format_datetime
from html.parser import HTMLParser
from xml.sax.saxutils import escape

SITE = "https://eddiekong.com"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Pages that exist but should stay out of the sitemap and the search index.
EXCLUDE = {"404.html", "search.html"}

# Directories never worth walking into.
SKIP_DIRS = {".git", ".github", "tools", "node_modules"}

# Text inside these elements is chrome, not content.
SKIP_TEXT_TAGS = {"script", "style", "nav", "footer", "template"}

FEED_TITLE = "The Bedlington Journal"
FEED_DESCRIPTION = "Longer pieces about living with a Bedlington Terrier."


# --------------------------------------------------------------------------
# parsing
# --------------------------------------------------------------------------

class PageParser(HTMLParser):
    """Pulls the title, the main-content text, and every local link."""

    def __init__(self):
        HTMLParser.__init__(self, convert_charrefs=True)
        self.title = ""
        self.chunks = []
        self.links = []
        self._in_title = False
        self._skip_depth = 0
        self._main_depth = 0
        self._skip_stack = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)

        for key in ("href", "src"):
            value = attrs.get(key)
            if value:
                self.links.append(value)

        if tag == "title":
            self._in_title = True
        if tag == "main":
            self._main_depth += 1
        if tag in SKIP_TEXT_TAGS:
            self._skip_depth += 1
            self._skip_stack.append(tag)

    def handle_startendtag(self, tag, attrs):
        attrs = dict(attrs)
        for key in ("href", "src"):
            value = attrs.get(key)
            if value:
                self.links.append(value)

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
        if tag == "main" and self._main_depth:
            self._main_depth -= 1
        if tag in SKIP_TEXT_TAGS and self._skip_stack and self._skip_stack[-1] == tag:
            self._skip_stack.pop()
            self._skip_depth -= 1

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        elif self._main_depth and not self._skip_depth:
            self.chunks.append(data)

    @property
    def text(self):
        return re.sub(r"\s+", " ", "".join(self.chunks)).strip()


def html_files():
    """Every .html file in the repo, as repo-relative POSIX paths."""
    found = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".")]
        for name in filenames:
            if name.endswith(".html"):
                full = os.path.join(dirpath, name)
                found.append(os.path.relpath(full, ROOT).replace(os.sep, "/"))
    return sorted(found)


def url_for(relpath):
    """index.html files become directory URLs; everything else keeps its name."""
    if relpath == "index.html":
        return "/"
    if relpath.endswith("/index.html"):
        return "/" + relpath[: -len("index.html")]
    return "/" + relpath


def parse_page(relpath):
    with open(os.path.join(ROOT, relpath), "r", encoding="utf-8") as handle:
        parser = PageParser()
        parser.feed(handle.read())
    return parser


# --------------------------------------------------------------------------
# derived files
# --------------------------------------------------------------------------

def build_search_index(pages):
    entries = []
    for relpath, parser in pages:
        if os.path.basename(relpath) in EXCLUDE or relpath in EXCLUDE:
            continue
        entries.append({
            "url": url_for(relpath),
            "title": parser.title.strip(),
            "text": parser.text,
        })
    entries.sort(key=lambda e: e["url"])
    payload = {
        "generated_by": "tools/gen.py",
        "pages": entries,
    }
    return json.dumps(payload, indent=2, ensure_ascii=False, sort_keys=True) + "\n"


def build_sitemap(pages):
    urls = []
    for relpath, _ in pages:
        if os.path.basename(relpath) in EXCLUDE or relpath in EXCLUDE:
            continue
        urls.append(SITE + url_for(relpath))
    urls.sort()

    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for url in urls:
        lines.append("  <url><loc>" + escape(url) + "</loc></url>")
    lines.append("</urlset>")
    return "\n".join(lines) + "\n"


def build_feed():
    with open(os.path.join(ROOT, "data", "posts.json"), "r", encoding="utf-8") as handle:
        posts = json.load(handle).get("posts", [])

    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
             "  <channel>",
             "    <title>" + escape(FEED_TITLE) + "</title>",
             "    <link>" + SITE + "/blog/</link>",
             "    <description>" + escape(FEED_DESCRIPTION) + "</description>",
             "    <language>en</language>",
             '    <atom:link href="' + SITE + '/feed.xml" rel="self" type="application/rss+xml"/>']

    for post in posts:
        published = datetime.strptime(post["date"], "%Y-%m-%d").replace(tzinfo=timezone.utc)
        link = SITE + post["url"]
        lines += [
            "    <item>",
            "      <title>" + escape(post["title"]) + "</title>",
            "      <link>" + escape(link) + "</link>",
            "      <guid isPermaLink=\"true\">" + escape(link) + "</guid>",
            "      <pubDate>" + format_datetime(published) + "</pubDate>",
            "      <description>" + escape(post["summary"]) + "</description>",
            "    </item>",
        ]

    lines += ["  </channel>", "</rss>"]
    return "\n".join(lines) + "\n"


# --------------------------------------------------------------------------
# link checking
# --------------------------------------------------------------------------

EXTERNAL = re.compile(r"^(https?:|mailto:|tel:|data:|javascript:|//)", re.I)


def check_links(pages):
    problems = []
    for relpath, parser in pages:
        base = os.path.dirname(relpath)
        for raw in parser.links:
            link = raw.strip()
            if not link or link.startswith("#") or EXTERNAL.match(link):
                continue

            path = link.split("#", 1)[0].split("?", 1)[0]
            if not path:
                continue

            if path.startswith("/"):
                target = path.lstrip("/")
            else:
                target = os.path.normpath(os.path.join(base, path)).replace(os.sep, "/")

            if target.endswith("/") or target == "":
                target = target + "index.html"

            if not os.path.exists(os.path.join(ROOT, target)):
                problems.append(relpath + " → " + raw + "  (expected " + target + ")")
    return problems


def check_json():
    problems = []
    data_dir = os.path.join(ROOT, "data")
    if not os.path.isdir(data_dir):
        return ["data/ directory is missing"]
    for name in sorted(os.listdir(data_dir)):
        if not name.endswith(".json"):
            continue
        path = os.path.join(data_dir, name)
        try:
            with open(path, "r", encoding="utf-8") as handle:
                json.load(handle)
        except ValueError as err:
            problems.append("data/" + name + " is not valid JSON: " + str(err))
    return problems


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------

def render_all(pages):
    return {
        "sitemap.xml": build_sitemap(pages),
        "feed.xml": build_feed(),
        "data/search-index.json": build_search_index(pages),
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true",
                    help="verify instead of writing; non-zero exit if anything is off")
    args = ap.parse_args()

    relpaths = html_files()
    pages = [(relpath, parse_page(relpath)) for relpath in relpaths]
    rendered = render_all(pages)

    if args.check:
        problems = check_links(pages) + check_json()
        for relative, expected in sorted(rendered.items()):
            full = os.path.join(ROOT, relative.replace("/", os.sep))
            if not os.path.exists(full):
                problems.append(relative + " is missing — run: python tools/gen.py")
                continue
            with open(full, "r", encoding="utf-8") as handle:
                if handle.read() != expected:
                    problems.append(relative + " is stale — run: python tools/gen.py")

        if problems:
            print("FAIL (" + str(len(problems)) + ")")
            for problem in problems:
                print("  - " + problem)
            return 1

        print("OK — " + str(len(pages)) + " pages, "
              + str(len(rendered)) + " generated files up to date, no broken links")
        return 0

    # Write first: the generated files are themselves link targets, so
    # checking before writing reports false breakage on a fresh clone.
    for relative, content in sorted(rendered.items()):
        full = os.path.join(ROOT, relative.replace("/", os.sep))
        with open(full, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(content)
        print("wrote " + relative)

    problems = check_links(pages) + check_json()
    if problems:
        print("WARNING (" + str(len(problems)) + "):")
        for problem in problems:
            print("  - " + problem)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())

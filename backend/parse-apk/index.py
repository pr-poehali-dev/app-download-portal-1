"""
Парсинг информации об APK-файле по URL.
Определяет название приложения, версию, размер и другие метаданные
из популярных источников: APKMirror, F-Droid, APKPure, GitHub Releases.
"""
import json
import re
import urllib.request
import urllib.parse
from html.parser import HTMLParser


CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
}


class MetaParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.title = ""
        self.metas = {}
        self._in_title = False

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        if tag == "title":
            self._in_title = True
        if tag == "meta":
            name = attrs_dict.get("name") or attrs_dict.get("property") or ""
            content = attrs_dict.get("content", "")
            if name and content:
                self.metas[name.lower()] = content

    def handle_data(self, data):
        if self._in_title:
            self.title += data

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False


def fetch_html(url: str) -> str:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36",
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "ru,en;q=0.9",
        },
    )
    with urllib.request.urlopen(req, timeout=12) as resp:
        charset = "utf-8"
        ct = resp.headers.get("Content-Type", "")
        m = re.search(r"charset=([\w-]+)", ct)
        if m:
            charset = m.group(1)
        return resp.read().decode(charset, errors="replace")


def parse_version(text: str) -> str:
    m = re.search(r"\b(\d+[\.\d]+(?:[-_]\w+)?)\b", text)
    return m.group(1) if m else ""


def parse_size(text: str) -> str:
    m = re.search(r"(\d+[\.,]?\d*\s*(?:MB|KB|GB|МБ|КБ|ГБ))", text, re.IGNORECASE)
    return m.group(1).strip() if m else ""


def extract_apkmirror(html: str, url: str) -> dict:
    name_m = re.search(r'<h1[^>]*class="[^"]*app-name[^"]*"[^>]*>(.*?)</h1>', html, re.S)
    name = re.sub(r"<[^>]+>", "", name_m.group(1)).strip() if name_m else ""

    ver_m = re.search(r'softwareVersion"[^>]*>\s*([\d\.]+)', html)
    version = ver_m.group(1).strip() if ver_m else parse_version(url)

    size_m = re.search(r'(?:File size|Размер)[^\d]*(\d+[\.,]?\d*\s*(?:MB|KB))', html, re.I)
    size = size_m.group(1).strip() if size_m else ""

    pkg_m = re.search(r'/apk/([\w\.]+)/', url)
    package = pkg_m.group(1).replace("-", ".") if pkg_m else ""

    return {"name": name, "version": version, "size": size, "packageName": package, "source": "apkmirror.com"}


def extract_fdroid(html: str, url: str) -> dict:
    name_m = re.search(r'<h3[^>]*class="[^"]*package-name[^"]*"[^>]*>(.*?)</h3>', html, re.S)
    if not name_m:
        name_m = re.search(r'<h2[^>]*itemprop="name"[^>]*>(.*?)</h2>', html, re.S)
    name = re.sub(r"<[^>]+>", "", name_m.group(1)).strip() if name_m else ""

    ver_m = re.search(r'Version[^\d]*(\d+[\.\d]+)', html)
    version = ver_m.group(1).strip() if ver_m else ""

    pkg_m = re.search(r'/packages/([\w\.]+)', url)
    package = pkg_m.group(1) if pkg_m else ""

    return {"name": name, "version": version, "size": "", "packageName": package, "source": "f-droid.org"}


def extract_github(html: str, url: str) -> dict:
    name_m = re.search(r'<strong[^>]*itemprop="name"[^>]*>(.*?)</strong>', html, re.S)
    if not name_m:
        name_m = re.search(r'"repository"[^{]*{[^}]*"name"\s*:\s*"([^"]+)"', html)
    name = re.sub(r"<[^>]+>", "", name_m.group(1)).strip() if name_m else url.split("/")[-3] if "/releases" in url else ""

    tag_m = re.search(r'/releases/tag/([^"\'>\s]+)', html)
    version = tag_m.group(1).lstrip("v") if tag_m else ""

    apk_m = re.search(r'href="([^"]*\.apk)"', html)
    apk_url = "https://github.com" + apk_m.group(1) if apk_m else ""

    size_m = re.search(r'(\d+[\.,]?\d*\s*(?:MB|KB|GB))', html, re.I)
    size = size_m.group(1).strip() if size_m else ""

    return {"name": name, "version": version, "size": size, "packageName": "", "source": "github.com", "downloadUrl": apk_url}


def extract_generic(html: str, url: str) -> dict:
    parser = MetaParser()
    parser.feed(html[:50000])

    name = (
        parser.metas.get("og:title")
        or parser.metas.get("twitter:title")
        or parser.title
        or ""
    )
    name = re.sub(r"\s*[-|–]\s*.*$", "", name).strip()

    version = parse_version(parser.metas.get("og:description", "") + " " + parser.title)
    size = parse_size(html[:30000])

    pkg_m = re.search(r'(?:id|package)=([\w\.]+)', url)
    package = pkg_m.group(1) if pkg_m else ""

    domain = urllib.parse.urlparse(url).netloc.replace("www.", "")

    return {"name": name, "version": version, "size": size, "packageName": package, "source": domain}


def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    try:
        body = json.loads(event.get("body") or "{}")
        url = body.get("url", "").strip()

        if not url:
            return {"statusCode": 400, "headers": CORS_HEADERS, "body": json.dumps({"error": "URL обязателен"})}

        if not url.startswith("http"):
            url = "https://" + url

        html = fetch_html(url)
        parsed_url = urllib.parse.urlparse(url)
        domain = parsed_url.netloc.lower()

        if "apkmirror.com" in domain:
            info = extract_apkmirror(html, url)
        elif "f-droid.org" in domain:
            info = extract_fdroid(html, url)
        elif "github.com" in domain:
            info = extract_github(html, url)
        else:
            info = extract_generic(html, url)

        info["url"] = url

        if not info.get("name"):
            info["name"] = parsed_url.path.split("/")[-1] or domain

        return {
            "statusCode": 200,
            "headers": CORS_HEADERS,
            "body": json.dumps({"ok": True, "data": info}, ensure_ascii=False),
        }

    except Exception as e:
        return {
            "statusCode": 500,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": str(e)}, ensure_ascii=False),
        }

import { useState } from "react";
import Icon from "@/components/ui/icon";

const PARSE_APK_URL = "https://functions.poehali.dev/fc1e3d06-9e20-4633-977b-165ba595ec03";

type TabType = "search" | "downloads" | "library";

interface ApkVersion {
  version: string;
  date: string;
  size: string;
  notes?: string;
}

interface ApkFile {
  id: string;
  name: string;
  packageName: string;
  icon: string;
  versions: ApkVersion[];
  currentVersion: string;
  size: string;
  source: string;
  downloadDate: string;
  isFavorite: boolean;
}

interface Download {
  id: string;
  name: string;
  url: string;
  progress: number;
  status: "fetching" | "downloading" | "done" | "error";
  size?: string;
  version?: string;
}

const MOCK_FILES: ApkFile[] = [
  {
    id: "1",
    name: "Telegram",
    packageName: "org.telegram.messenger",
    icon: "MessageCircle",
    versions: [
      { version: "10.14.5", date: "2024-03-01", size: "68.4 МБ", notes: "Улучшена производительность" },
      { version: "10.13.2", date: "2024-02-10", size: "67.1 МБ" },
      { version: "10.12.0", date: "2024-01-15", size: "66.8 МБ" },
    ],
    currentVersion: "10.14.5",
    size: "68.4 МБ",
    source: "apkmirror.com",
    downloadDate: "2024-03-05",
    isFavorite: true,
  },
  {
    id: "2",
    name: "VLC Player",
    packageName: "org.videolan.vlc",
    icon: "Play",
    versions: [
      { version: "3.6.0", date: "2024-02-28", size: "24.2 МБ" },
      { version: "3.5.4", date: "2024-01-20", size: "23.8 МБ" },
    ],
    currentVersion: "3.6.0",
    size: "24.2 МБ",
    source: "videolan.org",
    downloadDate: "2024-03-01",
    isFavorite: false,
  },
  {
    id: "3",
    name: "Obsidian",
    packageName: "md.obsidian",
    icon: "FileText",
    versions: [
      { version: "1.5.12", date: "2024-03-03", size: "92.1 МБ", notes: "Новые плагины" },
      { version: "1.5.8", date: "2024-02-15", size: "91.4 МБ" },
    ],
    currentVersion: "1.5.12",
    size: "92.1 МБ",
    source: "obsidian.md",
    downloadDate: "2024-03-04",
    isFavorite: true,
  },
];

const MOCK_DOWNLOADS: Download[] = [
  {
    id: "d1",
    name: "Firefox Nightly",
    url: "https://apkmirror.com/firefox-nightly",
    progress: 72,
    status: "downloading",
    size: "87.3 МБ",
    version: "124.0a1",
  },
  {
    id: "d2",
    name: "K-9 Mail",
    url: "https://f-droid.org/k9",
    progress: 100,
    status: "done",
    size: "15.8 МБ",
    version: "6.802",
  },
];

export default function Index() {
  const [activeTab, setActiveTab] = useState<TabType>("search");
  const [url, setUrl] = useState("");
  const [downloads, setDownloads] = useState<Download[]>(MOCK_DOWNLOADS);
  const [files, setFiles] = useState<ApkFile[]>(MOCK_FILES);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showFavorites, setShowFavorites] = useState(false);
  const [fetching, setFetching] = useState(false);

  const handleAddUrl = async () => {
    if (!url.trim()) return;
    const downloadId = Date.now().toString();
    const inputUrl = url.trim();

    const newDownload: Download = {
      id: downloadId,
      name: inputUrl.split("/").filter(Boolean).pop() || "Приложение",
      url: inputUrl,
      progress: 0,
      status: "fetching",
    };
    setDownloads((prev) => [newDownload, ...prev]);
    setUrl("");
    setFetching(true);
    setActiveTab("downloads");

    try {
      const res = await fetch(PARSE_APK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: inputUrl }),
      });
      const json = await res.json();

      if (json.ok && json.data) {
        const { name, version, size, source } = json.data;
        setDownloads((prev) =>
          prev.map((d) =>
            d.id === downloadId
              ? {
                  ...d,
                  name: name || d.name,
                  version: version || undefined,
                  size: size || undefined,
                  status: "downloading",
                  progress: 20,
                }
              : d
          )
        );

        // Simulate download progress
        let progress = 20;
        const interval = setInterval(() => {
          progress += Math.floor(Math.random() * 12) + 4;
          if (progress >= 100) {
            progress = 100;
            clearInterval(interval);
            setDownloads((prev) =>
              prev.map((d) => (d.id === downloadId ? { ...d, progress: 100, status: "done" } : d))
            );
          } else {
            setDownloads((prev) =>
              prev.map((d) => (d.id === downloadId ? { ...d, progress } : d))
            );
          }
        }, 600);
      } else {
        setDownloads((prev) =>
          prev.map((d) => (d.id === downloadId ? { ...d, status: "error" } : d))
        );
      }
    } catch {
      setDownloads((prev) =>
        prev.map((d) => (d.id === downloadId ? { ...d, status: "error" } : d))
      );
    } finally {
      setFetching(false);
    }
  };

  const toggleFavorite = (id: string) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, isFavorite: !f.isFavorite } : f))
    );
  };

  const filteredFiles = files.filter((f) => {
    const matchesSearch =
      f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.packageName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFav = showFavorites ? f.isFavorite : true;
    return matchesSearch && matchesFav;
  });

  const tabs: { id: TabType; label: string; icon: string; count?: number }[] = [
    { id: "search", label: "Поиск", icon: "Link" },
    {
      id: "downloads",
      label: "Загрузки",
      icon: "Download",
      count: downloads.filter((d) => d.status === "downloading").length || undefined,
    },
    { id: "library", label: "Файлы", icon: "Archive", count: files.length },
  ];

  return (
    <div className="min-h-screen bg-white font-sans">
      {/* Header */}
      <header className="border-b border-zinc-100 px-6 py-4 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur-sm z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-zinc-900 rounded flex items-center justify-center">
            <Icon name="Package" size={14} className="text-white" />
          </div>
          <span className="text-sm font-semibold tracking-tight text-zinc-900">APKStore</span>
        </div>
        <nav className="flex items-center gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-1.5 px-3.5 py-1.5 rounded text-xs font-medium transition-all ${
                activeTab === tab.id
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50"
              }`}
            >
              <Icon name={tab.icon} size={13} />
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={`ml-0.5 text-[10px] font-mono px-1 rounded-full leading-4 ${
                    activeTab === tab.id
                      ? "bg-white/20 text-white"
                      : "bg-zinc-200 text-zinc-600"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10">

        {/* SEARCH TAB */}
        {activeTab === "search" && (
          <div className="animate-fade-in">
            <div className="mb-10">
              <h1 className="text-2xl font-light text-zinc-900 mb-1 tracking-tight">Добавить приложение</h1>
              <p className="text-sm text-zinc-400">Вставьте ссылку на APK-файл или страницу приложения</p>
            </div>

            <div className="border border-zinc-200 rounded-lg overflow-hidden mb-2 focus-within:border-zinc-400 transition-colors">
              <div className="flex items-center gap-3 px-4 py-3.5">
                <Icon name="Link" size={15} className="text-zinc-300 flex-shrink-0" />
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddUrl()}
                  placeholder="https://apkmirror.com/apk/..."
                  className="flex-1 text-sm text-zinc-900 placeholder:text-zinc-300 outline-none font-mono bg-transparent"
                />
                {url && (
                  <button
                    onClick={() => setUrl("")}
                    className="text-zinc-300 hover:text-zinc-500 transition-colors"
                  >
                    <Icon name="X" size={14} />
                  </button>
                )}
              </div>
            </div>

            <button
              onClick={handleAddUrl}
              disabled={!url.trim() || fetching}
              className="w-full bg-zinc-900 text-white text-sm font-medium py-3 rounded-lg hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              {fetching ? "Получаем информацию..." : "Загрузить"}
            </button>

            <div className="mt-10 pt-8 border-t border-zinc-100">
              <p className="text-xs text-zinc-400 mb-3 uppercase tracking-wider font-medium">
                Поддерживаемые источники
              </p>
              <div className="grid grid-cols-3 gap-2">
                {["APKMirror", "F-Droid", "APKPure", "Uptodown", "APKCombo", "GitHub Releases"].map((src) => (
                  <div
                    key={src}
                    className="px-3 py-2 border border-zinc-100 rounded text-xs text-zinc-500 text-center hover:border-zinc-200 transition-colors"
                  >
                    {src}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* DOWNLOADS TAB */}
        {activeTab === "downloads" && (
          <div className="animate-fade-in">
            <div className="mb-8">
              <h1 className="text-2xl font-light text-zinc-900 mb-1 tracking-tight">Загрузки</h1>
              <p className="text-sm text-zinc-400">{downloads.length} файлов</p>
            </div>

            <div className="space-y-2">
              {downloads.map((dl, i) => (
                <div
                  key={dl.id}
                  className="border border-zinc-100 rounded-lg px-4 py-4 animate-fade-in"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-zinc-900">{dl.name}</p>
                      <p className="text-xs text-zinc-400 font-mono mt-0.5 truncate">{dl.url}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                      {dl.version && (
                        <span className="text-xs font-mono bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded">
                          v{dl.version}
                        </span>
                      )}
                      {dl.status === "done" && (
                        <div className="w-5 h-5 bg-zinc-900 rounded-full flex items-center justify-center">
                          <Icon name="Check" size={11} className="text-white" />
                        </div>
                      )}
                      {dl.status === "downloading" && (
                        <Icon name="Loader" size={15} className="text-zinc-400 animate-spin" />
                      )}
                      {dl.status === "fetching" && (
                        <Icon name="Globe" size={15} className="text-zinc-400 animate-pulse" />
                      )}
                      {dl.status === "error" && (
                        <Icon name="AlertCircle" size={15} className="text-red-400" />
                      )}
                    </div>
                  </div>

                  {(dl.status === "downloading" || dl.status === "fetching") && (
                    <div>
                      <div className="h-px bg-zinc-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-zinc-900 rounded-full transition-all duration-500"
                          style={{ width: `${dl.progress}%` }}
                        />
                      </div>
                      <div className="flex justify-between mt-1.5">
                        <span className="text-xs text-zinc-400">
                          {dl.status === "fetching" ? "Получаем данные..." : `${dl.progress}%`}
                        </span>
                        {dl.size && <span className="text-xs text-zinc-400">{dl.size}</span>}
                      </div>
                    </div>
                  )}

                  {dl.status === "done" && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-400">Загрузка завершена</span>
                      {dl.size && (
                        <span className="text-xs font-mono text-zinc-400">{dl.size}</span>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {downloads.length === 0 && (
                <div className="text-center py-16 text-zinc-300">
                  <Icon name="Download" size={32} className="mx-auto mb-3 opacity-40" />
                  <p className="text-sm">Нет активных загрузок</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* LIBRARY TAB */}
        {activeTab === "library" && (
          <div className="animate-fade-in">
            <div className="mb-6">
              <h1 className="text-2xl font-light text-zinc-900 mb-1 tracking-tight">Скачанные файлы</h1>
              <p className="text-sm text-zinc-400">{files.length} приложений</p>
            </div>

            <div className="flex gap-2 mb-6">
              <div className="flex-1 flex items-center gap-2 border border-zinc-200 rounded-lg px-3 py-2.5 focus-within:border-zinc-400 transition-colors">
                <Icon name="Search" size={14} className="text-zinc-300 flex-shrink-0" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Поиск по названию или пакету..."
                  className="flex-1 text-sm text-zinc-900 placeholder:text-zinc-300 outline-none bg-transparent"
                />
              </div>
              <button
                onClick={() => setShowFavorites(!showFavorites)}
                className={`flex items-center gap-1.5 px-3 py-2 border rounded-lg text-xs font-medium transition-all ${
                  showFavorites
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 text-zinc-500 hover:border-zinc-400 hover:text-zinc-900"
                }`}
              >
                <Icon name="Star" size={13} />
                Избранное
              </button>
            </div>

            <div className="space-y-2">
              {filteredFiles.map((file, i) => (
                <div
                  key={file.id}
                  className="border border-zinc-100 rounded-lg overflow-hidden animate-fade-in"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div
                    className="flex items-center gap-4 px-4 py-3.5 cursor-pointer hover:bg-zinc-50 transition-colors"
                    onClick={() =>
                      setExpandedFile(expandedFile === file.id ? null : file.id)
                    }
                  >
                    <div className="w-9 h-9 bg-zinc-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Icon name={file.icon} size={16} className="text-zinc-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-zinc-900">{file.name}</p>
                        <span className="text-xs font-mono bg-zinc-100 text-zinc-400 px-1.5 py-0.5 rounded">
                          v{file.currentVersion}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 font-mono truncate">{file.packageName}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(file.id);
                        }}
                        className={`transition-colors ${
                          file.isFavorite
                            ? "text-zinc-900"
                            : "text-zinc-200 hover:text-zinc-400"
                        }`}
                      >
                        <Icon name="Star" size={14} />
                      </button>
                      <Icon
                        name="ChevronDown"
                        size={14}
                        className={`text-zinc-300 transition-transform duration-200 ${
                          expandedFile === file.id ? "rotate-180" : ""
                        }`}
                      />
                    </div>
                  </div>

                  {expandedFile === file.id && (
                    <div className="border-t border-zinc-100 bg-zinc-50/50 px-4 py-4 animate-fade-in">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs uppercase tracking-wider text-zinc-400 font-medium">
                          История версий
                        </p>
                        <div className="flex items-center gap-3 text-xs text-zinc-400">
                          <span>{file.size}</span>
                          <span className="text-zinc-200">·</span>
                          <span>{file.source}</span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        {file.versions.map((v, vi) => (
                          <div
                            key={v.version}
                            className={`flex items-center justify-between py-2 px-3 rounded-md transition-colors ${
                              vi === 0
                                ? "bg-white border border-zinc-200"
                                : "hover:bg-white/60"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                  vi === 0 ? "bg-zinc-900" : "border border-zinc-300"
                                }`}
                              />
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-mono font-medium text-zinc-700">
                                  v{v.version}
                                </span>
                                {v.notes && (
                                  <span className="text-xs text-zinc-400">{v.notes}</span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-zinc-400">
                              <span className="font-mono">{v.size}</span>
                              <span>{v.date}</span>
                              <button className="text-zinc-300 hover:text-zinc-700 transition-colors">
                                <Icon name="Download" size={12} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {filteredFiles.length === 0 && (
                <div className="text-center py-16 text-zinc-300">
                  <Icon name="Archive" size={32} className="mx-auto mb-3 opacity-40" />
                  <p className="text-sm">Ничего не найдено</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
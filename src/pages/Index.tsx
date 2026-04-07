import { useState, useEffect, useCallback } from "react";
import Icon from "@/components/ui/icon";

const PARSE_URL = "https://functions.poehali.dev/fc1e3d06-9e20-4633-977b-165ba595ec03";
const API_URL = "https://functions.poehali.dev/968a7a0b-6a7d-4002-81d7-a780a78ea12a";

type TabType = "search" | "downloads" | "library";

interface ApkVersion {
  version: string;
  date: string | null;
  size: string;
  notes?: string | null;
}

interface ApkFile {
  id: string;
  name: string;
  package_name: string;
  icon: string;
  current_version: string;
  size: string;
  source: string;
  download_date: string;
  is_favorite: boolean;
  url: string;
  versions: ApkVersion[];
}

interface Download {
  id: string;
  name: string;
  url: string;
  progress: number;
  status: "fetching" | "downloading" | "done" | "error";
  size: string;
  version: string;
}

async function api(action: string, extra: Record<string, unknown> = {}) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...extra }),
  });
  return res.json();
}

export default function Index() {
  const [activeTab, setActiveTab] = useState<TabType>("search");
  const [url, setUrl] = useState("");
  const [downloads, setDownloads] = useState<Download[]>([]);
  const [files, setFiles] = useState<ApkFile[]>([]);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showFavorites, setShowFavorites] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [loading, setLoading] = useState(true);

  const downloadToPhone = (url: string, name: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = name.endsWith(".apk") ? name : `${name}.apk`;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setOpenMenu(null);
  };

  useEffect(() => {
    if (!openMenu) return;
    const close = () => setOpenMenu(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [openMenu]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [filesRes, dlRes] = await Promise.all([
      api("get_files"),
      api("get_downloads"),
    ]);
    if (filesRes.files) setFiles(filesRes.files);
    if (dlRes.downloads) setDownloads(dlRes.downloads);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddUrl = async () => {
    if (!url.trim()) return;
    const inputUrl = url.trim();
    setUrl("");
    setFetching(true);
    setActiveTab("downloads");

    // 1. Сохраняем загрузку в БД
    const dlRes = await api("add_download", {
      name: inputUrl.split("/").filter(Boolean).pop() || "Приложение",
      url: inputUrl,
    });
    const dbId = dlRes.id?.toString() || Date.now().toString();

    // Оптимистичное обновление
    const tempDl: Download = {
      id: dbId,
      name: inputUrl.split("/").filter(Boolean).pop() || "Приложение",
      url: inputUrl,
      progress: 0,
      status: "fetching",
      size: "",
      version: "",
    };
    setDownloads((prev) => [tempDl, ...prev]);

    try {
      // 2. Парсим ссылку
      const parseRes = await fetch(PARSE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: inputUrl }),
      });
      const parsed = await parseRes.json();

      const parsedData = parsed.ok && parsed.data ? parsed.data : {};
      const name = parsedData.name || tempDl.name;
      const version = parsedData.version || "";
      const size = parsedData.size || "";

      // 3. Обновляем статус в БД
      await api("update_download", { id: dbId, name, version, size, status: "downloading", progress: 20 });

      setDownloads((prev) =>
        prev.map((d) =>
          d.id === dbId ? { ...d, name, version, size, status: "downloading", progress: 20 } : d
        )
      );

      // 4. Анимируем прогресс
      let progress = 20;
      const interval = setInterval(async () => {
        progress += Math.floor(Math.random() * 12) + 4;
        if (progress >= 100) {
          progress = 100;
          clearInterval(interval);
          await api("update_download", { id: dbId, progress: 100, status: "done" });
          setDownloads((prev) =>
            prev.map((d) => (d.id === dbId ? { ...d, progress: 100, status: "done" } : d))
          );
          // 5. Если файл распознан — добавляем в библиотеку
          if (parsedData.name) {
            const addRes = await api("add_file", {
              name: parsedData.name,
              packageName: parsedData.packageName || "",
              version: parsedData.version || "",
              size: parsedData.size || "",
              source: parsedData.source || "",
              url: inputUrl,
              icon: "Package",
            });
            if (addRes.ok) {
              const refreshed = await api("get_files");
              if (refreshed.files) setFiles(refreshed.files);
            }
          }
        } else {
          setDownloads((prev) =>
            prev.map((d) => (d.id === dbId ? { ...d, progress } : d))
          );
        }
      }, 600);
    } catch {
      await api("update_download", { id: dbId, status: "error" });
      setDownloads((prev) =>
        prev.map((d) => (d.id === dbId ? { ...d, status: "error" } : d))
      );
    } finally {
      setFetching(false);
    }
  };

  const toggleFavorite = async (id: string) => {
    const res = await api("toggle_favorite", { id });
    if (res.ok) {
      setFiles((prev) =>
        prev.map((f) => (f.id === id ? { ...f, is_favorite: res.isFavorite } : f))
      );
    }
  };

  const filteredFiles = files.filter((f) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      f.name.toLowerCase().includes(q) || f.package_name.toLowerCase().includes(q);
    const matchesFav = showFavorites ? f.is_favorite : true;
    return matchesSearch && matchesFav;
  });

  const activeDownloads = downloads.filter((d) => d.status === "downloading").length;

  const tabs: { id: TabType; label: string; icon: string; count?: number }[] = [
    { id: "search", label: "Поиск", icon: "Link" },
    { id: "downloads", label: "Загрузки", icon: "Download", count: activeDownloads || undefined },
    { id: "library", label: "Файлы", icon: "Archive", count: files.length || undefined },
  ];

  return (
    <div className="min-h-screen bg-white font-sans">
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
                    activeTab === tab.id ? "bg-white/20 text-white" : "bg-zinc-200 text-zinc-600"
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

        {/* SEARCH */}
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
                  <button onClick={() => setUrl("")} className="text-zinc-300 hover:text-zinc-500 transition-colors">
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
              <p className="text-xs text-zinc-400 mb-3 uppercase tracking-wider font-medium">Поддерживаемые источники</p>
              <div className="grid grid-cols-3 gap-2">
                {["APKMirror", "F-Droid", "APKPure", "Uptodown", "APKCombo", "GitHub Releases"].map((src) => (
                  <div key={src} className="px-3 py-2 border border-zinc-100 rounded text-xs text-zinc-500 text-center hover:border-zinc-200 transition-colors">
                    {src}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* DOWNLOADS */}
        {activeTab === "downloads" && (
          <div className="animate-fade-in">
            <div className="mb-8">
              <h1 className="text-2xl font-light text-zinc-900 mb-1 tracking-tight">Загрузки</h1>
              <p className="text-sm text-zinc-400">{downloads.length} файлов</p>
            </div>

            {loading ? (
              <div className="text-center py-16 text-zinc-300">
                <Icon name="Loader" size={24} className="mx-auto mb-3 animate-spin" />
              </div>
            ) : (
              <div className="space-y-2">
                {downloads.map((dl, i) => (
                  <div key={dl.id} className="border border-zinc-100 rounded-lg px-4 py-4 animate-fade-in" style={{ animationDelay: `${i * 50}ms` }}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-zinc-900">{dl.name}</p>
                        <p className="text-xs text-zinc-400 font-mono mt-0.5 truncate">{dl.url}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                        {dl.version && (
                          <span className="text-xs font-mono bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded">v{dl.version}</span>
                        )}
                        {dl.status === "done" && (
                          <div className="w-5 h-5 bg-zinc-900 rounded-full flex items-center justify-center">
                            <Icon name="Check" size={11} className="text-white" />
                          </div>
                        )}
                        {dl.status === "downloading" && <Icon name="Loader" size={15} className="text-zinc-400 animate-spin" />}
                        {dl.status === "fetching" && <Icon name="Globe" size={15} className="text-zinc-400 animate-pulse" />}
                        {dl.status === "error" && <Icon name="AlertCircle" size={15} className="text-red-400" />}
                      </div>
                    </div>

                    {(dl.status === "downloading" || dl.status === "fetching") && (
                      <div>
                        <div className="h-px bg-zinc-100 rounded-full overflow-hidden">
                          <div className="h-full bg-zinc-900 rounded-full transition-all duration-500" style={{ width: `${dl.progress}%` }} />
                        </div>
                        <div className="flex justify-between mt-1.5">
                          <span className="text-xs text-zinc-400">{dl.status === "fetching" ? "Получаем данные..." : `${dl.progress}%`}</span>
                          {dl.size && <span className="text-xs text-zinc-400">{dl.size}</span>}
                        </div>
                      </div>
                    )}

                    {dl.status === "done" && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-400">Загрузка завершена</span>
                        {dl.size && <span className="text-xs font-mono text-zinc-400">{dl.size}</span>}
                      </div>
                    )}

                    {dl.status === "error" && (
                      <span className="text-xs text-red-400">Не удалось загрузить файл</span>
                    )}
                  </div>
                ))}
                {downloads.length === 0 && (
                  <div className="text-center py-16 text-zinc-300">
                    <Icon name="Download" size={32} className="mx-auto mb-3 opacity-40" />
                    <p className="text-sm">Нет загрузок</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* LIBRARY */}
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

            {loading ? (
              <div className="text-center py-16 text-zinc-300">
                <Icon name="Loader" size={24} className="mx-auto mb-3 animate-spin" />
              </div>
            ) : (
              <div className="space-y-2">
                {filteredFiles.map((file, i) => (
                  <div key={file.id} className="border border-zinc-100 rounded-lg overflow-hidden animate-fade-in" style={{ animationDelay: `${i * 50}ms` }}>
                    <div
                      className="flex items-center gap-4 px-4 py-3.5 cursor-pointer hover:bg-zinc-50 transition-colors"
                      onClick={() => setExpandedFile(expandedFile === file.id ? null : file.id)}
                    >
                      <div className="w-9 h-9 bg-zinc-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Icon name={file.icon || "Package"} size={16} className="text-zinc-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-zinc-900">{file.name}</p>
                          {file.current_version && (
                            <span className="text-xs font-mono bg-zinc-100 text-zinc-400 px-1.5 py-0.5 rounded">
                              v{file.current_version}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-400 font-mono truncate">{file.package_name || file.source}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleFavorite(file.id); }}
                          className={`p-1 transition-colors ${file.is_favorite ? "text-zinc-900" : "text-zinc-200 hover:text-zinc-400"}`}
                        >
                          <Icon name="Star" size={14} />
                        </button>
                        <div className="relative">
                          <button
                            onClick={(e) => { e.stopPropagation(); setOpenMenu(openMenu === file.id ? null : file.id); }}
                            className="p-1 text-zinc-300 hover:text-zinc-600 transition-colors"
                          >
                            <Icon name="MoreHorizontal" size={16} />
                          </button>
                          {openMenu === file.id && (
                            <div
                              className="absolute right-0 top-7 z-20 bg-white border border-zinc-200 rounded-lg shadow-lg py-1 min-w-[170px] animate-fade-in"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                onClick={() => downloadToPhone(file.url, file.name)}
                                className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-50 transition-colors"
                              >
                                <Icon name="Smartphone" size={13} className="text-zinc-400" />
                                Скачать на телефон
                              </button>
                              <button
                                onClick={() => { window.open(file.url, "_blank"); setOpenMenu(null); }}
                                className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-50 transition-colors"
                              >
                                <Icon name="ExternalLink" size={13} className="text-zinc-400" />
                                Открыть источник
                              </button>
                            </div>
                          )}
                        </div>
                        <Icon
                          name="ChevronDown"
                          size={14}
                          className={`text-zinc-300 transition-transform duration-200 ${expandedFile === file.id ? "rotate-180" : ""}`}
                        />
                      </div>
                    </div>

                    {expandedFile === file.id && (
                      <div className="border-t border-zinc-100 bg-zinc-50/50 px-4 py-4 animate-fade-in">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-xs uppercase tracking-wider text-zinc-400 font-medium">История версий</p>
                          <div className="flex items-center gap-3 text-xs text-zinc-400">
                            {file.size && <span>{file.size}</span>}
                            {file.size && file.source && <span className="text-zinc-200">·</span>}
                            {file.source && <span>{file.source}</span>}
                          </div>
                        </div>
                        {file.versions && file.versions.length > 0 ? (
                          <div className="space-y-1">
                            {file.versions.map((v, vi) => (
                              <div
                                key={v.version}
                                className={`flex items-center justify-between py-2 px-3 rounded-md transition-colors ${vi === 0 ? "bg-white border border-zinc-200" : "hover:bg-white/60"}`}
                              >
                                <div className="flex items-center gap-3">
                                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${vi === 0 ? "bg-zinc-900" : "border border-zinc-300"}`} />
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-mono font-medium text-zinc-700">v{v.version}</span>
                                    {v.notes && <span className="text-xs text-zinc-400">{v.notes}</span>}
                                  </div>
                                </div>
                                <div className="flex items-center gap-4 text-xs text-zinc-400">
                                  {v.size && <span className="font-mono">{v.size}</span>}
                                  {v.date && <span>{v.date}</span>}
                                  <button className="text-zinc-300 hover:text-zinc-700 transition-colors">
                                    <Icon name="Download" size={12} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-zinc-400 text-center py-2">Версии не найдены</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {filteredFiles.length === 0 && (
                  <div className="text-center py-16 text-zinc-300">
                    <Icon name="Archive" size={32} className="mx-auto mb-3 opacity-40" />
                    <p className="text-sm">{searchQuery || showFavorites ? "Ничего не найдено" : "Нет скачанных файлов"}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
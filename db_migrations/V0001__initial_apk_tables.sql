CREATE TABLE IF NOT EXISTS t_p39447125_app_download_portal_.apk_files (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    package_name TEXT NOT NULL DEFAULT '',
    icon TEXT NOT NULL DEFAULT 'Package',
    current_version TEXT NOT NULL DEFAULT '',
    size TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT '',
    download_date DATE NOT NULL DEFAULT CURRENT_DATE,
    is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
    url TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS t_p39447125_app_download_portal_.apk_versions (
    id SERIAL PRIMARY KEY,
    file_id INTEGER NOT NULL REFERENCES t_p39447125_app_download_portal_.apk_files(id),
    version TEXT NOT NULL,
    size TEXT NOT NULL DEFAULT '',
    notes TEXT,
    released_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS t_p39447125_app_download_portal_.downloads (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'fetching',
    size TEXT NOT NULL DEFAULT '',
    version TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_apk_versions_file_id ON t_p39447125_app_download_portal_.apk_versions(file_id);
CREATE INDEX IF NOT EXISTS idx_downloads_status ON t_p39447125_app_download_portal_.downloads(status);

/**
 * JaferSQL v1.4.0 – Client‑side SQLite engine with cache integration
 * MIT License – Copyright (c) 2026 Jafer
 */
(function(global) {
  'use strict';

  const isWorker = typeof window === 'undefined' && typeof importScripts === 'function';
  const isBrowser = typeof window !== 'undefined';

  let config = {
    sqlJsUrl: 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.js',
    wasmLocateFile: null,
    useCache: false,
    cacheHelper: null
  };

  function JaferSQLError(message, cause) { this.name = 'JaferSQLError'; this.message = message; this.cause = cause; this.stack = (new Error()).stack; }
  JaferSQLError.prototype = Object.create(Error.prototype);
  function JaferLoadError(message, cause) { this.name = 'JaferLoadError'; this.message = message; this.cause = cause; this.stack = (new Error()).stack; }
  JaferLoadError.prototype = Object.create(JaferSQLError.prototype);
  function JaferInitError(message, cause) { this.name = 'JaferInitError'; this.message = message; this.cause = cause; this.stack = (new Error()).stack; }
  JaferInitError.prototype = Object.create(JaferSQLError.prototype);
  function JaferQueryError(message, cause, sql, params) { this.name = 'JaferQueryError'; this.message = message; this.cause = cause; this.sql = sql; this.params = params; this.stack = (new Error()).stack; }
  JaferQueryError.prototype = Object.create(JaferSQLError.prototype);

  let SQL = null;
  let loadingPromise = null;
  let progressCallbacks = [];

  function emitProgress(stage, detail) { progressCallbacks.forEach(cb => { try { cb(stage, detail); } catch(e) {} }); }

  async function resolveAssetUrls() {
    let jsUrl = config.sqlJsUrl;
    let wasmLocate = config.wasmLocateFile;
    if (config.useCache && isBrowser) {
      try {
        const cacheHelper = config.cacheHelper || (global.JaferSQLCache || null);
        if (cacheHelper && typeof cacheHelper.getCachedConfig === 'function') {
          emitProgress('cache', { message: 'Checking cache for assets' });
          const cached = await cacheHelper.getCachedConfig();
          jsUrl = cached.jsUrl;
          if (!wasmLocate) wasmLocate = (file) => cached.wasmUrl;
          emitProgress('cache', { message: 'Using cached assets' });
        }
      } catch(e) { emitProgress('cache', { message: 'Cache miss, falling back to CDN' }); }
    }
    return { jsUrl, wasmLocate };
  }

  function loadSqlJs() {
    if (SQL) { emitProgress('ready', { message: 'Already loaded' }); return Promise.resolve(SQL); }
    if (loadingPromise) return loadingPromise;
    emitProgress('loading', { message: 'Resolving asset URLs' });
    loadingPromise = resolveAssetUrls().then(({ jsUrl, wasmLocate }) => {
      return new Promise(function(resolve, reject) {
        if (isWorker) {
          try {
            emitProgress('loading', { message: 'Importing script in worker: ' + jsUrl });
            importScripts(jsUrl);
            if (self.initSqlJs) {
              const locateFile = wasmLocate || function(file) { const base = jsUrl.substring(0, jsUrl.lastIndexOf('/') + 1); return base + file; };
              self.initSqlJs({ locateFile }).then(sqlJs => { SQL = sqlJs; emitProgress('ready', { message: 'SQLite engine ready (worker)' }); resolve(SQL); }).catch(err => reject(new JaferLoadError('WASM initialisation failed in worker', err)));
            } else reject(new JaferLoadError('initSqlJs not exposed after importScripts'));
          } catch(e) { reject(new JaferLoadError('Failed to importScripts in worker: ' + e.message, e)); }
        } else if (isBrowser) {
          var script = document.createElement('script');
          script.src = jsUrl;
          script.onload = function() {
            emitProgress('wasm', { message: 'Script loaded, initialising WASM' });
            if (global.initSqlJs) {
              const locateFile = wasmLocate || function(file) { const base = jsUrl.substring(0, jsUrl.lastIndexOf('/') + 1); return base + file; };
              global.initSqlJs({ locateFile }).then(sqlJs => { SQL = sqlJs; emitProgress('ready', { message: 'SQLite engine ready' }); resolve(SQL); }).catch(err => reject(new JaferLoadError('WASM initialisation failed', err)));
            } else reject(new JaferLoadError('initSqlJs not exposed by sql.js'));
          };
          script.onerror = function() { reject(new JaferLoadError('Failed to load sql.js script from: ' + jsUrl)); };
          document.head.appendChild(script);
        } else reject(new JaferLoadError('Unsupported environment'));
      });
    });
    return loadingPromise;
  }

  function validateParams(params, sql) {
    if (params == null) return [];
    if (Array.isArray(params) || (typeof params === 'object' && params !== null)) return params;
    throw new JaferQueryError('Parameters must be an array or object, got ' + typeof params, null, sql, params);
  }

  function JaferDatabase(rawDb) { this._db = rawDb; this._closed = false; }
  JaferDatabase.prototype = {
    _checkOpen: function() { if (this._closed) throw new JaferQueryError('Database is closed'); },
    jaferExec: function(sql) { this._checkOpen(); try { return this._db.exec(sql); } catch(e) { throw new JaferQueryError('Execution failed', e, sql); } },
    jaferRun: function(sql, params) { this._checkOpen(); params = validateParams(params, sql); try { this._db.run(sql, params); return { changes: this._db.getRowsModified() }; } catch(e) { throw new JaferQueryError('Run failed', e, sql, params); } },
    jaferGet: function(sql, params) { this._checkOpen(); params = validateParams(params, sql); var stmt = null; try { stmt = this._db.prepare(sql); stmt.bind(params); if (stmt.step()) return stmt.getAsObject(); return null; } catch(e) { throw new JaferQueryError('Prepare/bind failed', e, sql, params); } finally { if (stmt) try { stmt.free(); } catch(e) {} } },
    jaferAll: function(sql, params) { this._checkOpen(); params = validateParams(params, sql); var stmt = null; try { stmt = this._db.prepare(sql); stmt.bind(params); var rows = []; while (stmt.step()) rows.push(stmt.getAsObject()); return rows; } catch(e) { throw new JaferQueryError('Prepare/bind failed', e, sql, params); } finally { if (stmt) try { stmt.free(); } catch(e) {} } },
    jaferExport: function() { this._checkOpen(); try { var data = this._db.export(); emitProgress('export', { bytes: data.length }); return data; } catch(e) { throw new JaferQueryError('Export failed', e); } },
    jaferImportSQL: function(sqlString) { this._checkOpen(); try { var statements = sqlString.split(';').map(s => s.trim()).filter(s => s.length); for (var i = 0; i < statements.length; i++) this._db.run(statements[i]); emitProgress('import', { statements: statements.length }); } catch(e) { throw new JaferQueryError('SQL import failed', e, sqlString); } },
    jaferExportJSON: function(tableOrQuery) { var sql = (tableOrQuery.toLowerCase().trim().startsWith('select')) ? tableOrQuery : 'SELECT * FROM ' + tableOrQuery; return JSON.stringify(this.jaferAll(sql), null, 2); },
    jaferExportCSV: function(tableOrQuery, delimiter) { delimiter = delimiter || ','; var sql = (tableOrQuery.toLowerCase().trim().startsWith('select')) ? tableOrQuery : 'SELECT * FROM ' + tableOrQuery; var rows = this.jaferAll(sql); if (rows.length === 0) return ''; var headers = Object.keys(rows[0]); var csvRows = [headers.join(delimiter)]; rows.forEach(row => { var values = headers.map(h => { var val = row[h]; if (typeof val === 'string' && (val.includes(delimiter) || val.includes('"'))) return '"' + val.replace(/"/g, '""') + '"'; return val; }); csvRows.push(values.join(delimiter)); }); return csvRows.join('\n'); },
    jaferPragma: function(pragmaName, value) { if (value !== undefined) { this.jaferRun('PRAGMA ' + pragmaName + ' = ' + value); return null; } var result = this.jaferAll('PRAGMA ' + pragmaName); return result.length === 1 ? result[0] : result; },
    jaferStats: function() { this._checkOpen(); var pageCount = this.jaferGet('PRAGMA page_count').page_count; var pageSize = this.jaferGet('PRAGMA page_size').page_size; var freelistCount = this.jaferGet('PRAGMA freelist_count').freelist_count; var totalBytes = pageCount * pageSize; return { pageCount, pageSize, freelistPages: freelistCount, totalBytes, usedBytes: (pageCount - freelistCount) * pageSize, freeBytes: freelistCount * pageSize, sizeKB: (totalBytes / 1024).toFixed(2) }; },
    jaferBackup: function() { this._checkOpen(); var data = this._db.export(); emitProgress('backup', { bytes: data.length }); return new JaferDatabase(new SQL.Database(data)); },
    jaferTransaction: function(callback) { this._checkOpen(); if (typeof callback !== 'function') throw new JaferQueryError('Transaction callback must be a function'); try { this._db.run('BEGIN'); var result = callback(this); this._db.run('COMMIT'); return result; } catch(e) { try { this._db.run('ROLLBACK'); } catch(rollbackErr) {} throw new JaferQueryError('Transaction failed, rolled back', e); } },
    jaferTables: function() { return this.jaferAll("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").map(r => r.name); },
    jaferVersion: function() { var row = this.jaferGet('SELECT sqlite_version() AS version'); return row ? row.version : ''; },
    jaferVacuum: function() { this._db.run('VACUUM'); emitProgress('vacuum', {}); },
    jaferClose: function() { if (this._closed) return; this._db.close(); this._closed = true; },
    _raw: function() { return this._db; }
  };

  var JaferSQL = {
    JaferSQLError, JaferLoadError, JaferInitError, JaferQueryError,
    version: '1.4.0',
    configure: function(options) { if (options.sqlJsUrl) config.sqlJsUrl = options.sqlJsUrl; if (options.wasmLocateFile) config.wasmLocateFile = options.wasmLocateFile; if (options.hasOwnProperty('useCache')) config.useCache = options.useCache; if (options.cacheHelper) config.cacheHelper = options.cacheHelper; },
    onProgress: function(cb) { progressCallbacks.push(cb); },
    offProgress: function(cb) { var idx = progressCallbacks.indexOf(cb); if (idx !== -1) progressCallbacks.splice(idx, 1); },
    jaferPreload: function() { return loadSqlJs().then(() => emitProgress('initialized', { message: 'Engine preloaded' })); },
    jaferInit: function(source) { return loadSqlJs().then(SqlJs => { emitProgress('initializing', { message: 'Creating database instance' }); var db = (source instanceof Uint8Array) ? new SqlJs.Database(source) : new SqlJs.Database(); emitProgress('initialized', { message: 'Database ready' }); return new JaferDatabase(db); }); },
    jaferIsLoaded: function() { return SQL !== null; },
    saveToOPFS: async function(db, filename) { if (!isBrowser) throw new Error('OPFS only in browser'); var data = db.jaferExport(); var root = await navigator.storage.getDirectory(); var fileHandle = await root.getFileHandle(filename, { create: true }); var writable = await fileHandle.createWritable(); await writable.write(data); await writable.close(); },
    loadFromOPFS: async function(filename) { if (!isBrowser) throw new Error('OPFS only in browser'); var root = await navigator.storage.getDirectory(); var fileHandle = await root.getFileHandle(filename); var file = await fileHandle.getFile(); var buffer = await file.arrayBuffer(); return this.jaferInit(new Uint8Array(buffer)); }
  };

  var globalObj = isBrowser ? window : self;
  globalObj.JaferSQL = JaferSQL;
})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : global);
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const basicAuth = require("basic-auth");
const crypto = require("crypto");

const app = express();
const PORT = Number(process.env.PORT) || 4000;

const USERNAME = process.env.BASIC_AUTH_USER || "ventas";
const PASSWORD = process.env.BASIC_AUTH_PASS || "Password123*";
const ROOT_DIR = process.env.ROOT_DIR || "E:/servidor-app-archivos";
const MAX_FILE_SIZE = Number(process.env.MAX_FILE_SIZE) || 15 * 1024 * 1024;

const ROOT_DIR_ABS = path.resolve(ROOT_DIR);

if (!fs.existsSync(ROOT_DIR_ABS)) {
  fs.mkdirSync(ROOT_DIR_ABS, { recursive: true });
}

const SHARE_ROOT = (() => {
  const explicit = String(process.env.SHARE_ROOT || "").trim();
  if (explicit) return explicit;
  const host = String(process.env.SHARE_HOST || process.env.COMPUTERNAME || "").trim();
  const shareName = String(process.env.SHARE_NAME || path.basename(ROOT_DIR_ABS) || "").trim();
  if (!host || !shareName) return "";
  return `\\\\${host}\\${shareName}`;
})();

function safeStringEqual(a, b) {
  const aBuf = Buffer.from(String(a), "utf8");
  const bBuf = Buffer.from(String(b), "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function authMiddleware(req, res, next) {
  // Ignorar auth básica si es la ruta externa (que tiene su propio token)
  // O si estamos consultando una imagen estática directamente (las fotos del front de Next.js)
  const p = req.path.toLowerCase();
  if (
    p.startsWith("/api/external-upload") || 
    p.startsWith("/api/vendedor/imagenes") || 
    p.startsWith("/files")
  ) {
    return next();
  }

  const user = basicAuth(req);

  const ok =
    user &&
    safeStringEqual(user.name, USERNAME) &&
    safeStringEqual(user.pass, PASSWORD);

  if (!ok) {
    res.set("WWW-Authenticate", 'Basic realm="Acceso restringido"');
    return res.status(401).send("Acceso no autorizado");
  }

  next();
}

function sanitizeFileName(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  const base = path.basename(fileName, ext);

  const cleanBase = base
    .replace(/[^\w\-. ]+/g, "_")
    .replace(/_+/g, "_")
    .trim();

  return `${Date.now()}_${cleanBase}${ext}`;
}

function isAllowedImage(fileName) {
  const allowedExt = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"];
  return allowedExt.includes(path.extname(fileName).toLowerCase());
}

function isAllowedUpload(file, originalname) {
  return true;
}

function normalizeRelativePath(inputPath) {
  if (!inputPath || typeof inputPath !== "string") return "";

  let p = inputPath.replace(/\\/g, "/").trim();

  if (p.startsWith("/")) p = p.slice(1);
  if (p.endsWith("/")) p = p.slice(0, -1);

  return p;
}

function resolveSafePath(relativePath = "") {
  const cleanRelative = normalizeRelativePath(relativePath);
  const resolved = path.resolve(ROOT_DIR_ABS, cleanRelative);
  const rel = path.relative(ROOT_DIR_ABS, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return resolved;
}

function toWebPath(relativePath = "") {
  return normalizeRelativePath(relativePath)
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
}

function toSharePath(relativePath = "") {
  const base = String(SHARE_ROOT || "").trim();
  if (!base) return null;
  const rel = normalizeRelativePath(relativePath).replace(/\//g, "\\");
  const b = base.endsWith("\\") ? base.slice(0, -1) : base;
  return rel ? `${b}\\${rel}` : b;
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Si viene de external-upload, usa req.body.currentPath o la ruta por defecto
    let cp = req.body.currentPath;
    
    // Si la ruta no viene en el body, aplica la por defecto
    if (req.path === "/api/external-upload" && cp === undefined) {
      cp = "Ponchados/Pendientes de aprobar";
    }

    // Si mandó una ruta y se llama 'Ponchados' exactamente, NO queremos que multer 
    // la sobreescriba. El valor se respeta tal cual (ej. "Ponchados/Serigrafia").
    
    const currentPath = normalizeRelativePath(cp || "");
    const targetDir = resolveSafePath(currentPath);

    if (!targetDir) {
      return cb(new Error("Ruta inválida"));
    }

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    cb(null, targetDir);
  },
  filename: function (req, file, cb) {
    cb(null, sanitizeFileName(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: function (req, file, cb) {
    if (!isAllowedUpload(file, file.originalname)) {
      return cb(new Error("Tipo de archivo no permitido"));
    }
    cb(null, true);
  }
});

// Middleware de CORS para permitir conexiones desde la app Next.js (u otras externas)
const corsMiddleware = (req, res, next) => {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, ngrok-skip-browser-warning");
  res.setHeader("Access-Control-Expose-Headers", "Content-Disposition, Content-Length");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  next();
};

app.use(corsMiddleware);

// Deshabilitamos la restricción general de SAMEORIGIN para las APIs y archivos estáticos
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Omitimos SAMEORIGIN en rutas de API para no interferir con el CORS del navegador
  if (!req.path.startsWith("/api/external-upload") && !req.path.startsWith("/api/vendedor/imagenes") && !req.path.startsWith("/files/")) {
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
  }
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

app.use(authMiddleware);
app.use(express.json());
app.use(
  express.static(path.join(__dirname, "public"), {
    etag: true,
    maxAge: 0,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-store");
      }
    }
  })
);

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
app.use(
  "/files",
  corsMiddleware,
  express.static(ROOT_DIR_ABS, {
    etag: true,
    maxAge: ONE_HOUR_MS,
    setHeaders: (res, filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      const isImage = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"].includes(ext);
      if (isImage) {
        res.setHeader("Cache-Control", `public, max-age=${Math.floor(ONE_WEEK_MS / 1000)}`);
      } else {
        const forceDownloadExt = [".html", ".htm", ".js", ".mjs", ".css", ".svg", ".json", ".xml", ".txt"];
        if (forceDownloadExt.includes(ext)) {
          res.setHeader("Content-Disposition", "attachment");
        }
      }
    }
  })
);

const sseClients = new Set();

function sseSend(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

app.get("/api/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  sseClients.add(res);
  sseSend(res, { type: "hello", at: Date.now() });

  const keepAlive = setInterval(() => {
    try {
      res.write("event: ping\ndata: {}\n\n");
    } catch (_) {}
  }, 25000);

  req.on("close", () => {
    clearInterval(keepAlive);
    sseClients.delete(res);
  });
});

let fsEventTimer = null;
const fsPendingPaths = new Set();

function flushFsEvents() {
  fsEventTimer = null;
  if (!fsPendingPaths.size) return;
  const paths = Array.from(fsPendingPaths);
  fsPendingPaths.clear();
  const payload = { type: "fs", at: Date.now(), paths };
  for (const client of sseClients) {
    try {
      sseSend(client, payload);
    } catch (_) {
      sseClients.delete(client);
    }
  }
}

function queueFsEvent(relativePath) {
  const rel = normalizeRelativePath(relativePath || "");
  if (rel) fsPendingPaths.add(rel);
  if (fsEventTimer) return;
  fsEventTimer = setTimeout(flushFsEvents, 250);
}

try {
  fs.watch(ROOT_DIR_ABS, { recursive: true }, (eventType, filename) => {
    if (!filename) return;
    const rel = filename.toString().replace(/\\/g, "/");
    queueFsEvent(rel);
  });
} catch (_) {
  try {
    fs.watch(ROOT_DIR_ABS, (eventType, filename) => {
      if (!filename) return;
      const rel = filename.toString().replace(/\\/g, "/");
      queueFsEvent(rel);
    });
  } catch (_) {}
}

app.get("/api/browse", (req, res) => {
  const currentPath = normalizeRelativePath(req.query.path || "");
  const absolutePath = resolveSafePath(currentPath);

  if (!absolutePath) {
    return res.status(400).json({ error: "Ruta inválida" });
  }

  if (!fs.existsSync(absolutePath)) {
    return res.status(404).json({ error: "La carpeta no existe" });
  }

  fs.readdir(absolutePath, { withFileTypes: true }, (err, entries) => {
    if (err) {
      return res.status(500).json({ error: "No se pudo leer la carpeta" });
    }

    const q = String(req.query.q || "").trim().toLowerCase();
    const folders = [];
    const files = [];

    for (const entry of entries) {
      const childRelativePath = currentPath
        ? `${currentPath}/${entry.name}`
        : entry.name;

      if (entry.isDirectory()) {
        folders.push({
          name: entry.name,
          path: childRelativePath,
          sharePath: toSharePath(childRelativePath)
        });
      } else {
        const isImage = isAllowedImage(entry.name);

        files.push({
          name: entry.name,
          path: childRelativePath,
          isImage,
          url: `/files/${toWebPath(childRelativePath)}`,
          sharePath: toSharePath(childRelativePath)
        });
      }
    }

    folders.sort((a, b) => a.name.localeCompare(b.name, "es"));
    files.sort((a, b) => a.name.localeCompare(b.name, "es"));

    const filteredFiles = q
      ? files.filter((f) => String(f.name || "").toLowerCase().includes(q))
      : files;

    const filesTotal = filteredFiles.length;
    const rawOffset = req.query.fileOffset;
    const rawLimit = req.query.fileLimit;
    const fileOffset =
      rawOffset === undefined ? 0 : Math.max(0, Number.parseInt(String(rawOffset), 10) || 0);
    const fileLimitRaw =
      rawLimit === undefined ? filesTotal : Number.parseInt(String(rawLimit), 10);
    const fileLimit = Math.min(
      filesTotal,
      Math.max(0, Number.isFinite(fileLimitRaw) ? fileLimitRaw : filesTotal)
    );

    const pagedFiles =
      rawOffset === undefined && rawLimit === undefined
        ? filteredFiles
        : filteredFiles.slice(fileOffset, fileOffset + fileLimit);
    const filesHasMore =
      rawOffset === undefined && rawLimit === undefined
        ? false
        : fileOffset + fileLimit < filesTotal;

    const breadcrumbs = [];
    const parts = currentPath ? currentPath.split("/") : [];

    breadcrumbs.push({ name: "DROPBOX", path: "" });

    let acc = "";
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part;
      breadcrumbs.push({ name: part, path: acc });
    }

    res.json({
      currentPath,
      breadcrumbs,
      parentPath: parts.length ? parts.slice(0, -1).join("/") : null,
      folders,
      foldersTotal: folders.length,
      files: pagedFiles,
      filesTotal,
      filesOffset: rawOffset === undefined && rawLimit === undefined ? 0 : fileOffset,
      filesLimit: rawOffset === undefined && rawLimit === undefined ? filesTotal : fileLimit,
      filesHasMore
    });
  });
});

app.post("/upload", upload.any(), (req, res) => {
  const currentPath = normalizeRelativePath(req.body.currentPath || "");
  const files = Array.isArray(req.files) ? req.files : [];

  if (!files.length) {
    return res.status(400).json({ error: "No se recibió ningún archivo" });
  }

  console.log("upload:request", {
    currentPath,
    count: files.length,
    items: files.map(f => ({ field: f.fieldname, original: f.originalname, saved: f.filename, size: f.size, type: f.mimetype }))
  });

  const items = files.map((f) => {
    const rel = currentPath ? `${currentPath}/${f.filename}` : f.filename;
    return {
      file: f.filename,
      original: f.originalname,
      url: `/files/${toWebPath(rel)}`
    };
  });

  const out = {
    ok: true,
    message: "Archivo(s) subido(s) correctamente",
    currentPath,
    count: items.length,
    items
  };
  console.log("upload:response", out);
  res.json(out);
});

// Endpoint exclusivo para subida desde apps externas
app.post("/api/external-upload", upload.any(), (req, res) => {
  // Verificación de seguridad básica (Token estático)
  const expectedToken = process.env.API_TOKEN || "Password123*";
  const providedToken = req.headers.authorization?.replace("Bearer ", "") || req.body.token;

  if (providedToken !== expectedToken) {
    return res.status(401).json({ error: "Token inválido o no proporcionado" });
  }

  // En external-upload siempre usamos lo que haya llegado en currentPath o el default.
  // Ya multer lo guardó bien gracias al orden del form-data, pero lo re-evaluamos para el JSON de salida.
  const cp = req.body.currentPath !== undefined ? req.body.currentPath : "Ponchados/Pendientes de aprobar";
  const currentPath = normalizeRelativePath(cp);
  const files = Array.isArray(req.files) ? req.files : [];

  if (!files.length) {
    return res.status(400).json({ error: "No se recibió ningún archivo" });
  }

  const items = files.map((f) => {
    const rel = currentPath ? `${currentPath}/${f.filename}` : f.filename;
    return {
      file: f.filename,
      original: f.originalname,
      url: `/files/${toWebPath(rel)}`
    };
  });

  res.json({
    ok: true,
    message: "Archivo(s) subido(s) desde app externa correctamente",
    currentPath,
    count: items.length,
    items
  });
});

// Endpoint para obtener imágenes de un vendedor específico
app.get("/api/vendedor/imagenes", (req, res) => {
  // 1. Verificación de seguridad
  const expectedToken = process.env.API_TOKEN || "Password123*";
  const providedToken = req.headers.authorization?.replace("Bearer ", "") || req.query.token;

  if (providedToken !== expectedToken) {
    return res.status(401).json({ error: "Token inválido o no proporcionado" });
  }

  // 2. Obtener y validar el correo del vendedor
  const email = (req.query.email || "").trim();
  if (!email) {
    return res.status(400).json({ error: "Debes proporcionar el email del vendedor" });
  }

  // Prevenir navegación fuera de la carpeta Bordados
  if (email.includes("/") || email.includes("\\") || email.includes("..")) {
    return res.status(400).json({ error: "Email inválido" });
  }

  // 3. Construir la ruta a Z:\Bordados\correo@dominio.com
  // En nuestro caso, la raíz del proyecto (ROOT_DIR_ABS) es E:\servidor-app-archivos
  // Entonces la ruta será ROOT_DIR_ABS + /Bordados/correo
  const currentPath = normalizeRelativePath(`Bordados/${email}`);
  const absolutePath = resolveSafePath(currentPath);

  if (!absolutePath) {
    return res.status(400).json({ error: "Ruta de vendedor inválida" });
  }

  // 4. Si la carpeta no existe, devolvemos un arreglo vacío (es válido que un vendedor no tenga fotos aún)
  if (!fs.existsSync(absolutePath)) {
    return res.json({
      ok: true,
      vendedor: email,
      count: 0,
      imagenes: []
    });
  }

  // 5. Leer la carpeta y filtrar solo imágenes
  fs.readdir(absolutePath, { withFileTypes: true }, (err, entries) => {
    if (err) {
      return res.status(500).json({ error: "Error al leer la carpeta del vendedor" });
    }

    const imagenes = [];

    for (const entry of entries) {
      if (!entry.isDirectory() && isAllowedImage(entry.name)) {
        const childRelativePath = `${currentPath}/${entry.name}`;
        imagenes.push({
          nombre: entry.name,
          url: `/files/${toWebPath(childRelativePath)}`,
          sharePath: toSharePath(childRelativePath)
        });
      }
    }

    // Opcional: Ordenar alfabéticamente
    imagenes.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

    res.json({
      ok: true,
      vendedor: email,
      count: imagenes.length,
      imagenes
    });
  });
});

app.post("/api/create-folder", (req, res) => {
  const currentPath = normalizeRelativePath(req.body.currentPath || "");
  const folderNameRaw = (req.body.folderName || "").trim();

  if (!folderNameRaw) {
    return res.status(400).json({ error: "Debes indicar el nombre de la carpeta" });
  }

  if (folderNameRaw.includes("/") || folderNameRaw.includes("\\") || folderNameRaw.includes("..")) {
    return res.status(400).json({ error: "Nombre de carpeta inválido" });
  }

  const safeFolderName = folderNameRaw.replace(/[<>:"|?*]+/g, "_").trim();
  if (!safeFolderName) {
    return res.status(400).json({ error: "Nombre de carpeta inválido" });
  }

  const baseDir = resolveSafePath(currentPath);
  if (!baseDir) {
    return res.status(400).json({ error: "Ruta actual inválida" });
  }

  const newFolderPath = path.join(baseDir, safeFolderName);

  try {
    fs.mkdirSync(newFolderPath, { recursive: false });
    const relativeNewPath = currentPath
      ? `${currentPath}/${safeFolderName}`
      : safeFolderName;

    res.json({
      ok: true,
      message: "Carpeta creada correctamente",
      path: relativeNewPath
    });
  } catch (error) {
    return res.status(400).json({ error: "No se pudo crear la carpeta. Puede que ya exista." });
  }
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ error: "El archivo excede el límite de 15 MB" });
  }

  if (err) {
    return res.status(400).json({ error: err.message || "Error al procesar la solicitud" });
  }

  next();
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor listo en puerto ${PORT}`);
  console.log(`Local: http://localhost:${PORT}`);
  console.log(`Raíz compartida: ${ROOT_DIR_ABS}`);
});

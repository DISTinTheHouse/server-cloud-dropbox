# Servidor de Archivos (Tipo Drive) — Guía para Developers

## Visión General
- App web en Node.js + Express para navegar, subir y gestionar archivos locales.
- Mini-agente Windows opcional que habilita abrir rutas UNC directamente desde el navegador (empresa-drive://).
- Actualización automática del listado de archivos mediante eventos de filesystem (watch + SSE).

## Rutas de Servidor (convención)
- Proyecto (código): E:\servidor-archivos
- Contenido compartido (edición de usuarios): E:\servidor-app-archivos
- Opcional (scripts/terminal ngrok): E:\command-app-archivos

## Requisitos
- Windows (Server o Workstation) con PowerShell.
- Node.js LTS (v18+ recomendado).
- Acceso a la red/LAN para los clientes.

## Instalación del Proyecto en el Servidor
```powershell
cd E:\servidor-archivos
npm install

$env:ROOT_DIR="E:\servidor-app-archivos"
$env:SHARE_HOST="SERVER"            # nombre del host del servidor
$env:SHARE_NAME="servidor-app-archivos"
$env:PORT=4000

# Crear carpeta de contenido si no existe
New-Item -ItemType Directory -Path $env:ROOT_DIR -Force | Out-Null

# Publicar el share de Windows (ejemplos de permisos)
New-SmbShare -Name "servidor-app-archivos" -Path "E:\servidor-app-archivos" -ChangeAccess "Usuarios autenticados"
# Alternativa rápida de pruebas:
# New-SmbShare -Name "servidor-app-archivos" -Path "E:\servidor-app-archivos" -FullAccess "Todos"

# (Opcional) Abrir puerto en firewall para acceso LAN
New-NetFirewallRule -DisplayName "Servidor Archivos 4000" -Direction Inbound -Protocol TCP -LocalPort 4000 -Action Allow

npm start
# Local: http://localhost:4000/
# LAN:   http://SERVER:4000/
# Auth:  ventas / Password123*
```

## Variables de Entorno (server.js)
- ROOT_DIR: carpeta raíz del contenido servido (ruta local del servidor).
- SHARE_HOST: nombre del servidor usado para construir la ruta UNC por defecto.
- SHARE_NAME: nombre del recurso compartido (UNC).
- PORT: puerto HTTP.
- MAX_FILE_SIZE: tamaño máximo por archivo subido (bytes), por defecto 15 MB.

Si no se define SHARE_ROOT explícitamente, el servidor deriva `\\SHARE_HOST\SHARE_NAME` para emitir `sharePath` y permitir “Abrir en PC”.

## Estructura de Publicación
- Carpeta `public/` servida por Express como frontend.
- Endpoint `/files` sirve el contenido de `ROOT_DIR` con cache-control para imágenes.
- Endpoint `/api/browse` lista carpetas/archivos y entrega `sharePath` (UNC) + `url` (HTTP).
- Endpoint `/api/events` (SSE) notifica cambios de filesystem para refrescar UI.
- Endpoint `/upload` admite subida de archivos (multer).

## Mini Agente (Windows)
- Ubicado en `agent/`:
  - `install-agent.ps1`: instala el protocolo `empresa-drive://` (por usuario HKCU o global HKLM con `-AllUsers`).
  - `agent.ps1`: recibe la URL y abre archivo/carpeta.
- El frontend usa el botón “Abrir en PC” que dispara `empresa-drive://open?path=\\SERVER\share\...`.

## Notas de Seguridad
- Basic Auth simple para proteger la app (usuario y pass en variables).
- No se guardan credenciales en el repositorio.
- Ajustar permisos del share a grupos/usuarios reales de la empresa.

## Troubleshooting Rápido
- SMB errores:
  - 85: unidad ya en uso → `net use Z: /delete /y`
  - 1219: múltiples credenciales → `net use * /delete /y` y limpiar “Administrador de credenciales”.
- Si el protocolo no abre:
  - Verificar registro: `reg query "HKCU\Software\Classes\empresa-drive"` y `...\shell\open\command`
  - Reiniciar Explorador o cerrar sesión.

## Exponer a Internet con ngrok (Cuenta de pago)

Como tienes una cuenta de pago y un dominio reservado, ya no cambiará tu URL.

1. Autentica tu agente (solo la primera vez):
   ```powershell
   ngrok config add-authtoken TU_TOKEN_AQUI
   ```

2. Arranca ngrok apuntando al puerto 4000 y usando tu dominio:
   ```powershell
   ngrok http --url=erpcloud.ngrok.app 4000
   ```

Tus APIs externas y el panel estarán siempre disponibles en:
- **`https://erpcloud.ngrok.app`**


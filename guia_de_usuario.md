# Guía de Usuario — Instalación y Uso en Máquinas de la Empresa

## Objetivo
- Abrir/editar/guardar archivos directamente en la carpeta compartida del servidor usando Wilcom/Corel/Explorer.
- Ver cambios reflejados en la web automáticamente.

## 1) Preparación del Servidor (administrador)
1. Carpeta de contenido: `E:\servidor-app-archivos`
2. Publicar el recurso compartido de Windows (SMB):
   ```powershell
   New-SmbShare -Name "servidor-app-archivos" -Path "E:\servidor-app-archivos" -ChangeAccess "Usuarios autenticados"
   ```
   - De pruebas rápidas: `-FullAccess "Todos"`
3. Levantar el servidor web:
   ```powershell
   cd E:\servidor-archivos
   npm install
   $env:ROOT_DIR="E:\servidor-app-archivos"
   $env:SHARE_HOST="SERVER"
   $env:SHARE_NAME="servidor-app-archivos"
   $env:PORT=4000
   npm start
   ```
4. Acceso:
   - Local: `http://localhost:4000/`
   - LAN:   `http://SERVER:4000/`
   - Usuario/Pass: `ventas / Password123*`

## 2) Instalación del Agente en cada PC (usuario)
El agente permite abrir directamente rutas UNC desde la web (empresa-drive://).

Opciones:
- Mapear la carpeta compartida y ejecutar el instalador desde ahí.

Pasos recomendados:
```powershell
# Conectar la carpeta compartida
net use Z: "\\SERVER\servidor-app-archivos"

# Ir a la carpeta del agente (si el servidor publicó el folder agent dentro del share)
cd Z:\agent

# Permitir scripts en esta sesión
Set-ExecutionPolicy Bypass -Scope Process -Force

# Instalar (HKCU; no requiere admin)
.\install-agent.ps1
```

Verificar el registro del protocolo:
```powershell
reg query "HKCU\Software\Classes\empresa-drive"
reg query "HKCU\Software\Classes\empresa-drive\shell\open\command"
```
Debe mostrar “URL Protocol” y el comando con `C:\EmpresaDrive\agent.ps1`.

Instalación para todos los usuarios (requiere PowerShell “Como Administrador”):
```powershell
.\install-agent.ps1 -AllUsers
```
Si aparece “Acceso denegado”, asegúrate de ejecutar PowerShell como Administrador.

## 3) Uso
- Entrar a la web de archivos y navegar hasta el archivo deseado.
- Pulsa “Abrir en PC”.
  - Se abrirá con la app asociada en tu equipo (Wilcom/Corel/Explorer).
  - Edita y guarda normalmente en `\\SERVER\servidor-app-archivos\...`.
- La web detecta cambios y actualiza automáticamente.

## 4) Comandos útiles (Windows)
- Ver recursos compartidos del servidor:
  ```powershell
  net view \\SERVER
  ```
- Mapear unidades:
  ```powershell
  net use Z: "\\SERVER\servidor-app-archivos"
  net use Y: "\\SERVER\servidor-archivos"
  ```
- Limpiar conexiones SMB:
  ```powershell
  net use * /delete /y
  ```
- Limpiar credenciales guardadas:
  ```powershell
  control /name Microsoft.CredentialManager
  ```
- Ver nombre del equipo y red:
  ```powershell
  $env:COMPUTERNAME
  hostname
  ipconfig
  ```

## 5) Problemas frecuentes
- Error 85 (unidad ya en uso): `net use Z: /delete /y`
- Error 1219 (credenciales múltiples): `net use * /delete /y` y borrar credenciales en “Administrador de credenciales”.
- El protocolo no abre:
  - Verificar los `reg query` anteriores.
  - Reiniciar “Explorador de Windows” desde el Administrador de tareas o cerrar sesión.
- Si el navegador bloquea la apertura:
  - La web copia la ruta UNC al portapapeles. Pégala en el Explorador y abre manualmente.


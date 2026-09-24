# Compartir la página y compilar PDF LaTeX

`http://127.0.0.1:8080` solo abre el servidor del equipo de quien visita el enlace. Para que otras personas entren por internet necesitas publicar tanto la web como el servicio que compila LaTeX.

Los visitantes podrán calcular, pulsar **Ver PDF LaTeX**, revisar el documento dentro de la página y elegir **Descargar PDF** o **Descargar .tex**. No necesitan instalar Node.js ni LaTeX. El compilador se ejecuta en el servidor. Algunos navegadores móviles no muestran PDF dentro de una página; en ese caso podrán usar **Abrir en otra pestaña** o descargarlo.

## Publicar por internet con Render

Se incluye un `Dockerfile` que reúne Node.js y TeX Live con los paquetes del reporte. Está preparado para desplegarse, pero no se ha publicado ni se ha validado la imagen Docker en este entorno.

1. Crea un repositorio de Git con estos archivos: `Dockerfile`, `.dockerignore`, `server.cjs`, `soil.js`, `latex.js`, `app.js`, `index.html`, `styles.css` y `relaciones-volumetricas.html`.
2. En Render crea **New → Web Service** y conecta ese repositorio.
3. Selecciona **Docker** como lenguaje y el `Dockerfile` de la raíz. El comando de inicio ya está incluido.
4. Elige un plan según el uso esperado y revisa su precio y límites antes de crearlo. La compilación consume memoria y CPU; no depende de un plan gratuito.
5. Crea el servicio. Render proporciona la dirección pública en `RENDER_EXTERNAL_URL`; el servidor la reconoce automáticamente. Si usas un dominio propio o un proveedor diferente, define `PUBLIC_ORIGIN` con la dirección exacta, por ejemplo `https://tus-suelos.example.com`, y `HOST=0.0.0.0`.
6. Cuando termine el despliegue, abre la dirección pública, carga el ejemplo y verifica la vista previa y la descarga. Después comparte esa dirección.

La página llama a `/api/pdf` en su propio dominio: los visitantes no necesitan conectarse a tu computadora. El servicio acepta hasta dos compilaciones simultáneas y devuelve un aviso cuando está ocupado. Los PDF se crean en carpetas temporales separadas y se eliminan del servidor tras enviarlos. No hay cuentas ni historial de reportes.

Documentación oficial: [Docker en Render](https://render.com/docs/docker), [servicios web](https://render.com/docs/web-services), [variables de entorno](https://render.com/docs/environment-variables).

## Compartir solo en una red Wi-Fi

En una terminal PowerShell dentro de la carpeta del proyecto:

```powershell
ipconfig
```

Busca la dirección IPv4 del adaptador Wi-Fi activo. Si fuera `192.168.1.25`, inicia así (sustituye la dirección por la de tu PC):

```powershell
$env:HOST = '0.0.0.0'
$env:PUBLIC_ORIGIN = 'http://192.168.1.25:8080'
node server.cjs
```

Comparte `http://192.168.1.25:8080` con equipos de esa misma red. Mantén tu PC y el servidor encendidos. Si Windows solicita acceso, permite Node.js en la red privada de confianza. Las redes con aislamiento entre dispositivos pueden impedir la conexión. Esto no crea una dirección pública en internet.

Para regresar al uso local en esa terminal:

```powershell
Remove-Item Env:HOST -ErrorAction SilentlyContinue
Remove-Item Env:PUBLIC_ORIGIN -ErrorAction SilentlyContinue
```

## Aplicar los cambios localmente

Detén el servidor con Ctrl+C, vuelve a abrir `iniciar-web.cmd` y recarga el navegador con Ctrl+F5. Esto carga el nuevo diagrama y la vista previa.

# Chronos Hand — Control de Timelapse por Gestos

Controla el tiempo con tus manos. **Chronos Hand** es una experiencia interactiva que te permite reproducir, pausar y avanzar videos en formato timelapse juntando o separando tus dedos en el aire, sin necesidad de tocar la pantalla. 

Esta aplicación ha sido desarrollada por **Cucli Labs** y **Juan Silva**.

---

## 🚀 Características

- **Control de reproducción por gestos:** Avanza y retrocede en el tiempo del video (scrubbing) ajustando la distancia entre el pulgar y el índice en tiempo real.
- **Calibración interactiva:** Permite adaptar el sistema a la fisionomía de tu mano configurando los valores mínimos (pellizco cerrado) y máximos (mano extendida) de detección.
- **Filtro de suavizado:** Implementa un filtro de paso bajo ajustable para suavizar las fluctuaciones de distancia y evitar saltos abruptos en el video.
- **Carga de videos locales:** Arrastra y suelta (Drag & Drop) o selecciona tus propios archivos de video (`.mp4`, `.webm`, o `.mov`) para controlarlos con gestos.
- **Interfaz inmersiva:** Diseño premium a pantalla completa con previsualización flotante de la webcam y panel de HUD interactivo con visualización de FPS y estado de detección.

---

## 🛠️ Tecnologías utilizadas

- **Core & Logic:** HTML5 Semántico, Javascript moderno (ES modules).
- **Estilos:** Vanilla CSS (con un diseño futurista, soporte para temas oscuros y transiciones fluidas).
- **Reconocimiento de gestos:** [Google MediaPipe Tasks Vision (`HandLandmarker`)](https://developers.google.com/mediapipe/solutions/vision/hand_landmarker) para el seguimiento de puntos de referencia de la mano en 3D a través de la webcam.
- **Entorno de desarrollo:** [Vite](https://vite.dev/) para un empaquetado ultra rápido y recarga en caliente en desarrollo.

---

## 💻 Instalación y ejecución local

Sigue estos pasos para ejecutar el proyecto en tu entorno local:

### Requisitos previos

Asegúrate de tener instalado [Node.js](https://nodejs.org/) (versión 18 o superior recomendada).

### Pasos

1. **Instalar las dependencias:**
   ```bash
   npm install
   ```

2. **Iniciar el servidor de desarrollo:**
   ```bash
   npm run dev
   ```

3. **Abrir en el navegador:**
   Visita la URL local que se muestra en tu terminal (generalmente `http://localhost:5173`).

4. **Compilar para producción:**
   Si deseas construir el bundle optimizado para desplegar en producción:
   ```bash
   npm run build
   ```
   Los archivos estáticos se generarán en la carpeta `dist`.

---

## 🤚 ¿Cómo funciona el control gestual?

1. **Activa la cámara:** Presiona el botón "Activar Cámara" en el panel lateral o el panel de ajustes. Concede los permisos necesarios en tu navegador.
2. **Calibra tu mano:**
   - Abre el panel de **Ajustes** y ve a la sección de **Calibración**.
   - Junta tus dedos pulgar e índice (pellizco) frente a la cámara y haz clic en **Calibrar Cerrado**.
   - Separa o extiende tus dedos y haz clic en **Calibrar Abierto**.
3. **Controla el timelapse:**
   - Una vez calibrado, al juntar los dedos el video volverá al principio o avanzará poco.
   - Conforme separes los dedos, el video avanzará de forma proporcional hacia el final.
   - El sistema recordará tus rangos y suavizará el movimiento para una experiencia fluida.

---

## 📄 Licencia

Este proyecto está bajo la Licencia **MIT**. Consulta el archivo [LICENSE](file:///Users/juansilva/Dev/Karens/Flores/LICENSE) para obtener más detalles.

# Evaluación Parcial de Desarrollo Móvil (V2): Red Social Estilo Instagram (Arquitectura, Rendimiento y Concurrencia)

## 1\. Contexto y Propósito del Proyecto

Este proyecto reta a los estudiantes a diseñar, construir y desplegar un clon funcional de una red social a gran escala (excluyendo videos), priorizando la ingeniería de cliente sobre la estética superficial. El desarrollo simula un entorno de producción real donde se evalúa la capacidad de la aplicación para soportar alta densidad de interacciones, gestión eficiente de memoria en dispositivos móviles con recursos limitados, y consistencia de datos ante escenarios de conectividad intermitente.

Las redes sociales modernas exigen una arquitectura robusta basada en capas limpias (Clean Architecture), separación estricta de responsabilidades entre la UI, los servicios de red y las fuentes de datos locales, así como un dominio absoluto del ciclo de vida del software móvil.

---

## 2\. Módulos y Requisitos Técnicos Obligatorios

### Módulo 1: Feed Principal y Sistema de Publicaciones

* **Interfaz y Navegación:** Recreación fiel de la barra de navegación inferior persistente, diseño tipográfico y jerarquía visual de perfiles, publicaciones y comentarios.  
* **Acciones Core:** Creación y publicación de posts con imágenes estáticas, sistema dinámico de *Likes*, sección anidada de comentarios en tiempo real y opciones de compartir enlaces o referencias internas.  
* **Privacidad de Cuentas:** Soporte para perfiles públicos y privados. En cuentas privadas, el acceso al contenido multimedia y a la lista de seguidores/seguidos requiere un flujo formal de solicitud, aprobación o rechazo de seguimiento gestionado mediante reglas de seguridad en el backend.

### Módulo 2: Motor de Caché de Imágenes y Rendimiento (60 FPS)

* **Caché de Dos Niveles:** Prohibido el uso de librerías automáticas de carga de imágenes sin control. Los estudiantes deben implementar un motor de caché propio o configurar estrictamente un sistema de dos niveles (Memoria RAM y Disco Local) con política de desalojo LRU (*Least Recently Used*).  
* **Optimización de Memoria y Reciclaje:** El *Feed* debe mantener un rendimiento fluido de 60 FPS durante el desplazamiento (*scroll*) continuo de listas largas. Se debe implementar cancelación automática de peticiones de descarga de imágenes cuando una celda sale del viewport de la pantalla, evitando fugas de memoria (*memory leaks*) y cierres abruptos por parte del sistema operativo (*OutOfMemory*).

### Módulo 3: UI Optimista y Arquitectura Offline-First

* **Acciones Instantáneas:** Las interacciones críticas como dar *like* o publicar un comentario deben reflejarse inmediatamente en la interfaz de usuario (latencia percibida de 0 ms), simulando una respuesta síncrona.  
* **Cola de Sincronización en Background:** Las peticiones de red deben encapsularse en una cola de sincronización local utilizando una base de datos embebida (Room / CoreData / SQLite). Si el dispositivo pierde la conexión a internet, las acciones se almacenan y se procesan en segundo plano en riguroso orden cronológico tan pronto como la conectividad se restablezca, resolviendo conflictos de estado sin corromper la base de datos remota.

### Módulo 4: Mensajería Directa (DMs) en Tiempo Real

* **Comunicación Bidireccional:** Integración de un chat privado integrado mediante WebSockets (Supabase Realtime).  
* **Indicadores de Estado Avanzados:** Sincronización de eventos de typing ("Escribiendo..."), confirmación de entrega y lectura ("Visto"), además del reordenamiento automático de la bandeja de entrada según la cronología del último mensaje recibido.

### Módulo 5: Navegación Anidada, Deep Linking e Historias (Stories)

* **Navegación por Pestañas Independientes:** Cada pestaña principal (Home, Explorar, Actividad, Perfil) debe mantener su propia pila de navegación (*Navigation Stack*) sin corromper el estado global.  
* **Deep Linking Profundo:** Intercepción de esquemas de URL personalizados (ej: `instagramclone://post/{uuid}`) para abrir la aplicación directamente en la vista solicitada.  
* **Módulo de Historias Efímeras (24h):** Visualización horizontal de avatares con apertura a pantalla completa, barras de progreso de reproducción automática, pausa interactiva al mantener presionado el dedo sobre la pantalla y persistencia local de estado "visto".

---

## 3\. Metodología de Evaluación y Defensa Técnica (Sostenibilidad del Código)

La nota final de este parcial no se obtiene únicamente de la revisión del código fuente o la ejecución del prototipo. Con el fin de garantizar la autoría individual y el dominio técnico colectivo, se llevará a cabo una **sesión de defensa presencial obligatoria** para cada grupo bajo las siguientes reglas estrictas:

* **Dinámica de Preguntas Aleatorias:** Durante la defensa, el profesor asignará **5 preguntas de manera completamente aleatoria** a los diferentes integrantes del grupo. Ningún estudiante puede responder por otro; cada pregunta se dirige a una persona específica elegida en el momento.  
* **Escala de Calificación por Pregunta:** Cada una de las 5 preguntas se evaluará estrictamente bajo la siguiente escala cualitativa y su impacto porcentual en la nota final del parcial:  
  1. **No supo responder (0% de nota):** El estudiante demuestra desconocimiento total de la arquitectura, fragmentos de código, flujos de datos o decisiones técnicas implementadas en el submódulo consultado. Evidencia falta de participación o dependencia exclusiva de código ajeno/generado sin comprensión.  
  2. **Respondió parcialmente (50% de nota):** El estudiante conoce el propósito general del código o sabe localizarlo en el repositorio, pero no logra explicar los fundamentos de ingeniería de software, patrones de diseño, gestión de concurrencia, manejo de memoria o resolución de excepciones asociados a la pregunta.  
  3. **Respondió perfecto (100% de nota):** El estudiante explica con rigor técnico absoluto el funcionamiento interno, justifica las decisiones arquitectónicas, detalla el manejo de hilos (UI Thread vs. Background Threads), describe la gestión de estados y responde con solvencia a las contrapreguntas del docente.  
* **Impacto Global en la Nota:** Las 5 preguntas aleatorias tienen un peso determinante sobre la calificación final del proyecto. Un grupo puede presentar una interfaz impecable y una base de código extensa, pero si sus integrantes no logran defender técnicamente su solución durante la evaluación oral, su nota final se verá drásticamente castigada.